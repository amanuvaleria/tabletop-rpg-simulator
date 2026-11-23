import { useBoardStore } from "../store";
import { rpc } from "../multiplayer";
import type { AssetDef, LayerId, SpriteData } from "../types";
import { clientToGround, layerForAsset, snapTo, spriteSize } from "./helpers";

/**
 * Edição de sprites (só o Mestre). Toda mudança é um "lote" (SpriteOp):
 * aplica na hora na tela, envia ao servidor (que valida e retransmite) e entra no histórico.
 */
export interface SpriteOp {
  add?: SpriteData[];
  update?: { id: string; patch: Partial<SpriteData> }[];
  remove?: string[];
}

interface Entry {
  redo: SpriteOp;
  undo: SpriteOp;
  key?: string;
  at: number;
}

const MAX_HISTORY = 100;
const undoStack: Entry[] = [];
const redoStack: Entry[] = [];

const st = () => useBoardStore.getState();
const syncDepth = () => st().setHistoryDepth(undoStack.length, redoStack.length);

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  syncDepth();
}

// ---------------------------------------------------------------- aplicar local

export function applyLocal(op: SpriteOp) {
  const s = st();
  let sprites = s.sprites;
  if (op.remove?.length) {
    const rm = new Set(op.remove);
    sprites = sprites.filter((x) => !rm.has(x.id));
  }
  if (op.add?.length) {
    const have = new Set(sprites.map((x) => x.id));
    sprites = [...sprites, ...op.add.filter((a) => !have.has(a.id))];
  }
  if (op.update?.length) {
    const m = new Map(op.update.map((u) => [u.id, u.patch]));
    sprites = sprites.map((x) => (m.has(x.id) ? { ...x, ...m.get(x.id)! } : x));
  }
  const alive = new Set(sprites.map((x) => x.id));
  useBoardStore.setState({
    sprites,
    selectedSpriteIds: s.selectedSpriteIds.filter((id) => alive.has(id)),
  });
}

/** Desfaz o lote: para cada coisa que ele muda, guarda o valor de antes. */
function inverseOf(op: SpriteOp): SpriteOp {
  const byId = new Map(st().sprites.map((x) => [x.id, x]));
  const inv: SpriteOp = {};
  if (op.add?.length) inv.remove = op.add.map((a) => a.id);
  if (op.remove?.length) inv.add = op.remove.map((id) => byId.get(id)).filter((x): x is SpriteData => !!x);
  if (op.update?.length) {
    inv.update = op.update
      .map((u) => {
        const cur = byId.get(u.id);
        if (!cur) return null;
        const prev: Record<string, unknown> = {};
        for (const k of Object.keys(u.patch)) prev[k] = (cur as unknown as Record<string, unknown>)[k];
        return { id: u.id, patch: prev as Partial<SpriteData> };
      })
      .filter((x): x is { id: string; patch: Partial<SpriteData> } => !!x);
  }
  return inv;
}

// ---------------------------------------------------------------- enviar ao servidor

interface BatchRes {
  ok: boolean;
  error?: string;
  rejected?: { id?: string; reason: string; current?: SpriteData | null }[];
  authoritative?: SpriteData[];
  removed?: string[];
}

let sendChain: Promise<unknown> = Promise.resolve();

/** Envia em ordem (um de cada vez) e reconcilia com o que o servidor realmente aceitou. */
export function sendOp(op: SpriteOp) {
  sendChain = sendChain
    .then(async () => {
      const res = await rpc<BatchRes>("sprite:batch", op);
      if (!res.ok) {
        st().setNotice(res.error || "O servidor recusou a alteração.");
        return;
      }
      // valores finais (o servidor limita escala, posição etc.)
      if (res.authoritative?.length || res.removed?.length) {
        const m = new Map((res.authoritative ?? []).map((x) => [x.id, x]));
        useBoardStore.setState((s) => ({
          sprites: s.sprites.map((x) => m.get(x.id) ?? x).filter((x) => !(res.removed ?? []).includes(x.id)),
        }));
      }
      if (res.rejected?.length) {
        // desfaz na tela o que o servidor não aceitou (ex.: sprite bloqueado)
        const fix: SpriteOp = { add: [], remove: [] };
        const upd: SpriteData[] = [];
        for (const r of res.rejected) {
          if (!r.id) continue;
          if (r.current) upd.push(r.current);
          else fix.remove!.push(r.id);
        }
        useBoardStore.setState((s) => {
          const m = new Map(upd.map((x) => [x.id, x]));
          const have = new Set(s.sprites.map((x) => x.id));
          const rm = new Set(fix.remove);
          return {
            sprites: [...s.sprites.map((x) => m.get(x.id) ?? x).filter((x) => !rm.has(x.id)), ...upd.filter((x) => !have.has(x.id))],
          };
        });
        const why = [...new Set(res.rejected.map((r) => r.reason))].join(", ");
        st().setNotice(`${res.rejected.length} alteração(ões) não aplicada(s): ${why}. Desbloqueie antes de editar.`);
      }
    })
    .catch((e: Error) => st().setNotice(e.message));
}

// ---------------------------------------------------------------- executar + histórico

/**
 * Executa uma operação com desfazer. `coalesce` junta ações seguidas do mesmo tipo
 * (ex.: segurar a seta do teclado) em uma só entrada do histórico.
 */
export function exec(op: SpriteOp, coalesce?: string) {
  const undo = inverseOf(op);
  applyLocal(op);
  sendOp(op);
  const last = undoStack[undoStack.length - 1];
  if (coalesce && last && last.key === coalesce && Date.now() - last.at < 700) {
    last.redo = op;
    last.at = Date.now();
  } else {
    undoStack.push({ redo: op, undo, key: coalesce, at: Date.now() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  redoStack.length = 0;
  syncDepth();
}

/** Registra no histórico uma mudança que já foi aplicada (arrastar: a tela atualiza ao vivo). */
export function recordMove(startPositions: Map<string, [number, number]>) {
  const s = st();
  const update: { id: string; patch: Partial<SpriteData> }[] = [];
  const undoUpdate: { id: string; patch: Partial<SpriteData> }[] = [];
  for (const [id, from] of startPositions) {
    const cur = s.sprites.find((x) => x.id === id);
    if (!cur || (cur.position[0] === from[0] && cur.position[1] === from[1])) continue;
    update.push({ id, patch: { position: cur.position } });
    undoUpdate.push({ id, patch: { position: from } });
  }
  if (!update.length) return;
  sendOp({ update });
  undoStack.push({ redo: { update }, undo: { update: undoUpdate }, at: Date.now() });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  syncDepth();
}

export function undo() {
  const e = undoStack.pop();
  if (!e) return;
  applyLocal(e.undo);
  sendOp(e.undo);
  redoStack.push(e);
  syncDepth();
}

export function redo() {
  const e = redoStack.pop();
  if (!e) return;
  applyLocal(e.redo);
  sendOp(e.redo);
  undoStack.push(e);
  syncDepth();
}

// ---------------------------------------------------------------- comandos de alto nível

const step = () => st().cellSize / 2;

function layerState(id: LayerId) {
  return st().layers.find((l) => l.id === id);
}

export function selectedSprites(): SpriteData[] {
  const ids = new Set(st().selectedSpriteIds);
  return st().sprites.filter((x) => ids.has(x.id));
}

/** Sprites que podem ser alterados (nem o sprite nem a camada estão bloqueados). */
export function editableSelected(): SpriteData[] {
  return selectedSprites().filter((x) => !x.locked && !layerState(x.layer)?.locked);
}

export function patchSelected(patch: Partial<SpriteData> | ((s: SpriteData) => Partial<SpriteData>), coalesce?: string) {
  const list = editableSelected();
  if (!list.length) return notifyLocked();
  exec({ update: list.map((s) => ({ id: s.id, patch: typeof patch === "function" ? patch(s) : patch })) }, coalesce);
}

function notifyLocked() {
  if (selectedSprites().length) st().setNotice("Os itens selecionados estão bloqueados (sprite ou camada).");
}

/** Cria um sprite do asset. Sem posição: usa o centro da tela (ou a origem). */
export function placeAsset(asset: AssetDef, at?: [number, number]) {
  const s = st();
  const layer: LayerId = s.activeLayer === "auto" ? layerForAsset(asset) : s.activeLayer;
  if (layerState(layer)?.locked) {
    s.setNotice("A camada de destino está bloqueada. Desbloqueie na aba Camadas.");
    return;
  }
  const canvas = document.querySelector("canvas");
  const r = canvas?.getBoundingClientRect();
  let pos = at ?? (r ? clientToGround(r.left + r.width / 2, r.top + r.height / 2) : null) ?? [0, 0];
  const grid = s.snapGrid ? step() : 0;
  if (grid) pos = [snapTo(pos[0], grid), snapTo(pos[1], grid)];
  // não empilha exatamente em cima de outro sprite do mesmo asset
  while (s.sprites.some((x) => x.asset === asset.id && x.position[0] === pos[0] && x.position[1] === pos[1])) {
    pos = [pos[0] + step(), pos[1] + step()];
  }
  const z = s.sprites.filter((x) => x.layer === layer).reduce((m, x) => Math.max(m, x.z), -1) + 1;
  const sprite: SpriteData = {
    id: crypto.randomUUID(),
    asset: asset.id,
    layer,
    position: pos,
    rotation: 0,
    scale: 1,
    opacity: asset.opacity ?? 1,
    flipX: false,
    flipY: false,
    locked: false,
    z,
  };
  exec({ add: [sprite] });
  s.selectSprites([sprite.id]);
}

export function duplicateSelected() {
  const list = selectedSprites();
  if (!list.length) return;
  const s = st();
  const d = step();
  const maxZ = new Map<string, number>();
  for (const x of s.sprites) maxZ.set(x.layer, Math.max(maxZ.get(x.layer) ?? -1, x.z));
  const copies: SpriteData[] = list.map((x, i) => ({
    ...x,
    id: crypto.randomUUID(),
    position: [x.position[0] + d, x.position[1] + d],
    locked: false,
    z: (maxZ.get(x.layer) ?? 0) + 1 + i,
  }));
  exec({ add: copies });
  s.selectSprites(copies.map((c) => c.id));
}

export function deleteSelected() {
  const list = editableSelected();
  if (!list.length) return notifyLocked();
  exec({ remove: list.map((x) => x.id) });
}

export function nudgeSelected(dx: number, dz: number) {
  patchSelected((x) => ({ position: [x.position[0] + dx, x.position[1] + dz] }), "nudge");
}

export function rotateSelected(rad: number) {
  patchSelected((x) => ({ rotation: x.rotation + rad }), "rotate");
}

export function scaleSelected(factor: number) {
  patchSelected((x) => ({ scale: Math.max(0.05, Math.min(20, x.scale * factor)) }), "scale");
}

export function flipSelected(axis: "x" | "y") {
  patchSelected((x) => (axis === "x" ? { flipX: !x.flipX } : { flipY: !x.flipY }));
}

export function toggleLockSelected() {
  const list = selectedSprites().filter((x) => !layerState(x.layer)?.locked);
  if (!list.length) return notifyLocked();
  const lock = !list.every((x) => x.locked);
  exec({ update: list.map((x) => ({ id: x.id, patch: { locked: lock } })) });
}

/** Ordem de desenho dentro da camada. */
export function reorderSelected(mode: "front" | "back" | "up" | "down") {
  const list = editableSelected();
  if (!list.length) return notifyLocked();
  const all = st().sprites;
  const sorted = [...list].sort((a, b) => a.z - b.z);
  if (mode === "up" || mode === "down") {
    const d = mode === "up" ? 1 : -1;
    return exec({ update: sorted.map((x) => ({ id: x.id, patch: { z: x.z + d } })) }, "reorder");
  }
  const layerVals = (l: string) => all.filter((x) => x.layer === l).map((x) => x.z);
  exec({
    update: sorted.map((x, i) => ({
      id: x.id,
      patch: { z: mode === "front" ? Math.max(...layerVals(x.layer)) + 1 + i : Math.min(...layerVals(x.layer)) - sorted.length + i },
    })),
  });
}

export function moveSelectedToLayer(layer: LayerId) {
  if (layerState(layer)?.locked) return st().setNotice("A camada de destino está bloqueada.");
  patchSelected({ layer });
}

export function selectAllEditable() {
  const s = st();
  s.selectSprites(s.sprites.filter((x) => !x.locked && !layerState(x.layer)?.locked).map((x) => x.id));
}

export function selectLayer(layer: LayerId) {
  const s = st();
  s.selectSprites(s.sprites.filter((x) => x.layer === layer).map((x) => x.id));
}

export async function setLayer(id: LayerId, patch: { visible?: boolean; locked?: boolean }) {
  useBoardStore.getState().patchLayer(id, patch);
  try {
    const r = await rpc<{ ok: boolean; error?: string }>("layer:update", { id, patch });
    if (!r.ok) st().setNotice(r.error || "Falhou ao alterar a camada.");
  } catch (e) {
    st().setNotice((e as Error).message);
  }
}

export { spriteSize };

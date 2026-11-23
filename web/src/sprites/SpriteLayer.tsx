import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBoardStore } from "../store";
import { LAYER_META } from "../types";
import type { AssetDef, SpriteData } from "../types";
import { getAssetTexture, getMissingTexture } from "./textures";
import { rayToGround, setGroundFromClient, snapTo, spriteSize } from "./helpers";
import { recordMove, sendOp } from "./actions";

const PLANE = new THREE.PlaneGeometry(1, 1);
const OUTLINE = new THREE.EdgesGeometry(PLANE);
const LAYER_INDEX = new Map(LAYER_META.map((l, i) => [l.id, i]));
// Efeitos e iluminação brilham por conta própria (não escurecem com o clima); o resto recebe a luz da cena.
const UNLIT = new Set(["effects", "lighting"]);

interface ItemProps {
  sprite: SpriteData;
  asset: AssetDef | undefined;
  cellSize: number;
  isGm: boolean;
  ghost: boolean; // camada oculta (só o Mestre vê, esmaecida)
  selected: boolean;
  layerLocked: boolean;
  onDown: (e: ThreeEvent, sprite: SpriteData) => void;
}
type ThreeEvent = { stopPropagation: () => void; shiftKey?: boolean; nativeEvent: PointerEvent; ctrlKey?: boolean };

function useTexture2(asset: AssetDef | undefined) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    setTex(null);
    if (asset) void getAssetTexture(asset).then((t) => alive && setTex(t));
    return () => {
      alive = false;
    };
  }, [asset]);
  return tex;
}

const SpriteItem = memo(function SpriteItem({ sprite, asset, cellSize, isGm, ghost, selected, layerLocked, onDown }: ItemProps) {
  const tex = useTexture2(asset);
  const missing = !asset;
  const [w, h] = spriteSize(asset, cellSize);
  const opacity = ghost ? Math.min(sprite.opacity, 0.35) : sprite.opacity;
  const layerIdx = LAYER_INDEX.get(sprite.layer) ?? 0;

  const missingTex = useMemo(() => (missing ? getMissingTexture(sprite.asset.split("/").pop() || sprite.asset) : null), [missing, sprite.asset]);
  const map = missing ? missingTex : tex;

  const material = useMemo(() => {
    if (!map) return null;
    const common = { map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide } as const;
    return UNLIT.has(sprite.layer) && !missing
      ? new THREE.MeshBasicMaterial(common)
      : new THREE.MeshStandardMaterial({ ...common, roughness: 1, metalness: 0 });
  }, [map, opacity, sprite.layer, missing]);
  useEffect(() => () => material?.dispose(), [material]);

  // Jogadores não veem sprites cujo asset não existe; o Mestre vê o marcador "?".
  if (!material || (missing && !isGm)) return null;

  const y = 0.02 + layerIdx * 0.004;
  const interactive = isGm && !layerLocked;
  return (
    <group position={[sprite.position[0], y, sprite.position[1]]} rotation={[0, sprite.rotation, 0]}>
      <mesh
        geometry={PLANE}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[(sprite.flipX ? -1 : 1) * w * sprite.scale, (sprite.flipY ? -1 : 1) * h * sprite.scale, 1]}
        renderOrder={layerIdx * 100000 + sprite.z}
        raycast={interactive ? undefined : () => null} // camada bloqueada: o clique atravessa
        onPointerDown={interactive ? (e: ThreeEvent) => onDown(e, sprite) : undefined}
      />
      {selected && (
        <lineSegments
          geometry={OUTLINE}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          scale={[w * sprite.scale, h * sprite.scale, 1]}
          renderOrder={999999}
        >
          <lineBasicMaterial color={sprite.locked ? "#ff6b6b" : "#ffcc00"} depthTest={false} fog={false} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
});

/** Desenha os sprites do mapa e cuida de selecionar/arrastar (Mestre). */
export default function SpriteLayer() {
  const sprites = useBoardStore((s) => s.sprites);
  const layers = useBoardStore((s) => s.layers);
  const catalog = useBoardStore((s) => s.catalog);
  const cellSize = useBoardStore((s) => s.cellSize);
  const role = useBoardStore((s) => s.role);
  const selectedIds = useBoardStore((s) => s.selectedSpriteIds);
  const { camera, gl } = useThree();

  const isGm = role === "gm";
  const byId = useMemo(() => new Map((catalog?.assets ?? []).map((a) => [a.id, a])), [catalog]);
  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const ndc = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  const drag = useRef<{
    start: [number, number];
    primary: string;
    origin: Map<string, [number, number]>;
    moved: boolean;
    lastSend: number;
    shift: boolean;
  } | null>(null);

  const groundAt = (cx: number, cy: number) => {
    const r = gl.domElement.getBoundingClientRect();
    ndc.current.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.current.setFromCamera(ndc.current, camera);
    return rayToGround(raycaster.current.ray);
  };

  // Ponte para o arrastar-e-soltar da biblioteca (que acontece fora do canvas).
  useEffect(() => {
    setGroundFromClient((cx, cy) => groundAt(cx, cy));
    return () => setGroundFromClient(null);
  });

  const onDown = (e: ThreeEvent, sprite: SpriteData) => {
    e.stopPropagation();
    const st = useBoardStore.getState();
    const shift = !!(e.shiftKey || e.nativeEvent?.shiftKey || e.ctrlKey || e.nativeEvent?.ctrlKey);
    if (shift) st.toggleSprite(sprite.id);
    else if (!st.selectedSpriteIds.includes(sprite.id)) st.selectSprites([sprite.id]);

    const sel = useBoardStore.getState().selectedSpriteIds;
    const origin = new Map<string, [number, number]>();
    for (const x of useBoardStore.getState().sprites) {
      if (sel.includes(x.id) && !x.locked && !layerById.get(x.layer)?.locked) origin.set(x.id, x.position);
    }
    const p = groundAt(e.nativeEvent.clientX, e.nativeEvent.clientY);
    if (!p || !origin.has(sprite.id) || shift) {
      drag.current = null;
      return;
    }
    drag.current = { start: p, primary: sprite.id, origin, moved: false, lastSend: 0, shift };
    st.setInteracting(true); // trava a câmera enquanto arrasta
  };

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const p = groundAt(ev.clientX, ev.clientY);
      if (!p) return;
      const st = useBoardStore.getState();
      let dx = p[0] - d.start[0];
      let dz = p[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dz) < 0.05) return; // evita "arrastar" sem querer num clique
      d.moved = true;
      if (st.snapGrid && !ev.altKey) {
        // encaixa o sprite principal na grade e move os demais junto
        const g = st.cellSize / 2;
        const o = d.origin.get(d.primary)!;
        dx = snapTo(o[0] + dx, g) - o[0];
        dz = snapTo(o[1] + dz, g) - o[1];
      }
      const half = (st.gridSize * st.cellSize) / 2 + 20;
      useBoardStore.setState((s) => ({
        sprites: s.sprites.map((x) => {
          const o = d.origin.get(x.id);
          if (!o) return x;
          return { ...x, position: [Math.max(-half, Math.min(half, o[0] + dx)), Math.max(-half, Math.min(half, o[1] + dz))] };
        }),
      }));
      const now = performance.now();
      if (now - d.lastSend > 100) {
        d.lastSend = now;
        const cur = useBoardStore.getState().sprites;
        sendOp({ update: cur.filter((x) => d.origin.has(x.id)).map((x) => ({ id: x.id, patch: { position: x.position } })) });
      }
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      useBoardStore.getState().setInteracting(false);
      if (d.moved) recordMove(d.origin);
      else if (d.origin.size > 1 && !d.shift) useBoardStore.getState().selectSprites([d.primary]); // clique simples em um item de uma seleção múltipla
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  return (
    <group name="sprites">
      {sprites.map((sp) => {
        const lay = layerById.get(sp.layer);
        return (
          <SpriteItem
            key={sp.id}
            sprite={sp}
            asset={byId.get(sp.asset)}
            cellSize={cellSize}
            isGm={isGm}
            ghost={isGm && lay?.visible === false}
            selected={selected.has(sp.id)}
            layerLocked={!!lay?.locked}
            onDown={onDown}
          />
        );
      })}
    </group>
  );
}

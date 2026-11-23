/**
 * Cenários: o MAPA (piso, camadas, props 3D, sprites) separado da SALA (sessão
 * de jogo, com tokens e dados). Ficam em disco, um JSON por cenário, e podem
 * ser exportados/importados.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { atomicWriteJson, readJson } = require("./storage");

const FORMAT = "tabletop-scenario";
const VERSION = 1;
const FLOORS = ["dark", "grass", "dirt", "asphalt", "cobble"];
const MOODS = ["fog", "clear", "night"];
const MAX_PROPS = 500;
const MAX_SPRITES = 2000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const TRASH_DAYS = 30;

const LAYERS = [
  { id: "terrain", label: "Terreno e pisos" },
  { id: "structures", label: "Paredes e estruturas" },
  { id: "openings", label: "Portas e janelas" },
  { id: "furniture", label: "Móveis e objetos" },
  { id: "decor", label: "Decorações e detalhes" },
  { id: "characters", label: "Personagens e criaturas" },
  { id: "effects", label: "Efeitos visuais" },
  { id: "lighting", label: "Iluminação e atmosfera" },
];
const LAYER_IDS = new Set(LAYERS.map((l) => l.id));

const num = (v, d, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, n));
};

function defaultLayers() {
  return LAYERS.map((l) => ({ id: l.id, visible: true, locked: false }));
}

function sanitizeLayers(raw) {
  const byId = new Map();
  if (Array.isArray(raw)) for (const l of raw) if (l && LAYER_IDS.has(l.id)) byId.set(l.id, l);
  return LAYERS.map((l) => {
    const r = byId.get(l.id);
    return { id: l.id, visible: r ? r.visible !== false : true, locked: r ? r.locked === true : false };
  });
}

/** Props 3D (casas, árvores, postes...). Mesmas regras de antes, agora compartilhadas. */
function sanitizeProp(p) {
  if (!p || typeof p.id !== "string" || typeof p.kind !== "string" || p.kind.length > 32) return null;
  const pos = Array.isArray(p.position) ? p.position.map(Number) : [0, 0, 0];
  if (pos.length !== 3 || pos.some((n) => !Number.isFinite(n))) return null;
  return {
    id: p.id.slice(0, 64),
    kind: p.kind,
    position: pos.map((n) => Math.max(-50, Math.min(50, n))),
    rotationY: Number.isFinite(+p.rotationY) ? +p.rotationY : 0,
    scale: Math.max(0.2, Math.min(6, Number.isFinite(+p.scale) ? +p.scale : 1)),
    on: !!p.on,
  };
}

/** Sprites 2D/3D da biblioteca. Posição [x, z] no plano do tabuleiro; rotação em radianos. */
function sanitizeSprite(s) {
  if (!s || typeof s.id !== "string" || typeof s.asset !== "string" || !s.asset || s.asset.length > 160) return null;
  const pos = Array.isArray(s.position) ? s.position.map(Number) : [0, 0];
  if (pos.length !== 2 || pos.some((n) => !Number.isFinite(n))) return null;
  return {
    id: s.id.slice(0, 64),
    asset: s.asset,
    layer: LAYER_IDS.has(s.layer) ? s.layer : "furniture",
    position: pos.map((n) => Math.max(-100, Math.min(100, n))),
    rotation: num(s.rotation, 0, -1000, 1000),
    scale: num(s.scale, 1, 0.05, 20),
    opacity: num(s.opacity, 1, 0, 1),
    flipX: s.flipX === true,
    flipY: s.flipY === true,
    locked: s.locked === true,
    z: Math.round(num(s.z, 0, -100000, 100000)),
  };
}

function sanitizeSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    floor: FLOORS.includes(r.floor) ? r.floor : "dark",
    mood: MOODS.includes(r.mood) ? r.mood : "fog",
    gridSize: Math.round(num(r.gridSize, 20, 5, 100)),
    cellSize: num(r.cellSize, 1, 0.5, 4),
  };
}

function newScenarioId() {
  return "sc_" + crypto.randomBytes(6).toString("hex");
}
const ID_RE = /^sc_[a-f0-9]{12}$/;
const ID_RE_TEST = (id) => typeof id === "string" && ID_RE.test(id);

/** Nome de arquivo seguro para o export. */
function fileSafe(name) {
  return (
    String(name || "cenario")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "cenario"
  );
}

/** Cenário vazio com valores padrão. */
function blankScenario(name) {
  const now = Date.now();
  return {
    format: FORMAT,
    version: VERSION,
    id: newScenarioId(),
    name: String(name || "Novo cenário").trim().slice(0, 80) || "Novo cenário",
    createdAt: now,
    updatedAt: now,
    settings: sanitizeSettings({}),
    layers: defaultLayers(),
    props: [],
    sprites: [],
    assets: [],
  };
}

/** Lista de referências de assets usadas (para detectar ausências ao importar em outra máquina). */
function collectAssetRefs(sprites, catalog, previous = []) {
  const prev = new Map((previous || []).filter((a) => a && typeof a.id === "string").map((a) => [a.id, a]));
  const seen = new Map();
  for (const s of sprites) {
    if (seen.has(s.asset)) continue;
    const c = catalog && catalog.byId.get(s.asset);
    const p = prev.get(s.asset);
    seen.set(s.asset, {
      id: s.asset,
      name: String((c && c.name) || (p && p.name) || s.asset).slice(0, 80),
      sha256: (c && c.sha256) || (p && typeof p.sha256 === "string" ? p.sha256.slice(0, 64) : null),
      pack: (c && c.pack) || (p && typeof p.pack === "string" ? p.pack.slice(0, 60) : null),
    });
  }
  return Array.from(seen.values());
}

/**
 * Valida e normaliza qualquer cenário (importado ou vindo da sala). Nunca lança:
 * devolve o que foi possível aproveitar e um relatório do que foi descartado.
 */
function sanitizeScenario(raw, { catalog = null, keepId = false } = {}) {
  const report = { droppedProps: 0, droppedSprites: 0, truncated: false };
  if (!raw || typeof raw !== "object") return { ok: false, error: "JSON de cenário inválido." };
  if (raw.format !== FORMAT) return { ok: false, error: `Arquivo não é um cenário (format deve ser "${FORMAT}").` };
  if (!(Number(raw.version) >= 1) || Number(raw.version) > VERSION)
    return { ok: false, error: `Versão ${raw.version} não suportada (esta versão entende até ${VERSION}).` };

  const props = [];
  for (const p of Array.isArray(raw.props) ? raw.props : []) {
    if (props.length >= MAX_PROPS) { report.truncated = true; report.droppedProps++; continue; }
    const c = sanitizeProp(p);
    if (c) props.push(c); else report.droppedProps++;
  }
  const sprites = [];
  const ids = new Set();
  for (const s of Array.isArray(raw.sprites) ? raw.sprites : []) {
    if (sprites.length >= MAX_SPRITES) { report.truncated = true; report.droppedSprites++; continue; }
    const c = sanitizeSprite(s);
    if (!c || ids.has(c.id)) { report.droppedSprites++; continue; }
    ids.add(c.id);
    sprites.push(c);
  }

  const now = Date.now();
  const scenario = {
    format: FORMAT,
    version: VERSION,
    id: keepId && typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : newScenarioId(),
    name: String(raw.name || "Cenário importado").trim().slice(0, 80) || "Cenário importado",
    createdAt: Number.isFinite(+raw.createdAt) ? +raw.createdAt : now,
    updatedAt: now,
    settings: sanitizeSettings(raw.settings),
    layers: sanitizeLayers(raw.layers),
    props,
    sprites,
    assets: [],
  };
  scenario.assets = collectAssetRefs(sprites, catalog, raw.assets);
  return { ok: true, scenario, report };
}

/**
 * Confere os sprites com o catálogo atual:
 *  - se o id não existe mas o hash do conteúdo existe (mesma imagem em outro pacote/nome), remapeia;
 *  - o que continuar sem asset vira "ausente" (o sprite permanece no cenário, só não aparece).
 * Não altera o cenário; devolve os remapeamentos e a lista de ausentes.
 */
function resolveAssets(scenario, catalog) {
  const remap = new Map();
  const missing = new Map();
  const refs = new Map((scenario.assets || []).map((a) => [a.id, a]));
  for (const s of scenario.sprites) {
    if (catalog.byId.has(s.asset) || remap.has(s.asset)) continue;
    const ref = refs.get(s.asset);
    const bySha = ref && ref.sha256 ? catalog.bySha.get(ref.sha256) : null;
    if (bySha) remap.set(s.asset, bySha.id);
  }
  for (const s of scenario.sprites) {
    const id = remap.get(s.asset) || s.asset;
    if (catalog.byId.has(id)) continue;
    const m = missing.get(id) || { id, name: (refs.get(s.asset) || {}).name || id, count: 0 };
    m.count++;
    missing.set(id, m);
  }
  return {
    remap: Array.from(remap.entries()).map(([from, to]) => ({ from, to })),
    missing: Array.from(missing.values()),
  };
}

function applyRemap(sprites, remapList) {
  if (!remapList.length) return sprites;
  const m = new Map(remapList.map((r) => [r.from, r.to]));
  return sprites.map((s) => (m.has(s.asset) ? { ...s, asset: m.get(s.asset) } : s));
}

class ScenarioStore {
  constructor(dir) {
    this.dir = dir;
    this.trashDir = path.join(dir, ".trash");
    fs.mkdirSync(this.dir, { recursive: true });
    this.purgeTrash();
  }

  _file(id) {
    if (!ID_RE.test(id)) throw new Error("id de cenário inválido");
    return path.join(this.dir, `${id}.json`);
  }

  list() {
    const out = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!/^sc_[a-f0-9]{12}\.json$/.test(f)) continue;
      const sc = readJson(path.join(this.dir, f), null);
      if (!sc || sc.format !== FORMAT) continue;
      out.push({
        id: sc.id,
        name: sc.name,
        updatedAt: sc.updatedAt,
        createdAt: sc.createdAt,
        props: (sc.props || []).length,
        sprites: (sc.sprites || []).length,
        floor: sc.settings && sc.settings.floor,
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id) {
    if (!ID_RE.test(id)) return null;
    const sc = readJson(this._file(id), null);
    return sc && sc.format === FORMAT ? sc : null;
  }

  save(scenario) {
    scenario.updatedAt = Date.now();
    atomicWriteJson(this._file(scenario.id), scenario);
    return scenario;
  }

  /** Move para a lixeira (recuperável por 30 dias). */
  remove(id) {
    const file = this._file(id);
    if (!fs.existsSync(file)) return false;
    fs.mkdirSync(this.trashDir, { recursive: true });
    fs.renameSync(file, path.join(this.trashDir, `${id}.${Date.now()}.json`));
    return true;
  }

  listTrash() {
    const out = [];
    try {
      for (const f of fs.readdirSync(this.trashDir)) {
        const m = f.match(/^(sc_[a-f0-9]{12})\.(\d+)\.json$/);
        if (!m) continue;
        const sc = readJson(path.join(this.trashDir, f), null);
        if (!sc) continue;
        out.push({ file: f, id: m[1], name: sc.name, deletedAt: +m[2] });
      }
    } catch { /* sem lixeira ainda */ }
    return out.sort((a, b) => b.deletedAt - a.deletedAt);
  }

  restore(file) {
    const m = String(file).match(/^(sc_[a-f0-9]{12})\.(\d+)\.json$/);
    if (!m) return null;
    const src = path.join(this.trashDir, file);
    if (!fs.existsSync(src)) return null;
    let id = m[1];
    if (fs.existsSync(this._file(id))) {
      // já existe outro com esse id: restaura com id novo para não sobrescrever
      const sc = readJson(src, null);
      if (!sc) return null;
      sc.id = newScenarioId();
      id = sc.id;
      atomicWriteJson(this._file(id), sc);
      fs.unlinkSync(src);
      return sc;
    }
    fs.renameSync(src, this._file(id));
    return this.get(id);
  }

  purgeTrash() {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    try {
      for (const f of fs.readdirSync(this.trashDir)) {
        const m = f.match(/\.(\d+)\.json$/);
        if (m && +m[1] < limit) fs.unlinkSync(path.join(this.trashDir, f));
      }
    } catch { /* sem lixeira */ }
  }
}

module.exports = {
  FORMAT, VERSION, FLOORS, MOODS, LAYERS, LAYER_IDS, MAX_JSON_BYTES, MAX_PROPS, MAX_SPRITES,
  defaultLayers, sanitizeLayers, sanitizeProp, sanitizeSprite, sanitizeSettings,
  blankScenario, sanitizeScenario, collectAssetRefs, resolveAssets, applyRemap, newScenarioId, ID_RE_TEST, fileSafe,
  ScenarioStore,
};

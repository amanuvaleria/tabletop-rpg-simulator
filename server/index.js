/**
 * Servidor de multiplayer para o Tabletop RPG Simulator.
 *
 * Mantém o estado do tabuleiro (tokens) por sala em memória e
 * retransmite eventos entre os jogadores conectados na mesma sala.
 * Fonte da verdade do estado é o servidor: qualquer cliente que
 * entra numa sala recebe o snapshot atual antes de qualquer outra coisa.
 */
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { AssetLibrary } = require("./lib/assets");
const scen = require("./lib/scenarios");

const PORT = process.env.PORT || 4000;

// ---- Persistência: cada sala vira um arquivo JSON em disco. Sobrevive a
// reinícios do servidor; só o que é efêmero (quem está online, quem é o
// Mestre nesta sessão) não é salvo e é recalculado quando alguém reentra.
// TABLETOP_DATA_DIR permite apontar os dados para outra pasta (ex.: testes isolados).
const DATA_ROOT = process.env.TABLETOP_DATA_DIR || path.join(__dirname, "data");
const DATA_DIR = path.join(DATA_ROOT, "rooms");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Pacotes de assets: web/public/assets/packs (versionados) e data/packs (soltos pelo usuário).
// Uploads do Mestre ficam em data/assets. Nada disso exige recompilar o web.
const PACK_DIRS = [path.join(__dirname, "..", "web", "public", "assets", "packs"), path.join(DATA_ROOT, "packs")];
const library = new AssetLibrary({ packDirs: PACK_DIRS, userDir: path.join(DATA_ROOT, "assets") });
// ---- Configuração do servidor (Mestre designado). Editada pelo app de controle.
const CONFIG_FILE = path.join(DATA_ROOT, "config.json");
function loadConfig() {
  const c = require("./lib/storage").readJson(CONFIG_FILE, {}) || {};
  return {
    masterName: typeof c.masterName === "string" ? c.masterName.trim().slice(0, 32) : "",
    masterPin: typeof c.masterPin === "string" ? c.masterPin.slice(0, 64) : "",
  };
}
let config = loadConfig();
function saveConfig(patch) {
  config = {
    masterName: typeof patch.masterName === "string" ? patch.masterName.trim().slice(0, 32) : config.masterName,
    masterPin: typeof patch.masterPin === "string" ? patch.masterPin.slice(0, 64) : config.masterPin,
  };
  require("./lib/storage").atomicWriteJson(CONFIG_FILE, config);
}
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const masterDesignated = () => !!config.masterName;

const scenarioStore = new scen.ScenarioStore(path.join(DATA_ROOT, "scenarios"));
fs.mkdirSync(PACK_DIRS[1], { recursive: true });

function safeFileName(roomId) {
  return roomId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "room";
}
function roomFilePath(roomId) {
  return path.join(DATA_DIR, `${safeFileName(roomId)}.json`);
}

function loadRoomFromDisk(roomId) {
  try {
    const raw = fs.readFileSync(roomFilePath(roomId), "utf8");
    const data = JSON.parse(raw);
    return {
      tokens: new Map((data.tokens || []).map((t) => [t.id, t])),
      props: new Map((data.props || []).map((p) => [p.id, p])),
      floor: data.floor || "dark",
      rolls: Array.isArray(data.rolls) ? data.rolls.slice(-50) : [],
      gridSize: data.gridSize || 20,
      cellSize: data.cellSize || 1,
      sprites: new Map((data.sprites || []).map((x) => [x.id, x])),
      layers: scen.sanitizeLayers(data.layers),
      scenarioId: typeof data.scenarioId === "string" ? data.scenarioId : null,
    };
  } catch {
    return null;
  }
}

const saveTimers = new Map(); // roomId -> timeout, pra não escrever em disco a cada pixel arrastado

function roomToData(room) {
  return {
    tokens: Array.from(room.tokens.values()),
    props: Array.from(room.props.values()),
    sprites: Array.from(room.sprites.values()),
    layers: room.layers,
    scenarioId: room.scenarioId || null,
    floor: room.floor,
    rolls: room.rolls.slice(-50),
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    savedAt: Date.now(),
  };
}

/** Se a sala está ligada a um cenário, o mapa também é salvo nele (autosave). */
function persistLinkedScenario(room) {
  if (!room.scenarioId) return;
  try {
    const base = scenarioStore.get(room.scenarioId);
    if (!base) {
      room.scenarioId = null; // o cenário foi apagado: desliga em vez de recriar
      return;
    }
    scenarioStore.save(scenarioFromRoom(room, base));
  } catch (err) {
    console.error("[tabletop-server] falha ao salvar cenário", room.scenarioId, err.message);
  }
}

function persistRoomToDisk(roomId, room) {
  fs.writeFile(roomFilePath(roomId), JSON.stringify(roomToData(room)), (err) => {
    if (err) console.error("[tabletop-server] falha ao salvar sala", roomId, err.message);
  });
  persistLinkedScenario(room);
}

function persistRoomToDiskSync(roomId, room) {
  try {
    fs.writeFileSync(roomFilePath(roomId), JSON.stringify(roomToData(room)));
  } catch (err) {
    console.error("[tabletop-server] falha ao salvar sala (sync)", roomId, err.message);
  }
  persistLinkedScenario(room);
}

/** Agenda a gravação em disco (debounce de 1.5s por sala). */
function scheduleSave(roomId, room) {
  clearTimeout(saveTimers.get(roomId));
  saveTimers.set(
    roomId,
    setTimeout(() => persistRoomToDisk(roomId, room), 1500)
  );
}

/** Grava imediatamente e cancela qualquer gravação pendente (usado ao esvaziar a sala). */
function flushSave(roomId, room) {
  clearTimeout(saveTimers.get(roomId));
  saveTimers.delete(roomId);
  persistRoomToDisk(roomId, room);
}

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));
// Informações públicas: nunca revela o nome do Mestre nem a senha, só se a senha é exigida.
app.get("/api/info", (_req, res) => res.json({ masterLocked: masterDesignated() && !!config.masterPin }));

// Catálogo de assets (pacotes + uploads). ?refresh=1 força novo escaneamento.
app.get("/api/assets", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.json(library.publicCatalog({ refresh: req.query.refresh === "1" }));
});
// Arquivos dos pacotes (primeira pasta que tiver o arquivo responde) e uploads (nome = hash, cache longo).
for (const dir of PACK_DIRS) {
  app.use("/assets/packs", express.static(dir, { maxAge: "5m", index: false, fallthrough: true }));
}
app.use(
  "/assets/user",
  express.static(library.userFilesDir, {
    maxAge: "365d",
    immutable: true,
    index: false,
    setHeaders: (res) => {
      res.set("X-Content-Type-Options", "nosniff");
      // SVG enviado por usuário nunca executa script, nem se aberto direto na aba.
      res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    },
  })
);

// Se o web já foi compilado (web/dist), o próprio servidor entrega o site:
// assim basta expor UMA porta (ex.: um túnel) para os amigos jogarem.
const distDir = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || /^\/(socket\.io|api|assets\/(packs|user))(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log("[tabletop-server] servindo o site de", distDir);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 8e6, // imagens de tokens (base64) passavam do limite padrao de 1MB e derrubavam a conexao
});

/** @type {Map<string, { tokens: Map<string, any>, gridSize: number, cellSize: number, users: Map<string, string> }>} */
const rooms = new Map();
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    const fromDisk = loadRoomFromDisk(roomId);
    rooms.set(roomId, {
      tokens: fromDisk?.tokens || new Map(),
      gridSize: fromDisk?.gridSize || 20,
      cellSize: fromDisk?.cellSize || 1,
      users: new Map(),
      rolls: fromDisk?.rolls || [],
      props: fromDisk?.props || new Map(),
      sprites: fromDisk?.sprites || new Map(),
      layers: fromDisk?.layers || scen.defaultLayers(),
      scenarioId: fromDisk?.scenarioId || null,
      floor: fromDisk?.floor || "dark",
      gmSocketId: null, // primeiro a entrar na sala (ou reentrar após reinício) vira o Mestre
    });
    if (fromDisk) console.log(`[tabletop-server] sala ${roomId} recarregada do disco`);
  }
  return rooms.get(roomId);
}

function roleOf(room, socketId) {
  return room.gmSocketId === socketId ? "gm" : "player";
}

/** GM pode tudo; jogador só controla o que ele mesmo criou (ownerId). */
function canControlToken(room, socketId, token) {
  if (!token) return false;
  return roleOf(room, socketId) === "gm" || token.ownerId === socketId;
}

/** Sprites que um jogador pode ver (camadas ocultas nunca saem do servidor). O Mestre vê tudo. */
function spritesFor(room, isGm) {
  const all = Array.from(room.sprites.values());
  if (isGm) return all;
  const hidden = new Set(room.layers.filter((l) => !l.visible).map((l) => l.id));
  return all.filter((sp) => !hidden.has(sp.layer));
}

function roomSnapshot(room, isGm = true) {
  return {
    tokens: Array.from(room.tokens.values()),
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    users: Array.from(room.users.entries()).map(([id, name]) => ({
      name,
      role: roleOf(room, id),
    })),
    rolls: room.rolls,
    props: Array.from(room.props.values()),
    sprites: spritesFor(room, isGm),
    layers: room.layers,
    scenario: scenarioInfo(room),
    floor: room.floor,
  };
}

/** Cena (mapa) vista por um papel. Jogadores nunca recebem camadas ocultas. */
function sceneStateFor(room, extra = {}, isGm = true) {
  return {
    floor: room.floor,
    props: Array.from(room.props.values()),
    sprites: spritesFor(room, isGm),
    layers: room.layers,
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    scenario: scenarioInfo(room),
    ...extra,
  };
}

/** Passa o papel de Mestre para outro socket (ou ninguém) e atualiza as duas pontas. */
function setGm(roomId, room, newId) {
  const old = room.gmSocketId;
  if (old === newId) return;
  room.gmSocketId = newId || null;
  if (old && room.users.has(old)) {
    io.to(old).emit("role:update", { role: "player" });
    io.to(old).emit("scene:sync", sceneStateFor(room, { missing: [] }, false));
  }
  if (newId && room.users.has(newId)) {
    io.to(newId).emit("role:update", { role: "gm" });
    io.to(newId).emit("scene:sync", sceneStateFor(room, { missing: missingAssetsOf(room) }, true));
  }
  io.to(roomId).emit("room:users", roomSnapshot(room).users);
}

function scenarioInfo(room) {
  if (!room.scenarioId) return null;
  const sc = scenarioStore.get(room.scenarioId);
  return sc ? { id: sc.id, name: sc.name } : null;
}

/** Monta o cenário a partir do estado atual da sala (mantém id/nome/datas do original). */
function scenarioFromRoom(room, base) {
  const sprites = Array.from(room.sprites.values());
  return {
    ...base,
    settings: {
      ...base.settings,
      floor: room.floor,
      gridSize: room.gridSize,
      cellSize: room.cellSize,
    },
    layers: room.layers,
    props: Array.from(room.props.values()),
    sprites,
    assets: scen.collectAssetRefs(sprites, library.catalog(), base.assets),
  };
}

/** Assets usados na sala que não existem no catálogo (a sala continua intacta; só não são desenhados). */
function missingAssetsOf(room) {
  const catalog = library.catalog();
  const refs = new Map();
  const sc = room.scenarioId ? scenarioStore.get(room.scenarioId) : null;
  for (const a of (sc && sc.assets) || []) refs.set(a.id, a.name);
  const missing = new Map();
  for (const sp of room.sprites.values()) {
    if (catalog.byId.has(sp.asset)) continue;
    const m = missing.get(sp.asset) || { id: sp.asset, name: refs.get(sp.asset) || sp.asset, count: 0 };
    m.count++;
    missing.set(sp.asset, m);
  }
  return Array.from(missing.values());
}

io.on("connection", (socket) => {
  let currentRoomId = null;
  let userName = "Jogador";

  socket.on("room:join", ({ roomId, name, pin }, callback) => {
    if (!roomId || typeof roomId !== "string") {
      callback?.(null);
      return;
    }

    currentRoomId = roomId;
    userName = (name || "Jogador").slice(0, 32);
    socket.join(roomId);

    const room = getRoom(roomId);
    room.users.set(socket.id, userName);
    let pinRejected = false;
    if (masterDesignated()) {
      // Há um Mestre designado no app de controle: só ele (pelo nome, e pela senha se existir) assume.
      if (sameName(userName, config.masterName)) {
        if (config.masterPin && pin !== config.masterPin) pinRejected = true;
        else if (room.gmSocketId !== socket.id) setGm(roomId, room, socket.id);
      }
    } else if (!room.gmSocketId) {
      room.gmSocketId = socket.id; // sem designação: o primeiro a entrar vira o Mestre
    }

    const isGm = roleOf(room, socket.id) === "gm";
    const snapshot = roomSnapshot(room, isGm);
    callback?.({ ...snapshot, role: roleOf(room, socket.id), youId: socket.id, missingAssets: isGm ? missingAssetsOf(room) : [], pinRejected });

    socket.to(roomId).emit("user:joined", { name: userName });
    io.to(roomId).emit("room:users", snapshot.users);
  });

  socket.on("token:add", (token) => {
    if (!currentRoomId || !token?.id) return;
    if (typeof token.imageUrl === "string" && token.imageUrl.length > 6e6) return;
    const room = getRoom(currentRoomId);
    const withOwner = { ...token, ownerId: socket.id, ownerName: userName };
    room.tokens.set(token.id, withOwner);
    socket.to(currentRoomId).emit("token:added", withOwner);
    scheduleSave(currentRoomId, room);
  });

  socket.on("token:update", ({ id, patch }) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    const existing = room.tokens.get(id);
    if (!existing || !canControlToken(room, socket.id, existing)) return;
    // ownerId nunca muda via patch do cliente (evita roubo de posse)
    const { ownerId: _ignored, ...safePatch } = patch || {};
    const updated = { ...existing, ...safePatch };
    room.tokens.set(id, updated);
    socket.to(currentRoomId).emit("token:updated", { id, patch: safePatch });
    scheduleSave(currentRoomId, room);
  });

  socket.on("token:remove", (id) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    const existing = room.tokens.get(id);
    if (!existing || !canControlToken(room, socket.id, existing)) return;
    room.tokens.delete(id);
    socket.to(currentRoomId).emit("token:removed", id);
    scheduleSave(currentRoomId, room);
  });

  // ---- Props de cenario (casas, arvores, postes...) e piso
  const { sanitizeProp, FLOORS } = scen;

  socket.on("prop:add", (prop) => {
    if (!currentRoomId) return;
    const room = getRoom(currentRoomId);
    if (roleOf(room, socket.id) !== "gm") return;
    const clean = sanitizeProp(prop);
    if (!clean || room.props.size >= 500) return;
    room.props.set(clean.id, clean);
    socket.to(currentRoomId).emit("prop:added", clean);
    scheduleSave(currentRoomId, room);
  });

  socket.on("prop:update", ({ id, patch } = {}) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    if (roleOf(room, socket.id) !== "gm") return;
    const existing = room.props.get(id);
    if (!existing || !patch) return;
    const clean = sanitizeProp({ ...existing, ...patch, id });
    if (!clean) return;
    room.props.set(id, clean);
    socket.to(currentRoomId).emit("prop:updated", {
      id,
      patch: { position: clean.position, rotationY: clean.rotationY, scale: clean.scale, on: clean.on },
    });
    scheduleSave(currentRoomId, room);
  });

  socket.on("prop:remove", (id) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    if (roleOf(room, socket.id) !== "gm") return;
    room.props.delete(id);
    socket.to(currentRoomId).emit("prop:removed", id);
    scheduleSave(currentRoomId, room);
  });

  // Carrega um mapa pronto (substitui os props e troca o piso) para toda a sala.
  socket.on("map:load", ({ floor, props } = {}) => {
    if (!currentRoomId || !Array.isArray(props)) return;
    const room = getRoom(currentRoomId);
    if (roleOf(room, socket.id) !== "gm") return;
    room.floor = FLOORS.includes(floor) ? floor : "dark";
    room.props = new Map();
    for (const p of props.slice(0, 500)) {
      const clean = sanitizeProp(p);
      if (clean) room.props.set(clean.id, clean);
    }
    io.to(currentRoomId).emit("map:loaded", {
      floor: room.floor,
      props: Array.from(room.props.values()),
    });
    scheduleSave(currentRoomId, room);
  });

  // ---- Cenários (mapas salvos no servidor) e biblioteca de assets. Só o Mestre altera.
  const gmRoom = (cb) => {
    if (!currentRoomId) {
      cb?.({ ok: false, error: "Entre em uma sala primeiro." });
      return null;
    }
    const room = getRoom(currentRoomId);
    if (roleOf(room, socket.id) !== "gm") {
      cb?.({ ok: false, error: "Apenas o Mestre pode fazer isso." });
      return null;
    }
    return room;
  };

  const sceneState = (room, extra = {}, isGm = true) => ({
    floor: room.floor,
    props: Array.from(room.props.values()),
    sprites: spritesFor(room, isGm),
    layers: room.layers,
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    scenario: scenarioInfo(room),
    ...extra,
  });

  /** Envia um evento de cena a cada pessoa da sala com a visão correta do seu papel. */
  const emitScene = (event, room, extra = {}) => {
    const members = io.sockets.adapter.rooms.get(currentRoomId) || new Set();
    for (const sid of members) {
      const gm = roleOf(room, sid) === "gm";
      io.to(sid).emit(event, sceneState(room, gm ? extra : { ...extra, missing: [] }, gm));
    }
  };

  socket.on("scenario:list", (_p, cb) => {
    if (!gmRoom(cb)) return;
    cb?.({ ok: true, scenarios: scenarioStore.list(), trash: scenarioStore.listTrash() });
  });

  // Cria um cenário: "blank" começa vazio (e carrega na sala); "room" guarda o mapa atual da sala.
  socket.on("scenario:create", ({ name, mode, mood } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    const sc = scen.blankScenario(name);
    if (MOODS_OK(mood)) sc.settings.mood = mood;
    if (mode === "room") {
      scenarioStore.save(scenarioFromRoom(room, sc));
      room.scenarioId = sc.id;
    } else {
      scenarioStore.save(sc);
      room.floor = sc.settings.floor;
      room.props = new Map();
      room.sprites = new Map();
      room.layers = scen.defaultLayers();
      room.scenarioId = sc.id;
      emitScene("scenario:loaded", room, { missing: [], mood: sc.settings.mood });
    }
    scheduleSave(currentRoomId, room);
    cb?.({ ok: true, id: sc.id, name: sc.name });
  });

  socket.on("scenario:load", ({ id } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    const sc = scenarioStore.get(id);
    if (!sc) return cb?.({ ok: false, error: "Cenário não encontrado." });
    const resolved = scen.resolveAssets(sc, library.catalog());
    const sprites = scen.applyRemap(sc.sprites, resolved.remap);
    room.floor = sc.settings.floor;
    room.gridSize = sc.settings.gridSize;
    room.cellSize = sc.settings.cellSize;
    room.layers = scen.sanitizeLayers(sc.layers);
    room.props = new Map(sc.props.map((p) => [p.id, p]));
    room.sprites = new Map(sprites.map((x) => [x.id, x]));
    room.scenarioId = sc.id;
    emitScene("scenario:loaded", room, { missing: resolved.missing, remapped: resolved.remap, mood: sc.settings.mood });
    scheduleSave(currentRoomId, room);
    cb?.({ ok: true, missing: resolved.missing, remapped: resolved.remap });
  });

  // Salva agora o estado da sala no cenário ligado (além do autosave).
  socket.on("scenario:save", ({ mood } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    const base = room.scenarioId && scenarioStore.get(room.scenarioId);
    if (!base) return cb?.({ ok: false, error: "A sala não está ligada a nenhum cenário." });
    if (MOODS_OK(mood)) base.settings.mood = mood;
    scenarioStore.save(scenarioFromRoom(room, base));
    cb?.({ ok: true, id: base.id });
  });

  socket.on("scenario:unlink", (_p, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    room.scenarioId = null;
    io.to(currentRoomId).emit("scenario:linked", null);
    scheduleSave(currentRoomId, room);
    cb?.({ ok: true });
  });

  socket.on("scenario:duplicate", ({ id, name } = {}, cb) => {
    if (!gmRoom(cb)) return;
    const sc = scenarioStore.get(id);
    if (!sc) return cb?.({ ok: false, error: "Cenário não encontrado." });
    const copy = { ...sc, id: scen.newScenarioId(), name: String(name || `${sc.name} (cópia)`).trim().slice(0, 80), createdAt: Date.now() };
    scenarioStore.save(copy);
    cb?.({ ok: true, id: copy.id, name: copy.name });
  });

  socket.on("scenario:rename", ({ id, name } = {}, cb) => {
    if (!gmRoom(cb)) return;
    const sc = scenarioStore.get(id);
    const clean = String(name || "").trim().slice(0, 80);
    if (!sc || !clean) return cb?.({ ok: false, error: "Nome inválido ou cenário não encontrado." });
    sc.name = clean;
    scenarioStore.save(sc);
    cb?.({ ok: true });
  });

  socket.on("scenario:delete", ({ id } = {}, cb) => {
    if (!gmRoom(cb)) return;
    if (!scen.ID_RE_TEST(id) || !scenarioStore.remove(id)) return cb?.({ ok: false, error: "Cenário não encontrado." });
    for (const [rid, r] of rooms.entries()) {
      if (r.scenarioId === id) {
        r.scenarioId = null;
        io.to(rid).emit("scenario:linked", null);
      }
    }
    cb?.({ ok: true });
  });

  socket.on("scenario:restore", ({ file } = {}, cb) => {
    if (!gmRoom(cb)) return;
    const sc = scenarioStore.restore(file);
    cb?.(sc ? { ok: true, id: sc.id, name: sc.name } : { ok: false, error: "Item não encontrado na lixeira." });
  });

  // Exporta um cenário salvo ({id}) ou o mapa atual da sala ({current:true}) como JSON.
  socket.on("scenario:export", ({ id, current, mood } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    let sc;
    if (current) {
      const base = (room.scenarioId && scenarioStore.get(room.scenarioId)) || scen.blankScenario("Mapa da sala");
      sc = scenarioFromRoom(room, base);
      if (MOODS_OK(mood)) sc.settings.mood = mood;
    } else {
      sc = scenarioStore.get(id);
    }
    if (!sc) return cb?.({ ok: false, error: "Cenário não encontrado." });
    const filename = `${scen.fileSafe(sc.name)}.cenario.json`;
    cb?.({ ok: true, filename, json: sc });
  });

  // Importa um JSON de cenário como NOVO cenário (nunca sobrescreve). Não carrega na sala sozinho.
  socket.on("scenario:import", ({ json } = {}, cb) => {
    if (!gmRoom(cb)) return;
    let raw = json;
    if (typeof raw === "string") {
      if (raw.length > scen.MAX_JSON_BYTES) return cb?.({ ok: false, error: "Arquivo grande demais (máx. 5 MB)." });
      try { raw = JSON.parse(raw); } catch { return cb?.({ ok: false, error: "O arquivo não é um JSON válido." }); }
    }
    const result = scen.sanitizeScenario(raw, { catalog: library.catalog() });
    if (!result.ok) return cb?.(result);
    const sc = result.scenario;
    const resolved = scen.resolveAssets(sc, library.catalog());
    sc.sprites = scen.applyRemap(sc.sprites, resolved.remap);
    sc.assets = scen.collectAssetRefs(sc.sprites, library.catalog(), sc.assets);
    scenarioStore.save(sc);
    cb?.({ ok: true, id: sc.id, name: sc.name, report: result.report, missing: resolved.missing, remapped: resolved.remap });
  });

  const MOODS_OK = (m) => scen.MOODS.includes(m);
  const notifyAssets = () => io.emit("assets:changed");

  socket.on("asset:upload", (payload = {}, cb) => {
    if (!gmRoom(cb)) return;
    const r = library.upload({ ...payload, data: Buffer.isBuffer(payload.data) ? payload.data : payload.data ? Buffer.from(payload.data) : null });
    if (r.ok) notifyAssets();
    cb?.(r.ok ? { ok: true, asset: r.asset } : { ok: false, error: r.error, duplicate: r.duplicate || null });
  });

  socket.on("asset:update", ({ id, patch } = {}, cb) => {
    if (!gmRoom(cb)) return;
    const r = library.updateUpload(id, patch || {});
    if (r.ok) notifyAssets();
    cb?.(r);
  });

  socket.on("asset:delete", ({ id } = {}, cb) => {
    if (!gmRoom(cb)) return;
    const r = library.deleteUpload(id);
    if (r.ok) notifyAssets();
    cb?.(r);
  });

  // ---- Sprites da biblioteca e camadas. Tudo passa por um único evento em lote (serve a desfazer/refazer).
  // O servidor aplica as regras (bloqueios, limites) e cada pessoa recebe só o que pode ver.
  const spriteLayerOf = (room, id) => room.layers.find((l) => l.id === id);
  const isHiddenLayer = (room, id) => {
    const l = spriteLayerOf(room, id);
    return !!l && !l.visible;
  };

  socket.on("sprite:batch", ({ add, update, remove } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    const total = (Array.isArray(add) ? add.length : 0) + (Array.isArray(update) ? update.length : 0) + (Array.isArray(remove) ? remove.length : 0);
    if (total === 0 || total > 1000) return cb?.({ ok: false, error: "Lote vazio ou grande demais." });

    const before = new Map(); // id -> sprite antes (ou undefined)
    const touched = new Set();
    const rejected = [];
    const remember = (id) => {
      if (!before.has(id)) before.set(id, room.sprites.get(id));
      touched.add(id);
    };
    const layerLocked = (sp) => !!(spriteLayerOf(room, sp.layer) || {}).locked;

    for (const id of Array.isArray(remove) ? remove : []) {
      const sp = room.sprites.get(id);
      if (!sp) continue;
      if (sp.locked || layerLocked(sp)) { rejected.push({ id, reason: "bloqueado" }); continue; }
      remember(id);
      room.sprites.delete(id);
    }
    for (const raw of Array.isArray(add) ? add : []) {
      const clean = scen.sanitizeSprite(raw);
      if (!clean || room.sprites.has(clean.id)) { rejected.push({ id: raw && raw.id, reason: "inválido ou repetido" }); continue; }
      if (room.sprites.size >= scen.MAX_SPRITES) { rejected.push({ id: clean.id, reason: "limite de sprites" }); continue; }
      remember(clean.id);
      room.sprites.set(clean.id, clean);
    }
    for (const u of Array.isArray(update) ? update : []) {
      const existing = u && room.sprites.get(u.id);
      if (!existing || !u.patch || typeof u.patch !== "object") continue;
      const keys = Object.keys(u.patch);
      // Bloqueado (o próprio sprite ou a camada): só dá para mexer na flag "locked" do sprite.
      if ((existing.locked || layerLocked(existing)) && !(keys.length > 0 && keys.every((k) => k === "locked") && !layerLocked(existing))) {
        rejected.push({ id: u.id, reason: "bloqueado" });
        continue;
      }
      const merged = scen.sanitizeSprite({ ...existing, ...u.patch, id: existing.id });
      if (!merged) { rejected.push({ id: u.id, reason: "inválido" }); continue; }
      // não deixa mover para uma camada trancada por engano
      if (merged.layer !== existing.layer && layerLocked(merged)) { rejected.push({ id: u.id, reason: "camada de destino bloqueada" }); continue; }
      remember(u.id);
      room.sprites.set(u.id, merged);
    }

    // Monta o que cada papel recebe.
    const gmUpsert = [];
    const gmRemove = [];
    const plUpsert = [];
    const plRemove = [];
    for (const id of touched) {
      const prev = before.get(id);
      const now = room.sprites.get(id);
      if (now) gmUpsert.push(now); else gmRemove.push(id);
      const visBefore = !!prev && !isHiddenLayer(room, prev.layer);
      const visAfter = !!now && !isHiddenLayer(room, now.layer);
      if (visAfter) plUpsert.push(now);
      else if (visBefore) plRemove.push(id);
    }
    const members = io.sockets.adapter.rooms.get(currentRoomId) || new Set();
    for (const sid of members) {
      if (sid === socket.id) continue; // quem enviou já aplicou localmente
      const gm = roleOf(room, sid) === "gm";
      const upsert = gm ? gmUpsert : plUpsert;
      const rem = gm ? gmRemove : plRemove;
      if (upsert.length || rem.length) io.to(sid).emit("sprites:changed", { upsert, remove: rem });
    }
    if (touched.size) scheduleSave(currentRoomId, room);
    cb?.({ ok: true, rejected, authoritative: gmUpsert, removed: gmRemove });
  });

  // Visibilidade e bloqueio das camadas. Ocultar tira os sprites da camada dos jogadores de verdade.
  socket.on("layer:update", ({ id, patch } = {}, cb) => {
    const room = gmRoom(cb);
    if (!room) return;
    const layer = spriteLayerOf(room, id);
    if (!layer || !patch || typeof patch !== "object") return cb?.({ ok: false, error: "Camada inválida." });
    const wasVisible = layer.visible;
    if (typeof patch.visible === "boolean") layer.visible = patch.visible;
    if (typeof patch.locked === "boolean") layer.locked = patch.locked;
    const members = io.sockets.adapter.rooms.get(currentRoomId) || new Set();
    for (const sid of members) {
      if (sid === socket.id) continue;
      const gm = roleOf(room, sid) === "gm";
      io.to(sid).emit("layers:changed", {
        layers: room.layers,
        // jogadores recebem a lista completa do que podem ver (é a fonte da verdade para eles)
        ...(gm ? {} : { sprites: spritesFor(room, false) }),
      });
    }
    void wasVisible;
    scheduleSave(currentRoomId, room);
    cb?.({ ok: true, layers: room.layers });
  });

  // Rolagem de dados: o servidor sorteia (fonte da verdade), ninguém forja resultado.
  socket.on("dice:roll", ({ sides, count, modifier } = {}) => {
    if (!currentRoomId) return;
    if (!DICE_SIDES.includes(sides)) return;
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);
    const mod = Math.min(Math.max(parseInt(modifier, 10) || 0, -99), 99);
    const results = Array.from({ length: n }, () =>
      sides === 100 ? crypto.randomInt(1, 101) : crypto.randomInt(1, sides + 1)
    );
    const roll = {
      id: crypto.randomUUID(),
      user: userName,
      sides,
      results,
      modifier: mod,
      total: results.reduce((a, b) => a + b, 0) + mod,
      at: Date.now(),
    };
    const room = getRoom(currentRoomId);
    room.rolls.push(roll);
    if (room.rolls.length > 50) room.rolls.shift();
    io.to(currentRoomId).emit("dice:rolled", roll);
    scheduleSave(currentRoomId, room);
  });

  socket.on("disconnect", () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.users.delete(socket.id);

    // Se quem saiu era o Mestre, promove o próximo jogador restante (se houver).
    if (room.gmSocketId === socket.id) {
      // Com Mestre designado ninguém herda o cargo; sem designação, o próximo da fila assume.
      const nextId = masterDesignated() ? null : room.users.keys().next().value || null;
      room.gmSocketId = null;
      if (nextId) setGm(currentRoomId, room, nextId);
    }

    socket.to(currentRoomId).emit("user:left", { name: userName });
    io.to(currentRoomId).emit("room:users", roomSnapshot(room).users);

    if (room.users.size === 0) {
      // Ninguém mais na sala: garante que o estado está salvo e libera a
      // memória — ao reentrar, getRoom() recarrega tudo do disco de novo.
      flushSave(currentRoomId, room);
      rooms.delete(currentRoomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[tabletop-server] listening on port ${PORT}`);
});

// ---- API de administração (usada pelo app de controle). Fica FORA da porta pública:
// escuta só em 127.0.0.1, em outra porta, e exige um token que só o app de controle conhece.
const ADMIN_PORT = Number(process.env.TABLETOP_ADMIN_PORT) || 0;
const ADMIN_TOKEN = process.env.TABLETOP_ADMIN_TOKEN || "";
if (ADMIN_PORT && ADMIN_TOKEN) {
  const adminServer = http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const given = Buffer.from(String(req.headers["x-admin-token"] || ""));
    const want = Buffer.from(ADMIN_TOKEN);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(401, { ok: false, error: "não autorizado" });

    const readBody = () =>
      new Promise((resolve) => {
        let raw = "";
        req.on("data", (c) => {
          raw += c;
          if (raw.length > 1e5) req.destroy();
        });
        req.on("end", () => {
          try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
        });
      });

    (async () => {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/admin/state") {
        const list = [];
        for (const [id, room] of rooms.entries()) {
          list.push({
            id,
            users: Array.from(room.users.entries()).map(([sid, name]) => ({ id: sid, name, role: roleOf(room, sid) })),
            tokens: room.tokens.size,
            props: room.props.size,
            sprites: room.sprites.size,
            scenario: scenarioInfo(room),
          });
        }
        return send(200, { ok: true, port: PORT, rooms: list, config: { masterName: config.masterName, hasPin: !!config.masterPin }, assets: library.publicCatalog().packs });
      }
      if (req.method === "POST" && url.pathname === "/admin/master") {
        const b = await readBody();
        const room = rooms.get(b.roomId);
        if (!room || !room.users.has(b.socketId)) return send(404, { ok: false, error: "Sala ou jogador não encontrado." });
        setGm(b.roomId, room, b.socketId);
        return send(200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/admin/kick") {
        const b = await readBody();
        const room = rooms.get(b.roomId);
        if (!room || !room.users.has(b.socketId)) return send(404, { ok: false, error: "Jogador não encontrado." });
        io.sockets.sockets.get(b.socketId)?.disconnect(true);
        return send(200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/admin/config") {
        const b = await readBody();
        saveConfig({ masterName: b.masterName, masterPin: b.masterPin });
        return send(200, { ok: true, config: { masterName: config.masterName, hasPin: !!config.masterPin } });
      }
      if (req.method === "POST" && url.pathname === "/admin/assets/refresh") {
        library.invalidate();
        io.emit("assets:changed");
        return send(200, { ok: true, count: library.catalog({ refresh: true }).assets.length });
      }
      if (req.method === "POST" && url.pathname === "/admin/shutdown") {
        send(200, { ok: true });
        setTimeout(shutdown, 100); // responde primeiro; shutdown() grava todas as salas e sai
        return;
      }
      send(404, { ok: false, error: "rota desconhecida" });
    })().catch((err) => send(500, { ok: false, error: err.message }));
  });
  adminServer.listen(ADMIN_PORT, "127.0.0.1", () => console.log(`[tabletop-server] admin em 127.0.0.1:${ADMIN_PORT}`));
}

function shutdown() {
  console.log("[tabletop-server] encerrando, salvando salas ativas...");
  for (const [roomId, room] of rooms.entries()) {
    clearTimeout(saveTimers.get(roomId));
    persistRoomToDiskSync(roomId, room);
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

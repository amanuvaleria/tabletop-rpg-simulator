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

function roomSnapshot(room) {
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
    sprites: Array.from(room.sprites.values()),
    layers: room.layers,
    scenario: scenarioInfo(room),
    floor: room.floor,
  };
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

  socket.on("room:join", ({ roomId, name }, callback) => {
    if (!roomId || typeof roomId !== "string") {
      callback?.(null);
      return;
    }

    currentRoomId = roomId;
    userName = (name || "Jogador").slice(0, 32);
    socket.join(roomId);

    const room = getRoom(roomId);
    room.users.set(socket.id, userName);
    if (!room.gmSocketId) room.gmSocketId = socket.id; // primeiro a entrar vira o Mestre

    const snapshot = roomSnapshot(room);
    callback?.({ ...snapshot, role: roleOf(room, socket.id), youId: socket.id, missingAssets: missingAssetsOf(room) });

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

  const sceneState = (room, extra = {}) => ({
    floor: room.floor,
    props: Array.from(room.props.values()),
    sprites: Array.from(room.sprites.values()),
    layers: room.layers,
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    scenario: scenarioInfo(room),
    ...extra,
  });

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
      io.to(currentRoomId).emit("scenario:loaded", sceneState(room, { missing: [], mood: sc.settings.mood }));
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
    io.to(currentRoomId).emit(
      "scenario:loaded",
      sceneState(room, { missing: resolved.missing, remapped: resolved.remap, mood: sc.settings.mood })
    );
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
      const nextId = room.users.keys().next().value || null;
      room.gmSocketId = nextId;
      if (nextId) {
        io.to(nextId).emit("role:update", { role: "gm" });
      }
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

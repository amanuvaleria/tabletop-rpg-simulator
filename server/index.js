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

const PORT = process.env.PORT || 4000;

// ---- Persistência: cada sala vira um arquivo JSON em disco. Sobrevive a
// reinícios do servidor; só o que é efêmero (quem está online, quem é o
// Mestre nesta sessão) não é salvo e é recalculado quando alguém reentra.
const DATA_DIR = path.join(__dirname, "data", "rooms");
fs.mkdirSync(DATA_DIR, { recursive: true });

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
    };
  } catch {
    return null;
  }
}

const saveTimers = new Map(); // roomId -> timeout, pra não escrever em disco a cada pixel arrastado

function persistRoomToDisk(roomId, room) {
  const data = {
    tokens: Array.from(room.tokens.values()),
    props: Array.from(room.props.values()),
    floor: room.floor,
    rolls: room.rolls.slice(-50),
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    savedAt: Date.now(),
  };
  fs.writeFile(roomFilePath(roomId), JSON.stringify(data), (err) => {
    if (err) console.error("[tabletop-server] falha ao salvar sala", roomId, err.message);
  });
}

function persistRoomToDiskSync(roomId, room) {
  const data = {
    tokens: Array.from(room.tokens.values()),
    props: Array.from(room.props.values()),
    floor: room.floor,
    rolls: room.rolls.slice(-50),
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    savedAt: Date.now(),
  };
  try {
    fs.writeFileSync(roomFilePath(roomId), JSON.stringify(data));
  } catch (err) {
    console.error("[tabletop-server] falha ao salvar sala (sync)", roomId, err.message);
  }
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

// Se o web já foi compilado (web/dist), o próprio servidor entrega o site:
// assim basta expor UMA porta (ex.: um túnel) para os amigos jogarem.
const distDir = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/socket.io")) return next();
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
    floor: room.floor,
  };
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
    callback?.({ ...snapshot, role: roleOf(room, socket.id), youId: socket.id });

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
  const sanitizeProp = (p) => {
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
  };
  const FLOORS = ["dark", "grass", "dirt", "asphalt", "cobble"];

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

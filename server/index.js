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
    rooms.set(roomId, {
      tokens: new Map(),
      gridSize: 20,
      cellSize: 1,
      users: new Map(),
      rolls: [],
      props: new Map(),
      floor: "dark",
    });
  }
  return rooms.get(roomId);
}

function roomSnapshot(room) {
  return {
    tokens: Array.from(room.tokens.values()),
    gridSize: room.gridSize,
    cellSize: room.cellSize,
    users: Array.from(room.users.values()),
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

    callback?.(roomSnapshot(room));

    socket.to(roomId).emit("user:joined", { name: userName });
    io.to(roomId).emit("room:users", Array.from(room.users.values()));
  });

  socket.on("token:add", (token) => {
    if (!currentRoomId || !token?.id) return;
    if (typeof token.imageUrl === "string" && token.imageUrl.length > 6e6) return;
    const room = getRoom(currentRoomId);
    room.tokens.set(token.id, token);
    socket.to(currentRoomId).emit("token:added", token);
  });

  socket.on("token:update", ({ id, patch }) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    const existing = room.tokens.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    room.tokens.set(id, updated);
    socket.to(currentRoomId).emit("token:updated", { id, patch });
  });

  socket.on("token:remove", (id) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    room.tokens.delete(id);
    socket.to(currentRoomId).emit("token:removed", id);
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
    const clean = sanitizeProp(prop);
    if (!clean || room.props.size >= 500) return;
    room.props.set(clean.id, clean);
    socket.to(currentRoomId).emit("prop:added", clean);
  });

  socket.on("prop:update", ({ id, patch } = {}) => {
    if (!currentRoomId || !id) return;
    const room = getRoom(currentRoomId);
    const existing = room.props.get(id);
    if (!existing || !patch) return;
    const clean = sanitizeProp({ ...existing, ...patch, id });
    if (!clean) return;
    room.props.set(id, clean);
    socket.to(currentRoomId).emit("prop:updated", {
      id,
      patch: { position: clean.position, rotationY: clean.rotationY, scale: clean.scale, on: clean.on },
    });
  });

  socket.on("prop:remove", (id) => {
    if (!currentRoomId || !id) return;
    getRoom(currentRoomId).props.delete(id);
    socket.to(currentRoomId).emit("prop:removed", id);
  });

  // Carrega um mapa pronto (substitui os props e troca o piso) para toda a sala.
  socket.on("map:load", ({ floor, props } = {}) => {
    if (!currentRoomId || !Array.isArray(props)) return;
    const room = getRoom(currentRoomId);
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
  });

  socket.on("disconnect", () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.users.delete(socket.id);
    socket.to(currentRoomId).emit("user:left", { name: userName });
    io.to(currentRoomId).emit("room:users", Array.from(room.users.values()));
    if (room.users.size === 0 && room.tokens.size === 0 && room.props.size === 0) {
      rooms.delete(currentRoomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[tabletop-server] listening on port ${PORT}`);
});

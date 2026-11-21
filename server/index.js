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

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

/** @type {Map<string, { tokens: Map<string, any>, gridSize: number, cellSize: number, users: Map<string, string> }>} */
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      tokens: new Map(),
      gridSize: 20,
      cellSize: 1,
      users: new Map(),
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

  socket.on("disconnect", () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    room.users.delete(socket.id);
    socket.to(currentRoomId).emit("user:left", { name: userName });
    io.to(currentRoomId).emit("room:users", Array.from(room.users.values()));
    if (room.users.size === 0 && room.tokens.size === 0) {
      rooms.delete(currentRoomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[tabletop-server] listening on port ${PORT}`);
});

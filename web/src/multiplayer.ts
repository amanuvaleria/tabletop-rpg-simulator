import { io, type Socket } from "socket.io-client";
import { useBoardStore } from "./store";
import type { TokenData } from "./types";

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) || "http://localhost:4000";

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

let listenersRegistered = false;

interface RoomSnapshot {
  tokens: TokenData[];
  gridSize: number;
  cellSize: number;
  users: string[];
}

function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  socket.on("token:added", (token: TokenData) => {
    const exists = useBoardStore.getState().tokens.some((t) => t.id === token.id);
    if (!exists) useBoardStore.getState().addToken(token);
  });

  socket.on("token:updated", ({ id, patch }: { id: string; patch: Partial<TokenData> }) => {
    useBoardStore.getState().updateToken(id, patch);
  });

  socket.on("token:removed", (id: string) => {
    useBoardStore.getState().removeToken(id);
  });

  socket.on("room:users", (users: string[]) => {
    useBoardStore.getState().setRoomInfo({ roomUsers: users });
  });

  socket.on("disconnect", () => {
    useBoardStore.getState().setRoomInfo({ connectionStatus: "disconnected" });
  });

  socket.on("connect_error", (err: Error) => {
    useBoardStore.getState().setRoomInfo({
      connectionStatus: "error",
      connectionError: err.message || "Falha ao conectar no servidor",
    });
  });
}

/** Conecta (ou reconecta) e entra numa sala, recebendo o snapshot atual do tabuleiro. */
export function joinRoom(roomId: string, playerName: string): Promise<RoomSnapshot> {
  registerListeners();

  useBoardStore.getState().setRoomInfo({
    connectionStatus: "connecting",
    connectionError: null,
    playerName,
  });

  return new Promise((resolve, reject) => {
    const onConnectError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("connect_error", onConnectError);
    };
    socket.once("connect_error", onConnectError);

    const doJoin = () => {
      socket.emit("room:join", { roomId, name: playerName }, (snapshot: RoomSnapshot | null) => {
        cleanup();
        if (!snapshot) {
          reject(new Error("Não foi possível entrar na sala."));
          return;
        }
        useBoardStore.getState().setTokens(snapshot.tokens || []);
        useBoardStore.getState().setRoomInfo({
          roomId,
          connectionStatus: "connected",
          roomUsers: snapshot.users || [],
          connectionError: null,
        });
        resolve(snapshot);
      });
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.connect();
      socket.once("connect", doJoin);
    }
  });
}

export function leaveRoom() {
  socket.disconnect();
  useBoardStore.getState().setRoomInfo({
    roomId: null,
    connectionStatus: "disconnected",
    roomUsers: [],
  });
}

export function emitAddToken(token: TokenData) {
  if (socket.connected) socket.emit("token:add", token);
}

export function emitUpdateToken(id: string, patch: Partial<TokenData>) {
  if (socket.connected) socket.emit("token:update", { id, patch });
}

export function emitRemoveToken(id: string) {
  if (socket.connected) socket.emit("token:remove", id);
}

/** Gera um código de sala curto e fácil de compartilhar, ex: "A1B2C3". */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem caracteres ambíguos
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

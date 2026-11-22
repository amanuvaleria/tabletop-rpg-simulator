import { io, type Socket } from "socket.io-client";
import { useBoardStore } from "./store";
import type { DiceRoll, FloorKind, PlayerRole, PropData, TokenData } from "./types";
import type { RoomUser } from "./store";

// Ordem: VITE_SERVER_URL > dev (mesmo host, porta 4000, funciona via IP da rede) > mesma origem (site servido pelo servidor).
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : window.location.origin);

export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

let listenersRegistered = false;

interface RoomSnapshot {
  tokens: TokenData[];
  gridSize: number;
  cellSize: number;
  users: RoomUser[];
  rolls?: DiceRoll[];
  props?: PropData[];
  floor?: FloorKind;
  role?: PlayerRole;
  youId?: string;
}

// Ultima sala: usada para reentrar automaticamente se a conexao cair.
let lastRoom: { roomId: string; name: string } | null = null;

function applySnapshot(snapshot: RoomSnapshot) {
  const st = useBoardStore.getState();
  st.setTokens(snapshot.tokens || []);
  st.setRolls(snapshot.rolls || []);
  st.loadMap(snapshot.floor || "dark", snapshot.props || []);
  st.setRoomInfo({
    connectionStatus: "connected",
    roomUsers: snapshot.users || [],
    connectionError: null,
    ...(snapshot.role ? { role: snapshot.role } : {}),
    ...(snapshot.youId ? { mySocketId: snapshot.youId } : {}),
  });
}

function rejoin() {
  if (!lastRoom) return;
  socket.emit("room:join", { roomId: lastRoom.roomId, name: lastRoom.name }, (snapshot: RoomSnapshot | null) => {
    if (snapshot) applySnapshot(snapshot);
  });
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

  socket.on("dice:rolled", (roll: DiceRoll) => {
    useBoardStore.getState().addRoll(roll);
  });

  socket.on("room:users", (users: RoomUser[]) => {
    useBoardStore.getState().setRoomInfo({ roomUsers: users });
  });

  socket.on("role:update", ({ role }: { role: PlayerRole }) => {
    useBoardStore.getState().setRoomInfo({ role });
  });

  socket.on("prop:added", (p: PropData) => {
    const st = useBoardStore.getState();
    if (!st.props.some((x) => x.id === p.id)) st.addProp(p);
  });
  socket.on("prop:updated", ({ id, patch }: { id: string; patch: Partial<PropData> }) => {
    useBoardStore.getState().updateProp(id, patch);
  });
  socket.on("prop:removed", (id: string) => useBoardStore.getState().removeProp(id));
  socket.on("map:loaded", ({ floor, props }: { floor: FloorKind; props: PropData[] }) => {
    useBoardStore.getState().loadMap(floor, props);
  });

  socket.on("disconnect", (reason: string) => {
    useBoardStore.getState().setRoomInfo({ connectionStatus: "disconnected" });
    // Se o servidor derrubou a conexao, tenta voltar (socket.io nao reconecta sozinho nesse caso).
    if (lastRoom && reason !== "io client disconnect") socket.connect();
  });

  // Reconexao: reentra na sala e recebe o estado atual, sem voltar ao menu.
  socket.on("connect", () => {
    if (lastRoom && useBoardStore.getState().roomId) rejoin();
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
        lastRoom = { roomId, name: playerName };
        applySnapshot(snapshot);
        useBoardStore.getState().setRoomInfo({ roomId });
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
  lastRoom = null;
  socket.disconnect();
  useBoardStore.getState().setRoomInfo({
    roomId: null,
    connectionStatus: "disconnected",
    roomUsers: [],
    role: null,
    mySocketId: null,
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

export function emitAddProp(p: PropData) {
  if (socket.connected) socket.emit("prop:add", p);
}
export function emitUpdateProp(id: string, patch: Partial<PropData>) {
  if (socket.connected) socket.emit("prop:update", { id, patch });
}
export function emitRemoveProp(id: string) {
  if (socket.connected) socket.emit("prop:remove", id);
}
export function emitLoadMap(floor: FloorKind, props: PropData[]) {
  if (socket.connected) socket.emit("map:load", { floor, props });
}

export function emitRoll(sides: number, count: number, modifier: number) {
  if (socket.connected) socket.emit("dice:roll", { sides, count, modifier });
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

import { create } from "zustand";
import type { CameraMode, DiceRoll, FloorKind, PropData, TokenData } from "./types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface BoardState {
  tokens: TokenData[];
  selectedTokenId: string | null;
  cameraMode: CameraMode;
  gridSize: number; // número de células por lado
  cellSize: number; // tamanho de cada célula em unidades 3D

  props: PropData[];
  selectedPropId: string | null;
  floor: FloorKind;
  night: boolean; // so visual/local
  interacting: boolean; // arrastando algo: trava o orbit da camera
  addProp: (p: PropData) => void;
  updateProp: (id: string, patch: Partial<PropData>) => void;
  removeProp: (id: string) => void;
  selectProp: (id: string | null) => void;
  loadMap: (floor: FloorKind, props: PropData[]) => void;
  setNight: (n: boolean) => void;
  setInteracting: (v: boolean) => void;

  rolls: DiceRoll[]; // histórico
  liveRolls: DiceRoll[]; // rolagens sendo animadas em 3D
  addRoll: (roll: DiceRoll) => void;
  setRolls: (rolls: DiceRoll[]) => void;
  finishLiveRoll: (id: string) => void;

  // Multiplayer
  roomId: string | null;
  playerName: string;
  connectionStatus: ConnectionStatus;
  roomUsers: string[];
  connectionError: string | null;

  addToken: (token: TokenData) => void;
  updateTokenPosition: (id: string, position: [number, number, number]) => void;
  updateToken: (id: string, patch: Partial<TokenData>) => void;
  removeToken: (id: string) => void;
  selectToken: (id: string | null) => void;
  setCameraMode: (mode: CameraMode) => void;

  setTokens: (tokens: TokenData[]) => void;
  setRoomInfo: (info: Partial<{
    roomId: string | null;
    playerName: string;
    connectionStatus: ConnectionStatus;
    roomUsers: string[];
    connectionError: string | null;
  }>) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  tokens: [],
  selectedTokenId: null,
  cameraMode: "3d",
  gridSize: 20,
  cellSize: 1,

  props: [],
  selectedPropId: null,
  floor: "dark",
  night: false,
  interacting: false,
  addProp: (p) => set((s) => ({ props: [...s.props, p] })),
  updateProp: (id, patch) =>
    set((s) => ({ props: s.props.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removeProp: (id) =>
    set((s) => ({
      props: s.props.filter((p) => p.id !== id),
      selectedPropId: s.selectedPropId === id ? null : s.selectedPropId,
    })),
  selectProp: (id) => set({ selectedPropId: id, selectedTokenId: null }),
  loadMap: (floor, props) => set({ floor, props, selectedPropId: null }),
  setNight: (night) => set({ night }),
  setInteracting: (interacting) => set({ interacting }),

  rolls: [],
  liveRolls: [],
  addRoll: (roll) =>
    set((state) => ({
      rolls: [...state.rolls, roll].slice(-50),
      liveRolls: [...state.liveRolls, roll],
    })),
  setRolls: (rolls) => set({ rolls, liveRolls: [] }),
  finishLiveRoll: (id) =>
    set((state) => ({ liveRolls: state.liveRolls.filter((r) => r.id !== id) })),

  roomId: null,
  playerName: "",
  connectionStatus: "disconnected",
  roomUsers: [],
  connectionError: null,

  addToken: (token) =>
    set((state) => ({ tokens: [...state.tokens, token] })),

  updateTokenPosition: (id, position) =>
    set((state) => ({
      tokens: state.tokens.map((t) => (t.id === id ? { ...t, position } : t)),
    })),

  updateToken: (id, patch) =>
    set((state) => ({
      tokens: state.tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  removeToken: (id) =>
    set((state) => ({
      tokens: state.tokens.filter((t) => t.id !== id),
      selectedTokenId: state.selectedTokenId === id ? null : state.selectedTokenId,
    })),

  selectToken: (id) => set({ selectedTokenId: id, selectedPropId: null }),

  setCameraMode: (mode) => set({ cameraMode: mode }),

  setTokens: (tokens) => set({ tokens }),

  setRoomInfo: (info) => set((state) => ({ ...state, ...info })),
}));

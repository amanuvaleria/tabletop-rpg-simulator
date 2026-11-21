import { create } from "zustand";
import type { CameraMode, TokenData } from "./types";

interface BoardState {
  tokens: TokenData[];
  selectedTokenId: string | null;
  cameraMode: CameraMode;
  gridSize: number; // número de células por lado
  cellSize: number; // tamanho de cada célula em unidades 3D

  addToken: (token: TokenData) => void;
  updateTokenPosition: (id: string, position: [number, number, number]) => void;
  updateToken: (id: string, patch: Partial<TokenData>) => void;
  removeToken: (id: string) => void;
  selectToken: (id: string | null) => void;
  setCameraMode: (mode: CameraMode) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  tokens: [],
  selectedTokenId: null,
  cameraMode: "3d",
  gridSize: 20,
  cellSize: 1,

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

  selectToken: (id) => set({ selectedTokenId: id }),

  setCameraMode: (mode) => set({ cameraMode: mode }),
}));

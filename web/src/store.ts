import { create } from "zustand";
import type {
  AssetCatalog, CameraMode, DiceRoll, FloorKind, LayerId, LayerState, MissingAsset, Mood, PlayerRole,
  PropData, ScenarioRef, SpriteData, TokenData,
} from "./types";
import { LAYER_META } from "./types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface RoomUser {
  name: string;
  role: PlayerRole;
}

interface BoardState {
  tokens: TokenData[];
  selectedTokenId: string | null;
  cameraMode: CameraMode;
  gridSize: number; // número de células por lado
  cellSize: number; // tamanho de cada célula em unidades 3D

  props: PropData[];
  selectedPropId: string | null;
  floor: FloorKind;
  mood: Mood; // clima/iluminacao (so visual/local)
  fx: boolean; // pos-processamento ligado
  interacting: boolean; // arrastando algo: trava o orbit da camera

  // Sprites da biblioteca, camadas e cenário ligado a esta sala
  selectedSpriteIds: string[];
  selectSprites: (ids: string[]) => void;
  toggleSprite: (id: string) => void;
  activeLayer: LayerId | "auto";
  setActiveLayer: (v: LayerId | "auto") => void;
  snapGrid: boolean;
  setSnapGrid: (v: boolean) => void;
  undoDepth: number;
  redoDepth: number;
  setHistoryDepth: (u: number, r: number) => void;
  notice: string | null;
  setNotice: (v: string | null) => void;
  patchLayer: (id: LayerId, patch: Partial<LayerState>) => void;
  sprites: SpriteData[];
  layers: LayerState[];
  scenario: ScenarioRef | null;
  missingAssets: MissingAsset[];
  catalog: AssetCatalog | null;
  setCatalog: (c: AssetCatalog | null) => void;
  setScenario: (s: ScenarioRef | null) => void;
  /** Substitui o mapa inteiro (props, sprites, camadas, piso, grade) de uma vez. */
  loadScene: (s: {
    floor: FloorKind; props: PropData[]; sprites?: SpriteData[]; layers?: LayerState[];
    gridSize?: number; cellSize?: number; scenario?: ScenarioRef | null; missing?: MissingAsset[];
  }) => void;
  addProp: (p: PropData) => void;
  updateProp: (id: string, patch: Partial<PropData>) => void;
  removeProp: (id: string) => void;
  selectProp: (id: string | null) => void;
  loadMap: (floor: FloorKind, props: PropData[]) => void;
  setMood: (m: Mood) => void;
  setFx: (v: boolean) => void;
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
  roomUsers: RoomUser[];
  connectionError: string | null;
  role: PlayerRole | null; // meu papel nesta sala
  mySocketId: string | null;

  addToken: (token: TokenData) => void;
  updateTokenPosition: (id: string, position: [number, number, number]) => void;
  updateToken: (id: string, patch: Partial<TokenData>) => void;
  removeToken: (id: string) => void;
  selectToken: (id: string | null) => void;
  setCameraMode: (mode: CameraMode) => void;

  // Ficha de personagem/NPC
  sheetOpenTokenId: string | null;
  openSheet: (id: string) => void;
  closeSheet: () => void;

  setTokens: (tokens: TokenData[]) => void;
  setRoomInfo: (info: Partial<{
    roomId: string | null;
    playerName: string;
    connectionStatus: ConnectionStatus;
    roomUsers: RoomUser[];
    connectionError: string | null;
    role: PlayerRole | null;
    mySocketId: string | null;
  }>) => void;

  /** GM pode tudo; jogador só controla o que ele mesmo criou (ownerId). Tokens sem
   * ownerId (de antes dessa feature) seguem livres pra qualquer um, por compatibilidade. */
  canControlToken: (token: TokenData) => boolean;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tokens: [],
  selectedTokenId: null,
  cameraMode: "3d",
  gridSize: 20,
  cellSize: 1,

  props: [],
  selectedPropId: null,
  floor: "dark",
  mood: "fog",
  fx: localStorage.getItem("fx") !== "off",
  interacting: false,
  selectedSpriteIds: [],
  selectSprites: (ids) => set({selectedSpriteIds: ids, selectedTokenId:null, selectedPropId:null}),
  toggleSprite: (id) => set(s => ({selectedSpriteIds:s.selectedSpriteIds.includes(id)?s.selectedSpriteIds.filter(x=>x!==id):[...s.selectedSpriteIds,id],selectedTokenId:null,selectedPropId:null})),
  activeLayer: "auto",
  setActiveLayer: (activeLayer) => set({activeLayer}),
  snapGrid: true,
  setSnapGrid: (snapGrid) => set({snapGrid}),
  undoDepth:0, redoDepth:0,
  setHistoryDepth: (undoDepth,redoDepth)=>set({undoDepth,redoDepth}),
  notice:null, setNotice:(notice)=>set({notice}),
  patchLayer:(id,patch)=>set(s=>({layers:s.layers.map(l=>l.id===id?{...l,...patch}:l)})),
  sprites: [],
  layers: LAYER_META.map((l) => ({ id: l.id, visible: true, locked: false })),
  scenario: null,
  missingAssets: [],
  catalog: null,
  setCatalog: (catalog) => set({ catalog }),
  setScenario: (scenario) => set({ scenario }),
  loadScene: (s) =>
    set((st) => ({
      floor: s.floor,
      props: s.props,
      sprites: s.sprites ?? [],
      layers: s.layers ?? st.layers,
      gridSize: s.gridSize ?? st.gridSize,
      cellSize: s.cellSize ?? st.cellSize,
      scenario: s.scenario === undefined ? st.scenario : s.scenario,
      missingAssets: s.missing ?? st.missingAssets,
      selectedPropId: null, selectedSpriteIds: [],
    })),
  addProp: (p) => set((s) => ({ props: [...s.props, p] })),
  updateProp: (id, patch) =>
    set((s) => ({ props: s.props.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removeProp: (id) =>
    set((s) => ({
      props: s.props.filter((p) => p.id !== id),
      selectedPropId: s.selectedPropId === id ? null : s.selectedPropId,
    })),
  selectProp: (id) => set({ selectedPropId: id, selectedTokenId: null, selectedSpriteIds: [] }),
  loadMap: (floor, props) => set({ floor, props, selectedPropId: null }),
  setMood: (mood) => set({ mood }),
  setFx: (fx) => {
    localStorage.setItem("fx", fx ? "on" : "off");
    set({ fx });
  },
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
  role: null,
  mySocketId: null,

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

  selectToken: (id) => set({ selectedTokenId: id, selectedPropId: null, selectedSpriteIds: [] }),

  setCameraMode: (mode) => set({ cameraMode: mode }),

  sheetOpenTokenId: null,
  openSheet: (id) => set({ sheetOpenTokenId: id }),
  closeSheet: () => set({ sheetOpenTokenId: null }),

  setTokens: (tokens) => set({ tokens }),

  setRoomInfo: (info) => set((state) => ({ ...state, ...info })),

  canControlToken: (token) => {
    const { role, mySocketId } = get();
    if (role === "gm") return true;
    if (!token.ownerId) return true; // tokens antigos sem dono: livres
    return token.ownerId === mySocketId;
  },
}));

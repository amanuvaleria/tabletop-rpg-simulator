export type TokenKind = "character" | "npc" | "object";

export interface CharacterSheet {
  hp: number;
  maxHp: number;
  ac: number; // classe de armadura / defesa
  attributes: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  notes: string;
}

export function defaultSheet(): CharacterSheet {
  return {
    hp: 10,
    maxHp: 10,
    ac: 10,
    attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    notes: "",
  };
}

export interface TokenData {
  id: string;
  name: string;
  kind: TokenKind;
  imageUrl: string; // data URL ou URL remota do PNG
  position: [number, number, number]; // x, y (altura), z no tabuleiro
  scale: number; // tamanho relativo do token
  rotationY: number; // rotação no plano do tabuleiro (graus)
  sheet?: CharacterSheet; // ficha: só personagens e NPCs têm
  ownerId?: string; // socket.id de quem criou/controla (definido pelo servidor)
  ownerName?: string; // nome de quem controla, pra exibir na UI
}

export type PlayerRole = "gm" | "player";

export type CameraMode = "2d" | "3d";

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export interface DiceRoll {
  id: string;
  user: string;
  sides: number;
  results: number[];
  modifier: number;
  total: number;
  at: number; // timestamp (ms)
}

export type FloorKind = "dark" | "grass" | "dirt" | "asphalt" | "cobble";

export interface PropData {
  id: string;
  kind: string; // ver props/catalog.ts
  position: [number, number, number];
  rotationY: number; // radianos
  scale: number;
  on?: boolean; // props com luz (poste, tocha, fogueira)
}

export type Mood = "fog" | "clear" | "night";

// ---- Cenários, camadas e biblioteca de assets (espelham server/lib/*)
export type LayerId =
  | "terrain" | "structures" | "openings" | "furniture"
  | "decor" | "characters" | "effects" | "lighting";

export const LAYER_META: { id: LayerId; label: string }[] = [
  { id: "terrain", label: "Terreno e pisos" },
  { id: "structures", label: "Paredes e estruturas" },
  { id: "openings", label: "Portas e janelas" },
  { id: "furniture", label: "Móveis e objetos" },
  { id: "decor", label: "Decorações e detalhes" },
  { id: "characters", label: "Personagens e criaturas" },
  { id: "effects", label: "Efeitos visuais" },
  { id: "lighting", label: "Iluminação e atmosfera" },
];

export interface LayerState {
  id: LayerId;
  visible: boolean;
  locked: boolean;
}

/** Objeto da biblioteca colocado no mapa. position = [x, z] no plano; rotation em radianos. */
export interface SpriteData {
  id: string;
  asset: string; // id no catálogo, ex.: "pacote/mesa_01"
  layer: LayerId;
  position: [number, number];
  rotation: number;
  scale: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  locked: boolean;
  z: number; // ordem dentro da camada
}

export interface AssetDef {
  id: string;
  name: string;
  category: string;
  tags: string[];
  pack: string;
  source: "pack" | "upload";
  url: string; // relativo ao servidor
  width: number;
  height: number;
  alpha: boolean;
  format: "png" | "webp" | "svg";
  sha256: string;
  footprint: [number, number] | null;
  height3d: number | null;
  opacity: number;
  model3d: { type: "glb"; url: string } | null;
}

export interface AssetCatalog {
  categories: { id: string; label: string }[];
  packs: { id: string; name: string; license?: string | null; author?: string | null; builtin: boolean; count: number }[];
  assets: AssetDef[];
  warnings: string[];
}

export interface ScenarioMeta {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  props: number;
  sprites: number;
  floor?: string;
}

export interface TrashItem {
  file: string;
  id: string;
  name: string;
  deletedAt: number;
}

export interface MissingAsset {
  id: string;
  name: string;
  count: number;
}

export interface ScenarioRef {
  id: string;
  name: string;
}

export type TokenKind = "character" | "npc" | "object";

export interface TokenData {
  id: string;
  name: string;
  kind: TokenKind;
  imageUrl: string; // data URL ou URL remota do PNG
  position: [number, number, number]; // x, y (altura), z no tabuleiro
  scale: number; // tamanho relativo do token
  rotationY: number; // rotação no plano do tabuleiro (graus)
}

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

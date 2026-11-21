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

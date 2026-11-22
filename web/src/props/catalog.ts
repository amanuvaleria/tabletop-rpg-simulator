import type { FloorKind, PropData } from "../types";

export interface PropDef {
  label: string;
  category: string;
  light?: boolean; // clique liga/desliga
  snap: number; // passo de encaixe ao arrastar
  offset?: number; // deslocamento do encaixe (ruas encaixam em centros ímpares)
}

export const CATEGORIES = ["Casas", "Ruas", "Natureza", "Luz", "Mobília e cenário"] as const;

export const PROP_CATALOG: Record<string, PropDef> = {
  house_modern: { label: "Casa moderna", category: "Casas", snap: 0.5 },
  building_modern: { label: "Prédio moderno", category: "Casas", snap: 0.5 },
  house_medieval: { label: "Casa medieval", category: "Casas", snap: 0.5 },
  tavern_medieval: { label: "Taverna", category: "Casas", snap: 0.5 },
  tower_medieval: { label: "Torre", category: "Casas", snap: 0.5 },
  mansion_dark: { label: "Mansão sombria", category: "Casas", snap: 0.5 },

  road_modern: { label: "Asfalto", category: "Ruas", snap: 2, offset: 1 },
  road_cobble: { label: "Pedra medieval", category: "Ruas", snap: 2, offset: 1 },
  sidewalk: { label: "Calçada", category: "Ruas", snap: 2, offset: 1 },
  dirt_path: { label: "Trilha de terra", category: "Ruas", snap: 2, offset: 1 },

  tree: { label: "Árvore", category: "Natureza", snap: 0.5 },
  pine: { label: "Pinheiro", category: "Natureza", snap: 0.5 },
  dead_tree: { label: "Árvore morta", category: "Natureza", snap: 0.5 },
  bush: { label: "Arbusto", category: "Natureza", snap: 0.5 },
  rock: { label: "Pedra", category: "Natureza", snap: 0.5 },

  lamp_modern: { label: "Poste moderno", category: "Luz", light: true, snap: 0.5 },
  lamp_medieval: { label: "Lampião medieval", category: "Luz", light: true, snap: 0.5 },
  torch: { label: "Tocha", category: "Luz", light: true, snap: 0.5 },
  campfire: { label: "Fogueira", category: "Luz", light: true, snap: 0.5 },

  fence: { label: "Cerca", category: "Mobília e cenário", snap: 0.5 },
  wall_stone: { label: "Muro de pedra", category: "Mobília e cenário", snap: 0.5 },
  well: { label: "Poço", category: "Mobília e cenário", snap: 0.5 },
  bench: { label: "Banco", category: "Mobília e cenário", snap: 0.5 },
  car: { label: "Carro", category: "Mobília e cenário", snap: 0.5 },
  crate: { label: "Caixote", category: "Mobília e cenário", snap: 0.5 },
  barrel: { label: "Barril", category: "Mobília e cenário", snap: 0.5 },
  cart: { label: "Carroça", category: "Mobília e cenário", snap: 0.5 },
  tombstone: { label: "Lápide", category: "Mobília e cenário", snap: 0.5 },
  tent: { label: "Barraca", category: "Mobília e cenário", snap: 0.5 },
};

export const FLOORS: Record<FloorKind, { label: string; color: string }> = {
  dark: { label: "Escuro", color: "#2b2320" },
  grass: { label: "Grama", color: "#3f5f2e" },
  dirt: { label: "Terra", color: "#5b4631" },
  asphalt: { label: "Asfalto", color: "#2c2f33" },
  cobble: { label: "Pedra", color: "#55504a" },
};

export function snapValue(kind: string, v: number): number {
  const def = PROP_CATALOG[kind];
  const step = def?.snap ?? 0.5;
  const off = def?.offset ?? 0;
  return Math.round((v - off) / step) * step + off;
}

export function newProp(kind: string, x = 0, z = 0, rotationY = 0, scale = 1): PropData {
  return {
    id: crypto.randomUUID(),
    kind,
    position: [x, 0, z],
    rotationY,
    scale,
    on: PROP_CATALOG[kind]?.light ? true : undefined,
  };
}

// ---------------------------------------------------------------------------
// Mapas prontos. Tabuleiro padrão: 20x20, coordenadas de -10 a 10.
// A frente das casas aponta para +Z com rotationY = 0.
// ---------------------------------------------------------------------------
export interface MapPreset {
  id: string;
  label: string;
  floor: FloorKind;
  build: () => PropData[];
}

const P = newProp;
const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(v);
  return out;
};

export const MAP_PRESETS: MapPreset[] = [
  {
    id: "rua_moderna",
    label: "Rua moderna",
    floor: "grass",
    build: () => [
      ...range(-9, 9, 2).map((x) => P("road_modern", x, 1)),
      ...range(-9, 9, 2).map((x) => P("sidewalk", x, -1)),
      ...range(-9, 9, 2).map((x) => P("sidewalk", x, 3)),
      P("house_modern", -6, -5),
      P("house_modern", 0, -5.5, 0, 1.1),
      P("building_modern", 6, -5.5),
      P("house_modern", -6, 7, Math.PI),
      P("building_modern", -0.5, 7.5, Math.PI),
      P("house_modern", 6, 7, Math.PI),
      P("lamp_modern", -8, -1.7),
      P("lamp_modern", -2, -1.7),
      P("lamp_modern", 4, -1.7),
      P("lamp_modern", -5, 3.7, Math.PI),
      P("lamp_modern", 1, 3.7, Math.PI),
      P("lamp_modern", 7, 3.7, Math.PI),
      P("car", -4, 1.5, Math.PI / 2),
      P("car", 5, 0.5, -Math.PI / 2),
      P("tree", -9, -8),
      P("tree", 9, -8.5),
      P("tree", 9, 9),
      P("bush", -9, 9),
      P("bench", 3, -2.2),
    ],
  },
  {
    id: "rua_medieval",
    label: "Rua medieval",
    floor: "dirt",
    build: () => [
      ...range(-9, 9, 2).map((x) => P("road_cobble", x, 1)),
      P("tavern_medieval", -5, -5),
      P("house_medieval", 1, -5),
      P("house_medieval", 7, -5.5, 0, 1.1),
      P("house_medieval", -7, 7, Math.PI),
      P("house_medieval", -1, 7, Math.PI),
      P("tower_medieval", 7, 7.5, Math.PI),
      P("lamp_medieval", -8, -0.8),
      P("lamp_medieval", -2, -0.8),
      P("lamp_medieval", 4, -0.8),
      P("lamp_medieval", -4, 2.8, Math.PI),
      P("lamp_medieval", 2, 2.8, Math.PI),
      P("barrel", -3.3, -2.4),
      P("barrel", -2.6, -2.6),
      P("crate", 3, -2.4),
      P("cart", 5, 3, 0.4),
      P("well", 8, 3),
      P("tree", -9, -8),
      P("tree", 9.5, -9),
    ],
  },
  {
    id: "vila_medieval",
    label: "Vila medieval",
    floor: "grass",
    build: () => [
      ...range(-9, 9, 2).map((x) => P("dirt_path", x, 1)),
      ...range(-7, -3, 2).map((z) => P("dirt_path", 1, z)),
      ...range(3, 9, 2).map((z) => P("dirt_path", 1, z)),
      P("well", 1, 1.6),
      P("tavern_medieval", -5, -3),
      P("house_medieval", 5, -3.5),
      P("house_medieval", -6, 5.5, Math.PI),
      P("house_medieval", 6, 5.5, Math.PI),
      P("tower_medieval", 1, -8.5),
      P("fence", -9, -9, 0),
      P("fence", -7, -9, 0),
      P("fence", -5, -9, 0),
      P("lamp_medieval", -1.5, 0),
      P("lamp_medieval", 3.5, 2, Math.PI),
      P("campfire", 7, 9),
      P("tent", 5, 9),
      P("tree", -9, 8),
      P("tree", -8, 3),
      P("tree", 9, -8),
      P("pine", 9, 1),
      P("bush", -3, 9),
      P("rock", 3, 9.3),
    ],
  },
  {
    id: "floresta",
    label: "Floresta com acampamento",
    floor: "grass",
    build: () => [
      ...range(-9, 9, 1.5).flatMap((x, i) => [
        P(i % 2 ? "pine" : "tree", x, -9 + (i % 3) * 0.7),
        P(i % 2 ? "tree" : "pine", x + 0.4, 9 - (i % 3) * 0.7),
      ]),
      P("pine", -9, -3),
      P("pine", -9.4, 1),
      P("tree", -8.5, 4.5),
      P("pine", 9, -3.5),
      P("tree", 9.3, 1.5),
      P("pine", 8.8, 5),
      P("campfire", 0, 0),
      P("tent", -2.5, -1.5, 0.6),
      P("tent", 2.5, -1.5, -0.6),
      P("tent", 0, -3.5, 0),
      P("rock", 2, 2.5),
      P("rock", -2.5, 2.2),
      P("bush", -5, 3),
      P("bush", 5, 2),
      P("bench", 0, 2.5, Math.PI),
      P("torch", -3.5, 0.8),
      P("torch", 3.5, 0.8),
    ],
  },
  {
    id: "cemiterio",
    label: "Cemitério assombrado",
    floor: "dark",
    build: () => [
      P("mansion_dark", 0, -7.5),
      P("wall_stone", -9, 9),
      P("wall_stone", -7, 9),
      P("wall_stone", -5, 9),
      P("wall_stone", 5, 9),
      P("wall_stone", 7, 9),
      P("wall_stone", 9, 9),
      P("dead_tree", -8, -4),
      P("dead_tree", 8, -3),
      P("dead_tree", -7, 4),
      P("dead_tree", 7.5, 5),
      ...[-6, -3, 3, 6].flatMap((x) => [P("tombstone", x, 1), P("tombstone", x + 0.3, 4.5)]),
      P("tombstone", 0, 3, 0.2),
      P("lamp_medieval", -2, 7),
      P("lamp_medieval", 2, 7),
      P("torch", -2, -3),
      P("torch", 2, -3),
      P("bush", -9, 0),
      P("bush", 9, 1),
    ],
  },
  {
    id: "praca_moderna",
    label: "Praça moderna",
    floor: "cobble",
    build: () => [
      ...range(-3, 3, 2).flatMap((x) => range(-3, 3, 2).map((z) => P("sidewalk", x, z))),
      P("well", 0, 0, 0, 1.2),
      P("bench", -3, 0, Math.PI / 2),
      P("bench", 3, 0, -Math.PI / 2),
      P("bench", 0, -3, 0),
      P("bench", 0, 3, Math.PI),
      P("lamp_modern", -4.5, -4.5),
      P("lamp_modern", 4.5, -4.5),
      P("lamp_modern", -4.5, 4.5),
      P("lamp_modern", 4.5, 4.5),
      P("building_modern", -7, -7.5),
      P("building_modern", 0, -8, 0, 1.2),
      P("building_modern", 7, -7.5),
      P("house_modern", -8, 7, Math.PI),
      P("house_modern", 8, 7, Math.PI),
      P("tree", -6, 0),
      P("tree", 6, 0),
      P("tree", -6, 3),
      P("tree", 6, -3),
      P("bush", -6, -3),
      P("bush", 6, 3),
      P("car", 0, 9, Math.PI / 2),
    ],
  },
];

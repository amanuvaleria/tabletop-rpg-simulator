import * as THREE from "three";
import type { AssetDef, LayerId } from "../types";

/** Camada padrão de cada categoria da biblioteca (o Mestre pode forçar outra pela "camada ativa"). */
const CATEGORY_LAYER: Record<string, LayerId> = {
  tiles: "terrain",
  walls: "structures",
  stairs: "structures",
  doors: "openings",
  windows: "openings",
  furniture: "furniture",
  investigation: "furniture",
  hospital: "furniture",
  urban: "furniture",
  paranormal: "decor",
  nature: "decor",
  effects: "effects",
  tokens: "characters",
  misc: "decor",
};

export const layerForAsset = (a: AssetDef): LayerId => CATEGORY_LAYER[a.category] ?? "decor";

/** Sem `footprint` definido, 128 px equivalem a uma célula; limitado a 0,25–20 células mantendo a proporção. */
const PX_PER_CELL = 128;

/** Tamanho no mundo (unidades 3D) de um sprite com escala 1. */
export function spriteSize(a: AssetDef | undefined, cellSize: number): [number, number] {
  if (!a) return [cellSize, cellSize];
  if (a.footprint) return [a.footprint[0] * cellSize, a.footprint[1] * cellSize];
  const cw = a.width / PX_PER_CELL;
  const ch = a.height / PX_PER_CELL;
  const m = Math.max(cw, ch);
  const k = m > 20 ? 20 / m : m < 0.25 ? 0.25 / m : 1;
  return [cw * k * cellSize, ch * k * cellSize];
}

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Interseção de um raio com o plano do chão (y = 0). */
export function rayToGround(ray: THREE.Ray): [number, number] | null {
  const hit = new THREE.Vector3();
  return ray.intersectPlane(GROUND, hit) ? [hit.x, hit.z] : null;
}

// Ponte tela→chão, registrada por um componente dentro do <Canvas> (usada pelo arrastar-e-soltar da biblioteca).
let groundFromClient: ((cx: number, cy: number) => [number, number] | null) | null = null;
export const setGroundFromClient = (fn: typeof groundFromClient) => {
  groundFromClient = fn;
};
export const clientToGround = (cx: number, cy: number) => (groundFromClient ? groundFromClient(cx, cy) : null);

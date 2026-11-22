import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useBoardStore } from "../store";
import { getTextures, type TexKind } from "../props/textures";
import type { FloorKind } from "../types";

const FLOOR_LOOK: Record<FloorKind, { tex: TexKind; tint: string }> = {
  dark: { tex: "dirt", tint: "#6a5e54" },
  grass: { tex: "grass", tint: "#ffffff" },
  dirt: { tex: "dirt", tint: "#ffffff" },
  asphalt: { tex: "stone", tint: "#6a6d72" },
  cobble: { tex: "cobble", tint: "#ffffff" },
};

const GROUND = 160; // chão enorme: a névoa esconde a borda
const TILE = 3.2; // metros por repetição da textura

/** Chão texturizado, relva instanciada (no piso de grama) e grade discreta. */
export default function Board() {
  const gridSize = useBoardStore((s) => s.gridSize);
  const cellSize = useBoardStore((s) => s.cellSize);
  const floor = useBoardStore((s) => s.floor);
  const size = gridSize * cellSize;
  const look = FLOOR_LOOK[floor];

  const { map, bump } = useMemo(() => {
    const base = getTextures(look.tex);
    const m = base.map.clone();
    const b = base.bump.clone();
    for (const t of [m, b]) {
      t.repeat.set(GROUND / TILE, GROUND / TILE);
      t.needsUpdate = true;
    }
    return { map: m, bump: b };
  }, [look.tex]);
  useEffect(
    () => () => {
      map.dispose();
      bump.dispose();
    },
    [map, bump]
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow name="board-floor">
        <planeGeometry args={[GROUND, GROUND]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={1.2} color={look.tint} roughness={1} />
      </mesh>

      {floor === "grass" && <GrassTufts size={size} />}

      <gridHelper
        args={[size, gridSize, "#d8e4d0", "#d8e4d0"]}
        position={[0, 0.012, 0]}
        onUpdate={(g) => {
          const mats = Array.isArray(g.material) ? g.material : [g.material];
          mats.forEach((m) => {
            m.transparent = true;
            m.opacity = 0.06;
            m.depthWrite = false;
          });
        }}
      />
    </group>
  );
}

/** ~10 mil lâminas de relva em uma única chamada de desenho. */
function GrassTufts({ size }: { size: number }) {
  const COUNT = 3200;
  const mesh = useMemo(() => {
    const g = new THREE.ConeGeometry(0.035, 0.34, 3, 1);
    g.translate(0, 0.17, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), COUNT * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const col = new THREE.Color();
    let seed = 12345;
    const r = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const half = size / 2 + 6;
    let n = 0;
    for (let i = 0; i < COUNT; i++) {
      const cx = (r() - 0.5) * 2 * half;
      const cz = (r() - 0.5) * 2 * half;
      for (let k = 0; k < 3; k++) {
        pos.set(cx + (r() - 0.5) * 0.18, 0, cz + (r() - 0.5) * 0.18);
        e.set((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5);
        q.setFromEuler(e);
        sc.set(1, 0.6 + r() * 1.1, 1);
        m.compose(pos, q, sc);
        im.setMatrixAt(n, m);
        col.setHSL(0.24 + r() * 0.06, 0.45 + r() * 0.2, 0.2 + r() * 0.16);
        im.setColorAt(n, col);
        n++;
      }
    }
    im.receiveShadow = true;
    return im;
  }, [size]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh]
  );
  return <primitive object={mesh} />;
}

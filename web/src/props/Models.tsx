import { KIT_KINDS, KitModel } from "./KenneyKit";
import type React from "react";
import { useMemo } from "react";
import * as THREE from "three";
import { MEDIEVAL_KINDS, MedievalModel } from "./MedievalModels";

/** Modelos 3D procedurais (formas básicas). Origem no chão; frente das construções = +Z. */

const Mat = ({ color, rough = 0.85, emissive, ei = 0 }: { color: string; rough?: number; emissive?: string; ei?: number }) => (
  <meshStandardMaterial color={color} roughness={rough} emissive={emissive ?? "#000"} emissiveIntensity={ei} />
);

function Box({ p, s, color, rough, emissive, ei }: { p: [number, number, number]; s: [number, number, number]; color: string; rough?: number; emissive?: string; ei?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <Mat color={color} rough={rough} emissive={emissive} ei={ei} />
    </mesh>
  );
}

/** Telhado de duas águas (prisma triangular) com o cume ao longo de X. */
function Gable({ w, d, h, y, color }: { w: number; d: number; h: number; y: number; color: string }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2 - 0.15, 0);
    shape.lineTo(d / 2 + 0.15, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w + 0.3, bevelEnabled: false });
    g.translate(0, 0, -(w + 0.3) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [w, d, h]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} castShadow>
      <Mat color={color} />
    </mesh>
  );
}

function Windows({ cols, rows, w, h, zFace, x0, dx, y0, dy, glow }: { cols: number; rows: number; w: number; h: number; zFace: number; x0: number; dx: number; y0: number; dy: number; glow?: boolean }) {
  const items: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      items.push(
        <mesh key={`${r}-${c}`} position={[x0 + c * dx, y0 + r * dy, zFace]}>
          <boxGeometry args={[w, h, 0.04]} />
          <Mat color="#9fc9e8" rough={0.2} emissive={glow ? "#ffd27a" : "#000"} ei={glow ? 0.6 : 0} />
        </mesh>
      );
  return <>{items}</>;
}

function HouseModern() {
  return (
    <group>
      <Box p={[0, 0.9, 0]} s={[3, 1.8, 3]} color="#e8e4dc" />
      <Box p={[0, 1.88, 0]} s={[3.2, 0.12, 3.2]} color="#3a3d44" />
      <Box p={[0.6, 0.65, 1.52]} s={[0.6, 1.3, 0.05]} color="#5b3a29" />
      <Windows cols={2} rows={1} w={0.7} h={0.7} zFace={1.51} x0={-0.9} dx={1.1} y0={1.1} dy={0} />
      <Box p={[-0.9, 1.1, 0]} s={[0.05, 0.6, 1]} color="#9fc9e8" />
    </group>
  );
}

function BuildingModern() {
  return (
    <group>
      <Box p={[0, 2.2, 0]} s={[3, 4.4, 3]} color="#b9bec6" />
      <Box p={[0, 4.5, 0]} s={[3.2, 0.14, 3.2]} color="#43464d" />
      <Windows cols={3} rows={4} w={0.55} h={0.6} zFace={1.51} x0={-0.9} dx={0.9} y0={0.9} dy={1} />
      <Box p={[0, 0.5, 1.52]} s={[0.8, 1, 0.05]} color="#2b4a63" />
    </group>
  );
}

function HouseMedieval({ big }: { big?: boolean }) {
  const h = big ? 2.6 : 1.6;
  return (
    <group>
      <Box p={[0, 0.2, 0]} s={[3, 0.4, 3]} color="#6e675f" />
      <Box p={[0, 0.4 + (h - 0.4) / 2, 0]} s={[2.8, h - 0.4, 2.8]} color="#cdbb94" />
      {/* vigas de madeira */}
      {[-1.4, 1.4].map((x) => (
        <Box key={x} p={[x, 0.4 + (h - 0.4) / 2, 1.41]} s={[0.14, h - 0.4, 0.06]} color="#4a3322" />
      ))}
      <Box p={[0, h - 0.05, 1.41]} s={[2.9, 0.12, 0.06]} color="#4a3322" />
      <Gable w={2.9} d={2.9} h={1.3} y={h} color="#7a3b2a" />
      <Box p={[0, 0.85, 1.42]} s={[0.6, 0.9, 0.06]} color="#4a3322" />
      <Box p={[-0.9, 1.0, 1.42]} s={[0.4, 0.4, 0.05]} color="#e6c46e" rough={0.3} emissive="#e6a53a" ei={0.3} />
      <Box p={[0.95, 1.0, 1.42]} s={[0.4, 0.4, 0.05]} color="#e6c46e" rough={0.3} emissive="#e6a53a" ei={0.3} />
      <Box p={[0.9, h + 0.9, -0.3]} s={[0.35, 1, 0.35]} color="#6e675f" />
    </group>
  );
}

function Tavern() {
  return (
    <group>
      <HouseMedieval big />
      <Box p={[-1.2, 1.6, 1.75]} s={[0.7, 0.5, 0.06]} color="#7a5a2a" />
      <Box p={[-1.2, 1.98, 1.75]} s={[0.06, 0.3, 0.06]} color="#2a1c10" />
      <Box p={[-1.9, 0.5, 1.8]} s={[0.4, 0.5, 0.4]} color="#5a3d22" />
    </group>
  );
}

function Tower() {
  return (
    <group>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[1.0, 1.15, 3.4, 14]} />
        <Mat color="#8a867f" />
      </mesh>
      <mesh position={[0, 3.55, 0]} castShadow>
        <cylinderGeometry args={[1.25, 1.0, 0.3, 14]} />
        <Mat color="#77736c" />
      </mesh>
      <mesh position={[0, 4.6, 0]} castShadow>
        <coneGeometry args={[1.35, 1.8, 14]} />
        <Mat color="#6d2f2a" />
      </mesh>
      <Box p={[0, 0.5, 1.08]} s={[0.6, 0.9, 0.08]} color="#3f2b1b" />
      <Box p={[0, 2.4, 1.05]} s={[0.25, 0.5, 0.08]} color="#1a1612" />
    </group>
  );
}

function MansionDark() {
  return (
    <group>
      <Box p={[0, 1.6, 0]} s={[5, 3.2, 3.4]} color="#3a3640" />
      <Box p={[-1.9, 3.2, 0]} s={[1.2, 1.6, 1.2]} color="#34303a" />
      <Gable w={5} d={3.4} h={1.6} y={3.2} color="#1f1c25" />
      <Windows cols={3} rows={2} w={0.45} h={0.7} zFace={1.71} x0={-1.5} dx={1.5} y0={0.9} dy={1.4} />
      <Box p={[0, 0.6, 1.72]} s={[0.9, 1.2, 0.06]} color="#1a1410" />
      <Box p={[-1.9, 3.5, 0.62]} s={[0.35, 0.6, 0.05]} color="#d8e0a8" rough={0.3} emissive="#c8d890" ei={0.6} />
    </group>
  );
}

function Tree() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 1.2, 8]} />
        <Mat color="#6b4a2f" />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <icosahedronGeometry args={[0.85, 1]} />
        <Mat color="#3f7a35" />
      </mesh>
      <mesh position={[0.4, 1.4, 0.2]} castShadow>
        <icosahedronGeometry args={[0.5, 1]} />
        <Mat color="#4a8a3c" />
      </mesh>
    </group>
  );
}

function Pine() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
        <Mat color="#5b3f28" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.9 + i * 0.6, 0]} castShadow>
          <coneGeometry args={[0.85 - i * 0.22, 1.1, 8]} />
          <Mat color={i % 2 ? "#2f6a3a" : "#285a32"} />
        </mesh>
      ))}
    </group>
  );
}

function DeadTree() {
  const branches: [number, number][] = [[0.9, 0.5], [-0.8, -0.4], [0.5, -1]];
  return (
    <group>
      <mesh position={[0, 0.9, 0]} rotation={[0, 0, 0.05]} castShadow>
        <cylinderGeometry args={[0.07, 0.18, 1.8, 6]} />
        <Mat color="#3b3029" />
      </mesh>
      {branches.map(([rz, ry], i) => (
        <mesh key={i} position={[Math.sin(ry) * 0.25, 1.4 + i * 0.2, Math.cos(ry) * 0.25]} rotation={[0, ry, rz]} castShadow>
          <cylinderGeometry args={[0.03, 0.06, 0.9, 5]} />
          <Mat color="#3b3029" />
        </mesh>
      ))}
    </group>
  );
}

function Bush() {
  return (
    <mesh position={[0, 0.3, 0]} scale={[1, 0.7, 1]} castShadow>
      <icosahedronGeometry args={[0.5, 1]} />
      <Mat color="#3a7030" />
    </mesh>
  );
}

function Rock() {
  return (
    <mesh position={[0, 0.25, 0]} scale={[1, 0.7, 0.85]} rotation={[0.3, 0.6, 0]} castShadow>
      <dodecahedronGeometry args={[0.45, 0]} />
      <Mat color="#7a7770" />
    </mesh>
  );
}

/** Luz: o ponto de luz fica sempre montado (só muda a intensidade) para não recompilar shaders. */
function LightSource({ on, y, color, intensity = 14, distance = 9 }: { on: boolean; y: number; color: string; intensity?: number; distance?: number }) {
  return <pointLight position={[0, y, 0]} color={color} intensity={on ? intensity : 0} distance={distance} decay={2} />;
}

function LampModern({ on }: { on: boolean }) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 2.6, 8]} />
        <Mat color="#3a3d42" />
      </mesh>
      <Box p={[0.22, 2.6, 0]} s={[0.55, 0.06, 0.06]} color="#3a3d42" />
      <mesh position={[0.42, 2.52, 0]}>
        <boxGeometry args={[0.28, 0.1, 0.16]} />
        <Mat color={on ? "#fff4cf" : "#8a8d92"} emissive="#fff0b8" ei={on ? 2.2 : 0} />
      </mesh>
      <group position={[0.42, 0, 0]}>
        <LightSource on={on} y={2.4} color="#fff1c4" intensity={16} distance={10} />
      </group>
    </group>
  );
}

function LampMedieval({ on }: { on: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 1.8, 8]} />
        <Mat color="#2f2924" />
      </mesh>
      <Box p={[0.18, 1.78, 0]} s={[0.36, 0.05, 0.05]} color="#2f2924" />
      <mesh position={[0.34, 1.62, 0]}>
        <boxGeometry args={[0.2, 0.28, 0.2]} />
        <Mat color={on ? "#ffd27a" : "#4a443c"} emissive="#ff9a2e" ei={on ? 2.2 : 0} />
      </mesh>
      <group position={[0.34, 0, 0]}>
        <LightSource on={on} y={1.6} color="#ffb455" intensity={11} distance={8} />
      </group>
    </group>
  );
}

function Torch({ on }: { on: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 1, 6]} />
        <Mat color="#5b3f28" />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <coneGeometry args={[0.1, 0.3, 8]} />
        <Mat color={on ? "#ffb347" : "#2a2420"} emissive="#ff7a1a" ei={on ? 2.5 : 0} />
      </mesh>
      <LightSource on={on} y={1.3} color="#ff9a3c" intensity={10} distance={7} />
    </group>
  );
}

function Campfire({ on }: { on: boolean }) {
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 3) * 0.32, 0.08, Math.sin((i * Math.PI) / 3) * 0.32]} scale={[1, 0.8, 1]}>
          <dodecahedronGeometry args={[0.1, 0]} />
          <Mat color="#6f6a63" />
        </mesh>
      ))}
      <mesh position={[0, 0.1, 0]} rotation={[0, 0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
        <Mat color="#4a3322" />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[0, -0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
        <Mat color="#4a3322" />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <coneGeometry args={[0.2, on ? 0.55 : 0.1, 8]} />
        <Mat color={on ? "#ff9a2e" : "#2a2420"} emissive="#ff6a00" ei={on ? 2.5 : 0} />
      </mesh>
      <LightSource on={on} y={0.7} color="#ff8a33" intensity={16} distance={11} />
    </group>
  );
}

function Tile({ color, dash, h = 0.04, edge }: { color: string; dash?: boolean; h?: number; edge?: string }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} receiveShadow>
        <boxGeometry args={[2, h, 2]} />
        <Mat color={color} />
      </mesh>
      {dash && <Box p={[0, h + 0.003, 0]} s={[0.9, 0.006, 0.08]} color="#e8e2c2" />}
      {edge && (
        <>
          <Box p={[0, h + 0.003, -0.96]} s={[2, 0.006, 0.06]} color={edge} />
          <Box p={[0, h + 0.003, 0.96]} s={[2, 0.006, 0.06]} color={edge} />
        </>
      )}
    </group>
  );
}

function CobbleTile() {
  const stones = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push([-0.75 + i * 0.5, -0.75 + j * 0.5, (i * 7 + j * 3) % 3]);
    return out;
  }, []);
  const shades = ["#7d7871", "#6d6861", "#8a857d"];
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[2, 0.04, 2]} />
        <Mat color="#4a463f" />
      </mesh>
      {stones.map(([x, z, s], i) => (
        <mesh key={i} position={[x, 0.05, z]} receiveShadow>
          <boxGeometry args={[0.44, 0.04, 0.44]} />
          <Mat color={shades[s]} />
        </mesh>
      ))}
    </group>
  );
}

function Fence() {
  return (
    <group>
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (
        <Box key={x} p={[x, 0.4, 0]} s={[0.1, 0.8, 0.1]} color="#7a5a3a" />
      ))}
      <Box p={[0, 0.6, 0]} s={[2, 0.08, 0.05]} color="#8a6a46" />
      <Box p={[0, 0.3, 0]} s={[2, 0.08, 0.05]} color="#8a6a46" />
    </group>
  );
}

function WallStone() {
  return (
    <group>
      <Box p={[0, 0.5, 0]} s={[2, 1, 0.4]} color="#6f6c66" />
      <Box p={[0, 1.05, 0]} s={[2.05, 0.1, 0.5]} color="#5c5a55" />
    </group>
  );
}

function Well() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.7, 14]} />
        <Mat color="#807c74" />
      </mesh>
      <mesh position={[0, 0.71, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.02, 14]} />
        <Mat color="#1b3a5a" rough={0.1} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <Box key={x} p={[x, 1.0, 0]} s={[0.08, 1.0, 0.08]} color="#5b3f28" />
      ))}
      <Gable w={1.3} d={1.1} h={0.4} y={1.5} color="#7a3b2a" />
    </group>
  );
}

function Bench() {
  return (
    <group>
      <Box p={[0, 0.4, 0]} s={[1.2, 0.07, 0.4]} color="#8a6a46" />
      <Box p={[0, 0.7, -0.17]} s={[1.2, 0.3, 0.05]} color="#8a6a46" />
      {[-0.5, 0.5].map((x) => (
        <Box key={x} p={[x, 0.2, 0]} s={[0.06, 0.4, 0.36]} color="#3a3d42" />
      ))}
    </group>
  );
}

function Car() {
  return (
    <group>
      <Box p={[0, 0.35, 0]} s={[1.0, 0.35, 2.0]} color="#b3322b" rough={0.35} />
      <Box p={[0, 0.65, -0.1]} s={[0.85, 0.3, 1.0]} color="#9fc9e8" rough={0.2} />
      <Box p={[0, 0.78, -0.1]} s={[0.9, 0.05, 1.05]} color="#8f2923" />
      {[-0.5, 0.5].flatMap((x) => [-0.65, 0.65].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.18, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 12]} />
          <Mat color="#1a1a1a" />
        </mesh>
      )))}
    </group>
  );
}

function Crate() {
  return <Box p={[0, 0.3, 0]} s={[0.6, 0.6, 0.6]} color="#9a7648" />;
}

function Barrel() {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.25, 0.7, 12]} />
        <Mat color="#7a5230" />
      </mesh>
      {[0.15, 0.55].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.285, 0.285, 0.04, 12]} />
          <Mat color="#3a3d42" />
        </mesh>
      ))}
    </group>
  );
}

function Cart() {
  return (
    <group>
      <Box p={[0, 0.45, 0]} s={[1.2, 0.2, 0.8]} color="#8a6a46" />
      <Box p={[0, 0.65, 0.4]} s={[1.2, 0.2, 0.04]} color="#7a5a3a" />
      <Box p={[0, 0.65, -0.4]} s={[1.2, 0.2, 0.04]} color="#7a5a3a" />
      <Box p={[-1.0, 0.4, 0]} s={[0.9, 0.05, 0.05]} color="#5b3f28" />
      {[-0.42, 0.42].map((z) => (
        <mesh key={z} position={[0.1, 0.3, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 14]} />
          <Mat color="#4a3322" />
        </mesh>
      ))}
    </group>
  );
}

function Tombstone() {
  return (
    <group>
      <Box p={[0, 0.3, 0]} s={[0.45, 0.6, 0.12]} color="#8a8a86" />
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.12, 12, 1, false, 0, Math.PI]} />
        <Mat color="#8a8a86" />
      </mesh>
      <Box p={[0, 0.02, 0.3]} s={[0.5, 0.04, 0.6]} color="#4a4a47" />
    </group>
  );
}

function Tent() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.0, 1.0, 4]} />
        <Mat color="#b5894a" />
      </mesh>
      <Box p={[0, 0.3, 0.55]} s={[0.35, 0.55, 0.03]} color="#2a2018" />
    </group>
  );
}

export function PropModel({ kind, on }: { kind: string; on: boolean }) {
  if (KIT_KINDS.has(kind)) return <KitModel kind={kind} />;
  if (MEDIEVAL_KINDS.has(kind)) return <MedievalModel kind={kind} on={on} />;
  switch (kind) {
    case "house_modern": return <HouseModern />;
    case "building_modern": return <BuildingModern />;
    case "house_medieval": return <HouseMedieval />;
    case "tavern_medieval": return <Tavern />;
    case "tower_medieval": return <Tower />;
    case "mansion_dark": return <MansionDark />;
    case "road_modern": return <Tile color="#34373c" dash />;
    case "road_cobble": return <CobbleTile />;
    case "sidewalk": return <Tile color="#a8a59e" h={0.08} edge="#8d8a83" />;
    case "dirt_path": return <Tile color="#7a5f40" />;
    case "tree": return <Tree />;
    case "pine": return <Pine />;
    case "dead_tree": return <DeadTree />;
    case "bush": return <Bush />;
    case "rock": return <Rock />;
    case "lamp_modern": return <LampModern on={on} />;
    case "lamp_medieval": return <LampMedieval on={on} />;
    case "torch": return <Torch on={on} />;
    case "campfire": return <Campfire on={on} />;
    case "fence": return <Fence />;
    case "wall_stone": return <WallStone />;
    case "well": return <Well />;
    case "bench": return <Bench />;
    case "car": return <Car />;
    case "crate": return <Crate />;
    case "barrel": return <Barrel />;
    case "cart": return <Cart />;
    case "tombstone": return <Tombstone />;
    case "tent": return <Tent />;
    default:
      return <Box p={[0, 0.4, 0]} s={[0.8, 0.8, 0.8]} color="#ff66aa" />;
  }
}

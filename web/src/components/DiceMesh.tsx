import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { DiceRoll } from "../types";
import { useBoardStore } from "../store";

const FALL_TIME = 1.4; // segundos até assentar
const LINGER_TIME = 4; // segundos visível depois de assentar
const REST_Y = 0.5;

/** PRNG determinístico (mulberry32): todos os clientes animam a mesma rolagem igual. */
function seeded(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** d10: trapezoedro pentagonal, construído via casco convexo. */
function makeD10(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    pts.push(new THREE.Vector3(Math.cos(a), i % 2 ? -0.18 : 0.18, Math.sin(a)));
  }
  pts.push(new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, -1.05, 0));
  return new ConvexGeometry(pts);
}

function makeGeometry(sides: number): THREE.BufferGeometry {
  switch (sides) {
    case 4:
      return new THREE.TetrahedronGeometry(0.6);
    case 6:
      return new THREE.BoxGeometry(0.7, 0.7, 0.7);
    case 8:
      return new THREE.OctahedronGeometry(0.55);
    case 10:
      return makeD10().scale(0.5, 0.5, 0.5);
    case 12:
      return new THREE.DodecahedronGeometry(0.55);
    default:
      return new THREE.IcosahedronGeometry(0.55); // d20 e d100
  }
}

const COLORS: Record<number, string> = {
  4: "#7a3b8f",
  6: "#b03a2e",
  8: "#2e7d5b",
  10: "#2c6aa8",
  12: "#c28a1e",
  20: "#a8762c",
  100: "#3b3b3b",
};

interface DieProps {
  roll: DiceRoll;
  index: number;
  value: number;
}

function Die({ roll, index, value }: DieProps) {
  const ref = useRef<THREE.Group>(null);
  const startRef = useRef<number | null>(null);
  const geometry = useMemo(() => makeGeometry(roll.sides), [roll.sides]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const params = useMemo(() => {
    const rnd = seeded(`${roll.id}:${index}`);
    const total = roll.results.length;
    const spread = (index - (total - 1) / 2) * 1.2;
    const target = new THREE.Vector3(spread + (rnd() - 0.5) * 0.6, REST_Y, (rnd() - 0.5) * 2.5);
    return {
      target,
      startHeight: 4 + rnd() * 2,
      fromX: target.x + (rnd() - 0.5) * 6,
      fromZ: target.z + 5 + rnd() * 3,
      spin: new THREE.Vector3(rnd() * 14 + 6, rnd() * 14 + 6, rnd() * 14 + 6),
      rest: new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28),
    };
  }, [roll.id, roll.results.length, index]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const t = Math.min((state.clock.elapsedTime - startRef.current) / FALL_TIME, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    // trajetória horizontal suave + queda com quique amortecido
    g.position.x = THREE.MathUtils.lerp(params.fromX, params.target.x, ease);
    g.position.z = THREE.MathUtils.lerp(params.fromZ, params.target.z, ease);
    const bounce = Math.abs(Math.cos(t * Math.PI * 3.2)) * (1 - t) * (1 - t);
    g.position.y = REST_Y + (params.startHeight * (1 - t) * (1 - t) + 1.2 * bounce) * (t < 1 ? 1 : 0);

    // giro que desacelera até a rotação final
    const k = 1 - ease;
    g.rotation.set(
      params.rest.x + params.spin.x * k,
      params.rest.y + params.spin.y * k,
      params.rest.z + params.spin.z * k
    );
  });

  return (
    <group ref={ref} position={[params.fromX, params.startHeight, params.fromZ]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial
          color={COLORS[roll.sides] ?? "#a8762c"}
          roughness={0.35}
          metalness={0.15}
          flatShading
        />
      </mesh>
      <Html center distanceFactor={9} position={[0, 0, 0]} style={{ pointerEvents: "none" }}>
        <DieLabel value={value} sides={roll.sides} />
      </Html>
    </group>
  );
}

/** O número só aparece quando o dado assenta, pra não "spoilar" durante a queda. */
function DieLabel({ value, sides }: { value: number; sides: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    const id = window.setTimeout(() => (el.style.opacity = "1"), FALL_TIME * 1000);
    return () => window.clearTimeout(id);
  }, []);
  const crit = sides === 20 && (value === 20 || value === 1);
  return (
    <div
      ref={ref}
      style={{
        transition: "opacity 0.2s",
        fontFamily: "system-ui, sans-serif",
        fontWeight: 800,
        fontSize: 26,
        color: crit ? (value === 20 ? "#7dff9a" : "#ff6b6b") : "#fff",
        textShadow: "0 0 4px #000, 0 0 8px #000",
        userSelect: "none",
      }}
    >
      {value}
    </div>
  );
}

/** Uma rolagem completa (N dados) que se remove sozinha depois de um tempo. */
export default function DiceRollMesh({ roll }: { roll: DiceRoll }) {
  const finish = useBoardStore((s) => s.finishLiveRoll);
  useEffect(() => {
    const id = window.setTimeout(() => finish(roll.id), (FALL_TIME + LINGER_TIME) * 1000);
    return () => window.clearTimeout(id);
  }, [roll.id, finish]);

  return (
    <group>
      {roll.results.map((value, i) => (
        <Die key={i} roll={roll} index={i} value={value} />
      ))}
    </group>
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useBoardStore } from "../store";
import type { Mood } from "../types";

interface MoodDef {
  label: string;
  fog: string;
  density: number;
  ambient: string;
  ambientI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  sun: string;
  sunI: number;
  sunPos: [number, number, number];
  bloom: number;
  vignette: number;
  grain: number;
  mist: number; // opacidade da neblina rasteira
  mistColor: string;
}

export const MOODS: Record<Mood, MoodDef> = {
  fog: {
    label: "🌫️ Névoa",
    fog: "#7d9895", density: 0.043,
    ambient: "#a9c4c0", ambientI: 0.25,
    hemiSky: "#b7d3d0", hemiGround: "#3a4636", hemiI: 0.85,
    sun: "#d4e6e0", sunI: 1.5, sunPos: [-9, 11, 7],
    bloom: 0.9, vignette: 0.62, grain: 0.09, mist: 0.2, mistColor: "#cfe3df",
  },
  clear: {
    label: "☀️ Dia",
    fog: "#bcd0df", density: 0.008,
    ambient: "#ffffff", ambientI: 0.2,
    hemiSky: "#cfe4ff", hemiGround: "#5a5a46", hemiI: 0.8,
    sun: "#fff0d6", sunI: 2.6, sunPos: [10, 15, 8],
    bloom: 0.35, vignette: 0.35, grain: 0.03, mist: 0.0, mistColor: "#ffffff",
  },
  night: {
    label: "🌙 Noite",
    fog: "#0b1222", density: 0.03,
    ambient: "#7f96e0", ambientI: 0.28,
    hemiSky: "#5a72c0", hemiGround: "#141a28", hemiI: 0.55,
    sun: "#8fa5e8", sunI: 1.1, sunPos: [-8, 14, -6],
    bloom: 1.25, vignette: 0.75, grain: 0.1, mist: 0.1, mistColor: "#6f86b8",
  },
};

function mistTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Neblina baixa que desliza devagar rente ao chão. */
function GroundMist({ color, opacity }: { color: string; opacity: number }) {
  const tex = useMemo(() => mistTexture(), []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: ((i * 37) % 23) - 11.5,
        z: ((i * 53) % 21) - 10.5,
        y: 0.35 + (i % 4) * 0.28,
        s: 6 + (i % 5) * 1.8,
        sp: 0.04 + (i % 7) * 0.012,
        ph: i * 1.7,
      })),
    []
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((sp, i) => {
      if (!sp) return;
      const d = seeds[i];
      sp.position.x = d.x + Math.sin(t * d.sp + d.ph) * 3.2;
      sp.position.z = d.z + Math.cos(t * d.sp * 0.8 + d.ph) * 2.4;
    });
  });
  if (opacity <= 0) return null;
  return (
    <>
      {seeds.map((d, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[d.x, d.y, d.z]}
          scale={[d.s, d.s * 0.45, 1]}
        >
          <spriteMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </>
  );
}

/** Iluminação, névoa, partículas e pós-processamento conforme o clima escolhido. */
export default function Atmosphere() {
  const mood = useBoardStore((s) => s.mood);
  const fx = useBoardStore((s) => s.fx);
  const cameraMode = useBoardStore((s) => s.cameraMode);
  const m = MOODS[mood];
  const density = cameraMode === "2d" ? m.density * 0.25 : m.density;

  return (
    <>
      <color attach="background" args={[m.fog]} />
      <fogExp2 attach="fog" args={[m.fog, density]} />

      <ambientLight color={m.ambient} intensity={m.ambientI} />
      <hemisphereLight args={[m.hemiSky, m.hemiGround, m.hemiI]} />
      <directionalLight
        position={m.sunPos}
        color={m.sun}
        intensity={m.sunI}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />

      {cameraMode === "3d" && <GroundMist color={m.mistColor} opacity={m.mist} />}

      {mood === "fog" && (
        <Sparkles count={90} scale={[22, 5, 22]} position={[0, 2.5, 0]} size={2.2} speed={0.25} opacity={0.35} color="#d8efe8" />
      )}
      {mood === "night" && (
        <Sparkles count={45} scale={[20, 3, 20]} position={[0, 1.6, 0]} size={4} speed={0.5} opacity={0.9} color="#c8ff9a" />
      )}

      {fx && (
        <EffectComposer multisampling={4}>
          <Bloom intensity={m.bloom} luminanceThreshold={1.0} luminanceSmoothing={0.25} mipmapBlur radius={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette eskil={false} offset={0.25} darkness={m.vignette} />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={m.grain * 4} />
        </EffectComposer>
      )}
    </>
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { getTextures, scaleUV, worldBox, type TexKind } from "./textures";


/** Modelos medievais detalhados: texturas procedurais, relevo e luzes que tremulam. */

type V3 = [number, number, number];

function TM({
  tex, color = "#ffffff", bump = 0.7, rough = 0.92, emissive, ei = 0, side,
}: { tex: TexKind; color?: string; bump?: number; rough?: number; emissive?: string; ei?: number; side?: THREE.Side }) {
  const t = getTextures(tex);
  return (
    <meshStandardMaterial
      map={t.map} bumpMap={t.bump} bumpScale={bump} color={color} roughness={rough}
      emissive={emissive ?? "#000000"} emissiveIntensity={ei} side={side}
    />
  );
}

function TBox({
  p, s, tex, color, rot, density = 0.6, bump, cast = true,
}: { p: V3; s: V3; tex: TexKind; color?: string; rot?: V3; density?: number; bump?: number; cast?: boolean }) {
  return (
    <mesh position={p} rotation={rot} geometry={worldBox(s[0], s[1], s[2], density)} castShadow={cast} receiveShadow>
      <TM tex={tex} color={color} bump={bump} />
    </mesh>
  );
}

function Glow({ p, s, color = "#ffcf80", ei = 2.2, rot }: { p: V3; s: V3; color?: string; ei?: number; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={ei} roughness={0.4} />
    </mesh>
  );
}

/** Luz que tremula como chama. */
function FlickerLight({ on, y = 0, x = 0, color, base, distance }: { on: boolean; y?: number; x?: number; color: string; base: number; distance: number }) {
  const ref = useRef<THREE.PointLight>(null);
  const ph = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => {
    const l = ref.current;
    if (!l) return;
    const t = clock.elapsedTime + ph;
    const n = 1 + Math.sin(t * 13) * 0.07 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 31) * 0.035;
    l.intensity = on ? base * n : 0;
  });
  return <pointLight ref={ref} position={[x, y, 0]} color={color} intensity={on ? base : 0} distance={distance} decay={2} />;
}

// --------------------------------------------------------------------------- Construções

interface CottageOpts {
  w: number; d: number; wallH: number; rh: number;
  wallTex: TexKind; wallColor: string; roofTex: TexKind; roofColor: string;
  glow: string; upper?: boolean; chimney?: boolean; timber?: boolean;
}

function Cottage({ w, d, wallH, rh, wallTex, wallColor, roofTex, roofColor, glow, upper, chimney = true, timber = true }: CottageOpts) {
  const found = 0.35;
  const wallInner = wallH - found;
  const run = d / 2 + 0.45;
  const slabL = Math.sqrt(run * run + rh * rh) + 0.12;
  const ang = Math.atan2(rh, run);
  const h1 = rh * (1 - d / 2 / run);

  const gable = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-d / 2, 0);
    sh.lineTo(d / 2, 0);
    sh.lineTo(d / 2, h1);
    sh.lineTo(0, rh);
    sh.lineTo(-d / 2, h1);
    sh.closePath();
    return new THREE.ShapeGeometry(sh);
  }, [d, h1, rh]);

  const beamY = [found + 0.02, found + wallInner * 0.5, wallH - 0.07];
  return (
    <group>
      {/* fundação de pedra */}
      <TBox p={[0, found / 2, 0]} s={[w + 0.14, found, d + 0.14]} tex="stone" color="#a9a49b" />
      {/* paredes */}
      <TBox p={[0, found + wallInner / 2, 0]} s={[w, wallInner, d]} tex={wallTex} color={wallColor} density={0.45} />

      {timber && (
        <>
          {[-w / 2, w / 2].flatMap((x) =>
            [-d / 2, d / 2].map((z) => (
              <TBox key={`c${x}${z}`} p={[x, found + wallInner / 2, z]} s={[0.17, wallInner, 0.17]} tex="woodDark" density={1} />
            ))
          )}
          {[1, -1].flatMap((sz) =>
            beamY.map((y, i) => (
              <TBox key={`fb${sz}${i}`} p={[0, y, sz * (d / 2 + 0.02)]} s={[w + 0.12, 0.13, 0.1]} tex="woodDark" density={1} />
            ))
          )}
          {[1, -1].flatMap((sx) =>
            beamY.map((y, i) => (
              <TBox key={`sb${sx}${i}`} p={[sx * (w / 2 + 0.02), y, 0]} s={[0.1, 0.13, d + 0.12]} tex="woodDark" density={1} />
            ))
          )}
          {/* montantes e escoras na fachada */}
          {[-0.9, 0.35, 1.2].map((x) => (
            <TBox key={`p${x}`} p={[x, found + wallInner / 2, d / 2 + 0.03]} s={[0.12, wallInner, 0.08]} tex="woodDark" density={1} />
          ))}
          <TBox p={[-w / 2 + 0.55, found + wallInner * 0.25, d / 2 + 0.04]} s={[0.1, 0.9, 0.06]} tex="woodDark" rot={[0, 0, 0.75]} density={1} />
          <TBox p={[w / 2 - 0.5, found + wallInner * 0.75, d / 2 + 0.04]} s={[0.1, 0.9, 0.06]} tex="woodDark" rot={[0, 0, -0.75]} density={1} />
        </>
      )}

      {/* empena (triângulo das laterais) */}
      <mesh geometry={gable} position={[w / 2 + 0.01, wallH, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <TM tex={wallTex} color={wallColor} />
      </mesh>
      <mesh geometry={gable} position={[-w / 2 - 0.01, wallH, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <TM tex={wallTex} color={wallColor} />
      </mesh>

      {/* telhado: duas águas com beiral largo */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          geometry={worldBox(w + 0.8, 0.3, slabL, 0.5)}
          position={[0, wallH + rh / 2 + 0.12, (s * run) / 2]}
          rotation={[s * ang, 0, 0]}
          castShadow
          receiveShadow
        >
          <TM tex={roofTex} color={roofColor} bump={1.1} />
        </mesh>
      ))}
      <mesh position={[0, wallH + rh + 0.2, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, w + 0.85, 8]} />
        <TM tex={roofTex} color={roofColor} bump={0.9} />
      </mesh>

      {chimney && (
        <group position={[w / 2 - 0.65, 0, -d / 4]}>
          <TBox p={[0, wallH + rh / 2 + 0.2, 0]} s={[0.55, rh + 1.0, 0.55]} tex="stone" color="#8f8a82" />
          <TBox p={[0, wallH + rh + 0.75, 0]} s={[0.72, 0.1, 0.72]} tex="stone" color="#6f6a63" />
        </group>
      )}

      {/* porta */}
      <TBox p={[0.95, found + 0.55, d / 2 + 0.05]} s={[0.78, 1.1, 0.07]} tex="wood" color="#8a6a48" density={1} />
      <TBox p={[0.95, found + 1.13, d / 2 + 0.05]} s={[0.94, 0.1, 0.1]} tex="woodDark" density={1} />
      <TBox p={[0.52, found + 0.55, d / 2 + 0.05]} s={[0.09, 1.2, 0.1]} tex="woodDark" density={1} />
      <TBox p={[1.38, found + 0.55, d / 2 + 0.05]} s={[0.09, 1.2, 0.1]} tex="woodDark" density={1} />
      <TBox p={[0.95, 0.1, d / 2 + 0.28]} s={[1.1, 0.12, 0.5]} tex="stone" color="#8c877e" />

      {/* janelas com luz quente por dentro */}
      {([-0.45, -1.35] as number[]).map((x, i) => (
        <group key={i} position={[x, found + 0.85 + (i === 1 ? 0.05 : 0), d / 2 + 0.05]}>
          <TBox p={[0, 0, 0]} s={[0.6, 0.6, 0.07]} tex="woodDark" density={1} />
          <Glow p={[0, 0, 0.02]} s={[0.44, 0.44, 0.06]} color={glow} />
          <TBox p={[0, 0, 0.06]} s={[0.05, 0.46, 0.03]} tex="woodDark" density={1} />
          <TBox p={[0, 0, 0.06]} s={[0.46, 0.05, 0.03]} tex="woodDark" density={1} />
          <TBox p={[-0.38, 0, 0.1]} s={[0.22, 0.58, 0.04]} tex="wood" color="#6a8a6a" rot={[0, -0.6, 0]} density={1} />
          <TBox p={[0.38, 0, 0.1]} s={[0.22, 0.58, 0.04]} tex="wood" color="#6a8a6a" rot={[0, 0.6, 0]} density={1} />
        </group>
      ))}
      {[1, -1].map((s) => (
        <group key={s} position={[s * (w / 2 + 0.04), found + 0.85, 0]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <TBox p={[0, 0, 0]} s={[0.55, 0.55, 0.07]} tex="woodDark" density={1} />
          <Glow p={[0, 0, 0.02]} s={[0.4, 0.4, 0.06]} color={glow} ei={1.6} />
        </group>
      ))}

      {upper && (
        <>
          {([-1.0, 0.1, 1.15] as number[]).map((x, i) => (
            <group key={i} position={[x, wallH - 0.55, d / 2 + 0.05]}>
              <TBox p={[0, 0, 0]} s={[0.5, 0.5, 0.07]} tex="woodDark" density={1} />
              <Glow p={[0, 0, 0.02]} s={[0.36, 0.36, 0.06]} color={glow} ei={i === 1 ? 0.4 : 2.2} />
            </group>
          ))}
        </>
      )}
    </group>
  );
}

export function HouseMedieval() {
  return <Cottage w={3.2} d={2.8} wallH={1.75} rh={1.35} wallTex="plaster" wallColor="#d6c4a0" roofTex="thatch" roofColor="#c9b27a" glow="#ffc875" />;
}

export function TavernMedieval() {
  return (
    <group>
      <Cottage w={3.6} d={3.0} wallH={2.8} rh={1.5} wallTex="plaster" wallColor="#cdb994" roofTex="shingle" roofColor="#b88f78" glow="#ffbb5f" upper />
      {/* placa pendurada */}
      <group position={[-1.1, 2.1, 1.75]}>
        <TBox p={[0, 0, 0]} s={[0.07, 0.07, 0.7]} tex="woodDark" density={1} />
        <TBox p={[0, -0.32, 0.4]} s={[0.05, 0.4, 0.5]} tex="wood" color="#b08a58" density={1} />
        <Glow p={[0.04, -0.32, 0.4]} s={[0.02, 0.18, 0.28]} color="#e8a84a" ei={0.6} />
      </group>
      <FlickerLight on y={1.4} x={-1.0} color="#ff9c45" base={7} distance={7} />
    </group>
  );
}

export function TowerMedieval() {
  const body = useMemo(() => scaleUV(new THREE.CylinderGeometry(1.05, 1.2, 3.8, 20, 6), 3.6, 2.4), []);
  const ring = useMemo(() => scaleUV(new THREE.CylinderGeometry(1.3, 1.1, 0.4, 20), 4, 0.5), []);
  const roof = useMemo(() => scaleUV(new THREE.ConeGeometry(1.55, 2.2, 20), 5, 2), []);
  return (
    <group>
      <mesh geometry={body} position={[0, 1.9, 0]} castShadow receiveShadow>
        <TM tex="stone" color="#a8a39a" bump={1} />
      </mesh>
      <mesh geometry={ring} position={[0, 3.95, 0]} castShadow>
        <TM tex="stone" color="#8f8a82" />
      </mesh>
      <mesh geometry={roof} position={[0, 5.2, 0]} castShadow>
        <TM tex="shingle" color="#a8826c" bump={1.1} />
      </mesh>
      <TBox p={[0, 0.65, 1.12]} s={[0.8, 1.3, 0.1]} tex="wood" color="#7a5a3a" density={1} />
      {[0, 1.8].map((a) => (
        <group key={a} rotation={[0, a, 0]}>
          <Glow p={[0, 2.5, 1.06]} s={[0.14, 0.55, 0.06]} color="#ffb860" ei={1.4} />
        </group>
      ))}
      <FlickerLight on y={2.5} x={0.2} color="#ffa550" base={5} distance={6} />
    </group>
  );
}

export function MansionDark() {
  return (
    <group>
      <Cottage w={5.2} d={3.6} wallH={3.3} rh={1.9} wallTex="stone" wallColor="#6d6a74" roofTex="shingle" roofColor="#6b6578" glow="#b9d6a0" upper timber={false} chimney />
      <FlickerLight on y={2.6} x={-1.3} color="#9fc87a" base={4} distance={6} />
    </group>
  );
}

// --------------------------------------------------------------------------- Luz

export function LampMedieval({ on }: { on: boolean }) {
  return (
    <group>
      <TBox p={[0, 1.15, 0]} s={[0.17, 2.3, 0.17]} tex="woodDark" density={1} />
      <TBox p={[0.5, 2.25, 0]} s={[1.05, 0.13, 0.13]} tex="woodDark" density={1} />
      <TBox p={[0.3, 1.97, 0]} s={[0.07, 0.62, 0.07]} tex="woodDark" rot={[0, 0, -0.8]} density={1} />
      {/* corrente */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0.92, 2.1 - i * 0.07, 0]}>
          <torusGeometry args={[0.025, 0.007, 5, 8]} />
          <meshStandardMaterial color="#2a2622" metalness={0.8} roughness={0.5} />
        </mesh>
      ))}
      {/* lanterna */}
      <group position={[0.92, 1.78, 0]}>
        <mesh position={[0, 0.17, 0]}>
          <coneGeometry args={[0.17, 0.14, 4]} />
          <meshStandardMaterial color="#26221e" metalness={0.7} roughness={0.5} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.2, 0.26, 0.2]} />
          <meshStandardMaterial
            color={on ? "#ff9a50" : "#4a4038"}
            emissive="#ff6a1c"
            emissiveIntensity={on ? 3.2 : 0}
            roughness={0.35}
          />
        </mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => (
          <mesh key={`${a}${b}`} position={[a * 0.105, 0, b * 0.105]}>
            <boxGeometry args={[0.025, 0.28, 0.025]} />
            <meshStandardMaterial color="#1c1916" metalness={0.8} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[0.23, 0.04, 0.23]} />
          <meshStandardMaterial color="#1c1916" metalness={0.8} roughness={0.5} />
        </mesh>
      </group>
      <FlickerLight on={on} y={1.75} x={0.92} color="#ff8a3a" base={16} distance={9} />
    </group>
  );
}

export function Torch({ on }: { on: boolean }) {
  const flame = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const f = flame.current;
    if (!f) return;
    const t = clock.elapsedTime * 11;
    f.scale.set(1 + Math.sin(t) * 0.12, 1 + Math.sin(t * 1.7) * 0.22, 1 + Math.cos(t) * 0.12);
  });
  return (
    <group>
      <TBox p={[0, 0.55, 0]} s={[0.09, 1.1, 0.09]} tex="woodDark" density={1.5} />
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.09, 0.06, 0.2, 8]} />
        <meshStandardMaterial color="#2c241c" roughness={1} />
      </mesh>
      {on && (
        <group ref={flame} position={[0, 1.3, 0]}>
          <mesh>
            <coneGeometry args={[0.1, 0.34, 8]} />
            <meshStandardMaterial color="#ffb347" emissive="#ff7a1a" emissiveIntensity={3.5} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, -0.04, 0]}>
            <coneGeometry args={[0.05, 0.2, 6]} />
            <meshStandardMaterial color="#fff2c0" emissive="#ffe08a" emissiveIntensity={4} />
          </mesh>
        </group>
      )}
      <FlickerLight on={on} y={1.35} color="#ff9438" base={10} distance={8} />
    </group>
  );
}

export function Campfire({ on }: { on: boolean }) {
  const flame = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const f = flame.current;
    if (!f) return;
    const t = clock.elapsedTime * 9;
    f.scale.set(1 + Math.sin(t) * 0.1, 1 + Math.sin(t * 1.9) * 0.25, 1 + Math.cos(t * 1.3) * 0.1);
    f.rotation.y = t * 0.2;
  });
  return (
    <group>
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.4, 0.09, Math.sin(a) * 0.4]} rotation={[a, a * 2, 0]} scale={[1, 0.75, 0.9]} castShadow>
            <dodecahedronGeometry args={[0.12, 0]} />
            <TM tex="stone" color="#8a857d" />
          </mesh>
        );
      })}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.13, 0]} rotation={[0, (i * Math.PI) / 3, Math.PI / 2 - 0.25]} castShadow>
          <cylinderGeometry args={[0.055, 0.065, 0.62, 7]} />
          <TM tex="woodDark" color={on ? "#7a4a2a" : "#ffffff"} />
        </mesh>
      ))}
      {on ? (
        <group>
          <group ref={flame} position={[0, 0.3, 0]}>
            <mesh>
              <coneGeometry args={[0.22, 0.62, 9]} />
              <meshStandardMaterial color="#ff9a2e" emissive="#ff6a00" emissiveIntensity={3.6} transparent opacity={0.92} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <coneGeometry args={[0.12, 0.38, 8]} />
              <meshStandardMaterial color="#fff0b0" emissive="#ffd060" emissiveIntensity={4.5} />
            </mesh>
          </group>
          <Sparkles count={14} scale={[0.5, 1.4, 0.5]} position={[0, 0.9, 0]} size={2.4} speed={0.7} color="#ffb060" />
        </group>
      ) : (
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.2, 0.25, 0.05, 8]} />
          <meshStandardMaterial color="#1e1a17" roughness={1} />
        </mesh>
      )}
      <FlickerLight on={on} y={0.8} color="#ff8a33" base={22} distance={12} />
    </group>
  );
}

// --------------------------------------------------------------------------- Cenário

export function Well() {
  const ring = useMemo(() => scaleUV(new THREE.CylinderGeometry(0.62, 0.68, 0.8, 18, 3, true), 4, 1.2), []);
  return (
    <group>
      <mesh geometry={ring} position={[0, 0.4, 0]} castShadow receiveShadow>
        <TM tex="stone" color="#a8a39a" bump={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.46, 0.7, 18]} />
        <TM tex="stone" color="#8f8a82" />
      </mesh>
      <mesh position={[0, 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 18]} />
        <meshStandardMaterial color="#10222c" roughness={0.05} metalness={0.5} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <TBox key={x} p={[x, 1.1, 0]} s={[0.1, 1.4, 0.1]} tex="woodDark" density={1} />
      ))}
      <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 1.4, 8]} />
        <TM tex="wood" />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} geometry={worldBox(1.1, 0.07, 0.95, 0.8)} position={[0, 1.95, s * 0.28]} rotation={[s * 0.62, 0, 0]} castShadow>
          <TM tex="shingle" color="#8a6a58" />
        </mesh>
      ))}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 5]} />
        <meshStandardMaterial color="#3a342c" />
      </mesh>
      <TBox p={[0, 0.88, 0]} s={[0.16, 0.14, 0.16]} tex="wood" density={2} />
    </group>
  );
}

let barrelGeo: THREE.LatheGeometry | null = null;
function getBarrelGeo() {
  if (barrelGeo) return barrelGeo;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.22 + Math.sin(t * Math.PI) * 0.08, t * 0.74));
  }
  barrelGeo = scaleUV(new THREE.LatheGeometry(pts, 14), 3, 1.4) as THREE.LatheGeometry;
  return barrelGeo;
}

export function Barrel() {
  return (
    <group>
      <mesh geometry={getBarrelGeo()} castShadow receiveShadow>
        <TM tex="wood" color="#b08a5a" />
      </mesh>
      {[0.12, 0.37, 0.62].map((y, i) => {
        const r = 0.22 + Math.sin((y / 0.74) * Math.PI) * 0.08;
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r + 0.004, 0.017, 6, 20]} />
            <meshStandardMaterial color="#26221e" metalness={0.8} roughness={0.5} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.74, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.21, 14]} />
        <TM tex="woodDark" />
      </mesh>
    </group>
  );
}

export function Crate() {
  return (
    <group>
      <TBox p={[0, 0.3, 0]} s={[0.6, 0.6, 0.6]} tex="wood" color="#b89868" density={1.2} />
      {[-0.28, 0.28].flatMap((x) => [-0.28, 0.28].map((z) => <TBox key={`${x}${z}`} p={[x, 0.3, z]} s={[0.07, 0.64, 0.07]} tex="woodDark" density={2} />))}
      <TBox p={[0, 0.58, 0]} s={[0.64, 0.05, 0.64]} tex="woodDark" density={2} />
      <TBox p={[0, 0.03, 0]} s={[0.64, 0.05, 0.64]} tex="woodDark" density={2} />
    </group>
  );
}

export function Cart() {
  return (
    <group>
      <TBox p={[0, 0.5, 0]} s={[1.5, 0.12, 0.9]} tex="wood" color="#a07c52" density={1} />
      {[1, -1].map((s) => (
        <TBox key={s} p={[0, 0.72, s * 0.43]} s={[1.5, 0.3, 0.06]} tex="wood" color="#8a6a46" density={1} />
      ))}
      <TBox p={[0.72, 0.72, 0]} s={[0.06, 0.3, 0.9]} tex="wood" color="#8a6a46" density={1} />
      <TBox p={[-0.1, 0.8, 0]} s={[1.2, 0.3, 0.7]} tex="thatch" color="#d6c48a" density={1} bump={1.2} />
      <TBox p={[-1.15, 0.45, 0.3]} s={[1.2, 0.06, 0.06]} tex="woodDark" density={1} rot={[0, 0.1, 0]} />
      <TBox p={[-1.15, 0.45, -0.3]} s={[1.2, 0.06, 0.06]} tex="woodDark" density={1} rot={[0, -0.1, 0]} />
      {[0.48, -0.48].map((z) => (
        <group key={z} position={[0.15, 0.34, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.32, 0.045, 6, 20]} />
            <TM tex="woodDark" />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]}>
              <boxGeometry args={[0.62, 0.04, 0.04]} />
              <TM tex="wood" />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.1, 8]} />
            <TM tex="woodDark" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Fence() {
  return (
    <group>
      {[-0.9, -0.3, 0.3, 0.9].map((x, i) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, 0, (i - 1.5) * 0.02]}>
          <TBox p={[0, 0.42, 0]} s={[0.11, 0.84, 0.11]} tex="woodDark" density={1.5} />
          <mesh position={[0, 0.88, 0]} castShadow>
            <coneGeometry args={[0.085, 0.14, 5]} />
            <TM tex="woodDark" />
          </mesh>
        </group>
      ))}
      <TBox p={[0, 0.62, 0.07]} s={[2.1, 0.08, 0.05]} tex="wood" density={1.2} rot={[0, 0, 0.015]} />
      <TBox p={[0, 0.3, 0.07]} s={[2.1, 0.08, 0.05]} tex="wood" density={1.2} rot={[0, 0, -0.012]} />
    </group>
  );
}

export function WallStone() {
  return (
    <group>
      <TBox p={[0, 0.5, 0]} s={[2.05, 1, 0.45]} tex="stone" color="#a29e95" density={0.7} bump={1.1} />
      <TBox p={[0, 1.04, 0]} s={[2.1, 0.12, 0.55]} tex="stone" color="#8a867e" density={0.9} />
      <mesh position={[0.6, 1.14, 0.05]} scale={[1, 0.5, 1]}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshStandardMaterial color="#3a5a2c" roughness={1} />
      </mesh>
    </group>
  );
}

export function Tombstone() {
  return (
    <group rotation={[0, 0, 0.04]}>
      <TBox p={[0, 0.3, 0]} s={[0.5, 0.6, 0.14]} tex="stone" color="#a8a8a2" density={1.5} bump={1.2} />
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.14, 14, 1, false, 0, Math.PI]} />
        <TM tex="stone" color="#a8a8a2" />
      </mesh>
      <TBox p={[0, 0.04, 0.3]} s={[0.55, 0.08, 0.62]} tex="stone" color="#6f6f6a" density={1.5} />
      <mesh position={[0.1, 0.1, 0.12]} scale={[1, 0.5, 1]}>
        <icosahedronGeometry args={[0.16, 1]} />
        <meshStandardMaterial color="#35502a" roughness={1} />
      </mesh>
    </group>
  );
}

export function Tent() {
  const cloth = useMemo(() => scaleUV(new THREE.ConeGeometry(1.15, 1.25, 4, 1, true), 3, 1.2), []);
  return (
    <group>
      <mesh geometry={cloth} position={[0, 0.62, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <TM tex="plaster" color="#b49662" bump={0.4} side={THREE.DoubleSide} />
      </mesh>
      <TBox p={[0, 1.38, 0]} s={[0.05, 0.4, 0.05]} tex="woodDark" density={2} />
      <TBox p={[0, 0.3, 0.74]} s={[0.55, 0.62, 0.03]} tex="woodDark" density={1} color="#2a1c10" rot={[0.35, 0, 0]} />
    </group>
  );
}

// --------------------------------------------------------------------------- Natureza

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function lumpy(base: THREE.BufferGeometry, amount: number, seed: number, gradient: [string, string]) {
  const g = base;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c1 = new THREE.Color(gradient[0]);
  const c2 = new THREE.Color(gradient[1]);
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // quantiza para que vértices duplicados (mesma posição) sofram o mesmo deslocamento
    const n = hash3(Math.round(v.x * 100) + seed, Math.round(v.y * 100), Math.round(v.z * 100));
    const k = 1 + (n - 0.5) * 2 * amount;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
    const t = (v.y - minY) / (maxY - minY || 1);
    const col = c1.clone().lerp(c2, t).offsetHSL((n - 0.5) * 0.03, 0, (n - 0.5) * 0.08);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const foliageCache = new Map<string, THREE.BufferGeometry>();
function foliage(key: string, make: () => THREE.BufferGeometry) {
  let g = foliageCache.get(key);
  if (!g) {
    g = make();
    foliageCache.set(key, g);
  }
  return g;
}

export function Tree() {
  const blobs: { p: V3; r: number; seed: number }[] = [
    { p: [0, 2.05, 0], r: 0.95, seed: 1 },
    { p: [0.55, 1.7, 0.25], r: 0.62, seed: 2 },
    { p: [-0.55, 1.75, -0.2], r: 0.66, seed: 3 },
    { p: [0.1, 2.55, -0.2], r: 0.6, seed: 4 },
    { p: [-0.1, 1.65, 0.6], r: 0.55, seed: 5 },
  ];
  const trunk = useMemo(() => scaleUV(new THREE.CylinderGeometry(0.13, 0.27, 1.7, 9, 3), 2, 1.5), []);
  return (
    <group>
      <mesh geometry={trunk} position={[0, 0.85, 0]} castShadow>
        <TM tex="woodDark" color="#8a7458" bump={1.2} />
      </mesh>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2]} rotation={[Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]} castShadow>
          <coneGeometry args={[0.09, 0.36, 5]} />
          <TM tex="woodDark" color="#8a7458" />
        </mesh>
      ))}
      <mesh position={[0.18, 1.5, 0.05]} rotation={[0, 0, -0.7]} castShadow>
        <cylinderGeometry args={[0.04, 0.07, 0.8, 6]} />
        <TM tex="woodDark" color="#8a7458" />
      </mesh>
      {blobs.map((b) => (
        <mesh
          key={b.seed}
          position={b.p}
          geometry={foliage(`blob${b.seed}`, () => lumpy(new THREE.IcosahedronGeometry(b.r, 3), 0.17, b.seed * 17, ["#2b4a22", "#5d8c3c"]))}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial vertexColors roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function Pine() {
  const trunk = useMemo(() => scaleUV(new THREE.CylinderGeometry(0.09, 0.2, 1.1, 8, 2), 2, 1), []);
  const layers = [0, 1, 2, 3, 4];
  return (
    <group>
      <mesh geometry={trunk} position={[0, 0.55, 0]} castShadow>
        <TM tex="woodDark" color="#7a6448" bump={1.2} />
      </mesh>
      {layers.map((i) => (
        <mesh
          key={i}
          position={[0, 0.75 + i * 0.52, 0]}
          rotation={[0, i * 0.9, 0]}
          geometry={foliage(`pine${i}`, () => lumpy(new THREE.ConeGeometry(0.95 - i * 0.16, 1.05, 11, 3), 0.14, i * 31 + 5, ["#1b3a24", "#3f6e3a"]))}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial vertexColors roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function DeadTree() {
  const limbs: { y: number; rx: number; ry: number; rz: number; len: number; r: number }[] = [
    { y: 1.1, rx: 0, ry: 0.4, rz: 0.9, len: 0.95, r: 0.045 },
    { y: 1.45, rx: 0, ry: 2.6, rz: 0.85, len: 1.05, r: 0.05 },
    { y: 1.7, rx: 0, ry: 4.4, rz: 0.7, len: 0.8, r: 0.04 },
    { y: 1.95, rx: 0, ry: 1.3, rz: 0.55, len: 0.7, r: 0.035 },
    { y: 0.8, rx: 0, ry: 3.6, rz: 1.05, len: 0.7, r: 0.04 },
  ];
  return (
    <group>
      <mesh position={[0, 1.0, 0]} rotation={[0, 0, 0.05]} castShadow>
        <cylinderGeometry args={[0.07, 0.2, 2.1, 7, 3]} />
        <TM tex="woodDark" color="#6a6258" bump={1.3} />
      </mesh>
      {limbs.map((l, i) => (
        <group key={i} position={[0, l.y, 0]} rotation={[0, l.ry, 0]}>
          <group rotation={[0, 0, -l.rz]}>
            <mesh position={[0, l.len / 2, 0]} castShadow>
              <cylinderGeometry args={[l.r * 0.5, l.r, l.len, 5]} />
              <TM tex="woodDark" color="#6a6258" />
            </mesh>
            <mesh position={[0.05, l.len * 0.85, 0]} rotation={[0, 0, -0.7]} castShadow>
              <cylinderGeometry args={[0.008, l.r * 0.5, l.len * 0.5, 4]} />
              <TM tex="woodDark" color="#6a6258" />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export function Bush() {
  const blobs: { p: V3; r: number; seed: number }[] = [
    { p: [0, 0.3, 0], r: 0.42, seed: 11 },
    { p: [0.3, 0.22, 0.12], r: 0.3, seed: 12 },
    { p: [-0.28, 0.24, -0.1], r: 0.32, seed: 13 },
  ];
  return (
    <group>
      {blobs.map((b) => (
        <mesh
          key={b.seed}
          position={b.p}
          scale={[1, 0.8, 1]}
          geometry={foliage(`bush${b.seed}`, () => lumpy(new THREE.IcosahedronGeometry(b.r, 2), 0.22, b.seed * 9, ["#27431f", "#557f35"]))}
          castShadow
        >
          <meshStandardMaterial vertexColors roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function Rock() {
  const g = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.46, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = hash3(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100));
      v.multiplyScalar(0.8 + n * 0.4);
      pos.setXYZ(i, v.x, v.y, v.z);
      const moss = v.y > 0.18 ? Math.min(1, (v.y - 0.18) * 4) : 0;
      const base = new THREE.Color("#7b7871").lerp(new THREE.Color("#4c6a36"), moss * 0.7);
      base.multiplyScalar(0.85 + n * 0.3);
      colors.set([base.r, base.g, base.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  return (
    <mesh geometry={g} position={[0, 0.25, 0]} scale={[1, 0.72, 0.88]} rotation={[0.2, 0.7, 0]} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} flatShading />
    </mesh>
  );
}

// --------------------------------------------------------------------------- Chão

export function CobbleTile() {
  return (
    <mesh geometry={worldBox(2, 0.07, 2, 0.5)} position={[0, 0.035, 0]} receiveShadow>
      <TM tex="cobble" bump={1.4} />
    </mesh>
  );
}

export function DirtPath() {
  return (
    <mesh geometry={worldBox(2, 0.04, 2, 0.5)} position={[0, 0.02, 0]} receiveShadow>
      <TM tex="dirt" color="#c9b08a" bump={1.2} />
    </mesh>
  );
}

export const MEDIEVAL_KINDS = new Set([
  "house_medieval", "tavern_medieval", "tower_medieval", "mansion_dark",
  "lamp_medieval", "torch", "campfire", "well", "barrel", "crate", "cart",
  "fence", "wall_stone", "tombstone", "tent",
  "tree", "pine", "dead_tree", "bush", "rock", "road_cobble", "dirt_path",
]);

export function MedievalModel({ kind, on }: { kind: string; on: boolean }) {
  switch (kind) {
    case "house_medieval": return <HouseMedieval />;
    case "tavern_medieval": return <TavernMedieval />;
    case "tower_medieval": return <TowerMedieval />;
    case "mansion_dark": return <MansionDark />;
    case "lamp_medieval": return <LampMedieval on={on} />;
    case "torch": return <Torch on={on} />;
    case "campfire": return <Campfire on={on} />;
    case "well": return <Well />;
    case "barrel": return <Barrel />;
    case "crate": return <Crate />;
    case "cart": return <Cart />;
    case "fence": return <Fence />;
    case "wall_stone": return <WallStone />;
    case "tombstone": return <Tombstone />;
    case "tent": return <Tent />;
    case "tree": return <Tree />;
    case "pine": return <Pine />;
    case "dead_tree": return <DeadTree />;
    case "bush": return <Bush />;
    case "rock": return <Rock />;
    case "road_cobble": return <CobbleTile />;
    case "dirt_path": return <DirtPath />;
    default: return null;
  }
}

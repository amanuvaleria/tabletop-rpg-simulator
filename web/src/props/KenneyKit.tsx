import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Peças do "Fantasy Town Kit" (Kenney, CC0 — veja public/models/kenney/License.txt).
 * Cada peça ocupa ~1 unidade; aqui montamos casas, barracas etc. com elas.
 * As cores do atlas são dessaturadas para combinar com a névoa.
 */

const BASE = import.meta.env.BASE_URL + "models/kenney/";
const SAT = 0.55; // saturação residual do atlas
const BRIGHT = 0.9;

const texCache = new Map<object, THREE.Texture>();

function muted(map: THREE.Texture): THREE.Texture {
  const img = map.image as CanvasImageSource & { width: number; height: number };
  const hit = texCache.get(img);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext("2d")!;
  x.filter = `saturate(${SAT}) brightness(${BRIGHT})`;
  x.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = map.flipY;
  t.colorSpace = map.colorSpace;
  t.wrapS = map.wrapS;
  t.wrapT = map.wrapT;
  t.anisotropy = 8;
  texCache.set(img, t);
  return t;
}

function prepare(scene: THREE.Object3D) {
  if (scene.userData.__prepared) return;
  scene.userData.__prepared = true;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (mat.map) mat.map = muted(mat.map);
    mat.roughness = 1;
    mat.metalness = 0;
    m.material = mat;
  });
}

export type V3 = [number, number, number];

/** Uma peça do kit: posição, giro em Y (radianos) e escala uniforme. */
export function Piece({ name, p = [0, 0, 0], r = 0, s = 1 }: { name: string; p?: V3; r?: number; s?: number }) {
  const { scene } = useGLTF(BASE + name + ".glb");
  const obj = useMemo(() => {
    prepare(scene);
    return scene.clone(true);
  }, [scene]);
  return <primitive object={obj} position={p} rotation-y={r} scale={s} dispose={null} />;
}

const PRELOAD = [
  "wall-wood", "wall-wood-door", "wall-wood-window-shutters", "wall-wood-window-small", "wall", "wall-door",
  "wall-window-small", "roof-gable", "roof-gable-end", "roof-point", "roof-corner", "pillar-wood", "chimney",
  "stall-red", "stall-green", "windmill", "lantern", "fountain-round-detail",
];
PRELOAD.forEach((n) => useGLTF.preload(BASE + n + ".glb"));

export const KIT_KINDS = new Set([
  "kit_cottage", "kit_inn", "kit_stall_red", "kit_stall_green",
  "kit_tree", "kit_cart", "kit_fountain", "kit_rocks", "kit_hedge",
]);

/** Casa montada com paredes modulares de 1m, duas por face e por andar. */
function KitHouse({ upper = false }: { upper?: boolean }) {
  const floors = upper ? 2 : 1;
  return (
    <group scale={1.45} dispose={null}>
      <Piece name="planks" s={2} />
      {Array.from({ length: floors }, (_, y) => (
        <group key={y} position={[0, 0.12 + y, 0]}>
          {[0, 1, 2, 3].map((side) => (
            <group key={side} rotation-y={side * Math.PI / 2}>
              {[-0.5, 0.5].map((z, i) => (
                <Piece key={z}
                  name={side === 3 && i === 0 && y === 0
                    ? "wall-wood-door" : "wall-wood-window-shutters"}
                  p={[0.5, 0, z]} />
              ))}
            </group>
          ))}
        </group>
      ))}
      <group position={[0, floors + 0.12, 0]} scale={[2, 1.5, 2]}>
        <Piece name={upper ? "roof-high-point" : "roof-point"} />
      </group>
      <Piece name="chimney" p={[-0.6, floors + 0.3, -0.45]} />
      {upper && <Piece name="banner-red" p={[0.5, 1.3, 0]} r={-Math.PI / 2} />}
    </group>
  );
}

export function KitModel({ kind }: { kind: string }) {
  let model: React.ReactNode;
  switch (kind) {
    case "kit_cottage": model = <KitHouse />; break;
    case "kit_inn": model = <KitHouse upper />; break;
    case "kit_stall_red": model = <Piece name="stall-red" s={1.8} />; break;
    case "kit_stall_green": model = <Piece name="stall-green" s={1.8} />; break;
    case "kit_tree": model = <Piece name="tree-high-crooked" s={1.2} />; break;
    case "kit_cart": model = <Piece name="cart-high" s={1.5} />; break;
    case "kit_fountain": model = <Piece name="fountain-round-detail" s={2} />; break;
    case "kit_rocks": model = <Piece name="rock-large" s={0.9} />; break;
    case "kit_hedge": model = <Piece name="hedge-large" s={1.5} />; break;
    default: return null;
  }
  return <WithSuspense>{model}</WithSuspense>;
}

export function WithSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

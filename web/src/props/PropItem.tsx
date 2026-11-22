import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PropData } from "../types";
import { useBoardStore } from "../store";
import { emitUpdateProp } from "../multiplayer";
import { PROP_CATALOG, snapValue } from "./catalog";
import { PropModel } from "./Models";

/**
 * Um objeto de cenário no tabuleiro. Arrastar move (com encaixe no grid);
 * um clique simples seleciona e, se for uma fonte de luz, liga/desliga.
 */
export default function PropItem({ prop }: { prop: PropData }) {
  const { raycaster } = useThree();
  const selected = useBoardStore((s) => s.selectedPropId === prop.id);
  const gridSize = useBoardStore((s) => s.gridSize);
  const cellSize = useBoardStore((s) => s.cellSize);

  const dragging = useRef(false);
  const moved = useRef(false);
  const lastEmit = useRef(0);
  const last = useRef<[number, number, number]>(prop.position);

  const def = PROP_CATALOG[prop.kind];
  const isLight = !!def?.light;

  function end() {
    if (!dragging.current) return;
    dragging.current = false;
    useBoardStore.getState().setInteracting(false);
    if (moved.current) {
      emitUpdateProp(prop.id, { position: last.current });
    } else if (isLight) {
      const on = !prop.on;
      useBoardStore.getState().updateProp(prop.id, { on });
      emitUpdateProp(prop.id, { on });
    }
  }

  // Segurança: se o mouse for solto fora do objeto, ainda assim termina o arrasto.
  useEffect(() => {
    const up = () => end();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  function onPointerDown(e: any) {
    e.stopPropagation();
    useBoardStore.getState().selectProp(prop.id);
    dragging.current = true;
    moved.current = false;
    last.current = prop.position;
    useBoardStore.getState().setInteracting(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: any) {
    if (!dragging.current) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit);
    if (!ok) return;
    const half = (gridSize * cellSize) / 2;
    const x = THREE.MathUtils.clamp(snapValue(prop.kind, hit.x), -half, half);
    const z = THREE.MathUtils.clamp(snapValue(prop.kind, hit.z), -half, half);
    if (x === last.current[0] && z === last.current[2]) return;
    moved.current = true;
    last.current = [x, 0, z];
    useBoardStore.getState().updateProp(prop.id, { position: [x, 0, z] });
    const now = performance.now();
    if (now - lastEmit.current > 50) {
      lastEmit.current = now;
      emitUpdateProp(prop.id, { position: [x, 0, z] });
    }
  }

  return (
    <group
      position={prop.position}
      rotation={[0, prop.rotationY, 0]}
      scale={prop.scale}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <PropModel kind={prop.kind} on={!!prop.on} />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[1.0, 1.08, 40]} />
          <meshBasicMaterial color="#ffcc00" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

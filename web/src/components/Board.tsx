import { useRef } from "react";
import { useBoardStore } from "../store";
import * as THREE from "three";

/**
 * Tabuleiro base: um plano com grid desenhado e um plano invisível
 * maior usado para capturar cliques/drag (raycasting) de tokens.
 */
export default function Board() {
  const { gridSize, cellSize } = useBoardStore();
  const size = gridSize * cellSize;
  const planeRef = useRef<THREE.Mesh>(null);

  return (
    <group>
      {/* Base do tabuleiro (chão) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="board-floor" ref={planeRef}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#2b2320" />
      </mesh>

      {/* Grid visual */}
      <gridHelper
        args={[size, gridSize, "#5a4a3a", "#3a3028"]}
        position={[0, 0.01, 0]}
      />
    </group>
  );
}

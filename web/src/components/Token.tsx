import { Suspense, useRef, useState } from "react";
import { Billboard, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TokenData } from "../types";
import { useBoardStore } from "../store";

interface TokenProps {
  token: TokenData;
}

/**
 * Representa um Token (personagem, NPC ou objeto): um plano texturizado
 * com PNG que sempre encara a câmera (billboard). Suporta drag & drop
 * no plano do tabuleiro via raycasting.
 */
export default function Token({ token }: TokenProps) {
  return (
    <Suspense fallback={<TokenBody token={token} texture={null} />}>
      <TokenMesh token={token} />
    </Suspense>
  );
}

function TokenMesh({ token }: TokenProps) {
  const texture = useTexture(token.imageUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return <TokenBody token={token} texture={texture} />;
}

function TokenBody({
  token,
  texture,
}: {
  token: TokenData;
  texture: THREE.Texture | null;
}) {
  const { raycaster } = useThree();
  const [dragging, setDragging] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const { updateTokenPosition, selectToken, selectedTokenId, gridSize, cellSize } =
    useBoardStore();

  const isSelected = selectedTokenId === token.id;
  const floorY = token.position[1];

  function onPointerDown(e: any) {
    e.stopPropagation();
    selectToken(token.id);
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerUp() {
    setDragging(false);
  }

  function onPointerMove(e: any) {
    if (!dragging) return;
    e.stopPropagation();

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const ray = raycaster.ray;
    const target = new THREE.Vector3();
    const hit = ray.intersectPlane(plane, target);
    if (!hit) return;

    const half = (gridSize * cellSize) / 2;
    const x = THREE.MathUtils.clamp(target.x, -half, half);
    const z = THREE.MathUtils.clamp(target.z, -half, half);

    updateTokenPosition(token.id, [x, floorY, z]);
  }

  return (
    <group
      ref={groupRef}
      position={token.position}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onPointerOut={() => setDragging(false)}
    >
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <mesh scale={[token.scale, token.scale, 1]}>
          <planeGeometry args={[1, 1]} />
          {texture ? (
            <meshBasicMaterial
              map={texture}
              transparent
              alphaTest={0.3}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshBasicMaterial color="#ff6666" transparent opacity={0.6} side={THREE.DoubleSide} />
          )}
        </mesh>
      </Billboard>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <ringGeometry args={[token.scale * 0.55, token.scale * 0.62, 32]} />
          <meshBasicMaterial color="#ffcc00" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

import { Suspense, useRef, useState } from "react";
import { Billboard, Html, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TokenData } from "../types";
import { useBoardStore } from "../store";
import { emitUpdateToken } from "../multiplayer";

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
  const lastEmitRef = useRef(0);
  const lastPositionRef = useRef<[number, number, number]>(token.position);
  const { updateTokenPosition, selectToken, selectedTokenId, gridSize, cellSize } =
    useBoardStore();

  const isSelected = selectedTokenId === token.id;
  const floorY = token.position[1];

  function onPointerDown(e: any) {
    e.stopPropagation();
    selectToken(token.id);
    if (!useBoardStore.getState().canControlToken(token)) return; // só seleciona, não arrasta
    setDragging(true);
    useBoardStore.getState().setInteracting(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onDoubleClick(e: any) {
    e.stopPropagation();
    if (token.sheet) useBoardStore.getState().openSheet(token.id);
  }

  function onPointerUp() {
    setDragging(false);
    useBoardStore.getState().setInteracting(false);
    // Garante que a posição final seja sincronizada mesmo se o throttle pulou o último frame
    emitUpdateToken(token.id, { position: lastPositionRef.current });
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
    lastPositionRef.current = [x, floorY, z];

    // Throttle: evita inundar o servidor com um evento por pixel movido
    const now = performance.now();
    if (now - lastEmitRef.current > 50) {
      lastEmitRef.current = now;
      emitUpdateToken(token.id, { position: [x, floorY, z] });
    }
  }

  return (
    <group
      ref={groupRef}
      position={token.position}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerMove={onPointerMove}
      onDoubleClick={onDoubleClick}
      onPointerOut={() => {
        setDragging(false);
        useBoardStore.getState().setInteracting(false);
      }}
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
              fog={false}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshBasicMaterial color="#ff6666" transparent opacity={0.6} side={THREE.DoubleSide} />
          )}
        </mesh>
        {token.sheet && (
          <Html position={[0, token.scale * 0.58, 0]} center distanceFactor={8} occlude={false}>
            <div
              style={{
                width: 44,
                height: 6,
                borderRadius: 3,
                background: "rgba(10,8,6,0.75)",
                border: "1px solid rgba(90,74,58,0.9)",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, (token.sheet.hp / Math.max(1, token.sheet.maxHp)) * 100))}%`,
                  background:
                    token.sheet.hp / token.sheet.maxHp > 0.5
                      ? "#5fd16a"
                      : token.sheet.hp / token.sheet.maxHp > 0.2
                      ? "#e0b63c"
                      : "#e05c5c",
                }}
              />
            </div>
          </Html>
        )}
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

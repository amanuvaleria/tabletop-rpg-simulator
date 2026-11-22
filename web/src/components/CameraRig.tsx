import { useRef } from "react";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useBoardStore } from "../store";
import type * as THREE from "three";

/**
 * Alterna entre:
 * - "2d": câmera ortográfica vista de cima (top-down), rotação bloqueada.
 * - "3d": câmera em perspectiva, livre (orbit controls completos).
 */
export default function CameraRig() {
  const cameraMode = useBoardStore((s) => s.cameraMode);
  const interacting = useBoardStore((s) => s.interacting);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const perspRef = useRef<THREE.PerspectiveCamera>(null);

  return (
    <>
      <PerspectiveCamera
        ref={perspRef}
        makeDefault={cameraMode === "3d"}
        position={[10, 10, 10]}
        fov={50}
      />
      <OrthographicCamera
        ref={orthoRef}
        makeDefault={cameraMode === "2d"}
        position={[0, 20, 0]}
        zoom={40}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        makeDefault
        enabled={!interacting}
        enableRotate={cameraMode === "3d"}
        minPolarAngle={cameraMode === "2d" ? 0 : 0}
        maxPolarAngle={cameraMode === "2d" ? 0 : Math.PI / 2.1}
        target={[0, 0, 0]}
      />
    </>
  );
}

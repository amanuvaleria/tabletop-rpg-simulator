import { Canvas } from "@react-three/fiber";
import Board from "./Board";
import Token from "./Token";
import CameraRig from "./CameraRig";
import { useBoardStore } from "../store";

export default function Scene() {
  const tokens = useBoardStore((s) => s.tokens);
  const selectToken = useBoardStore((s) => s.selectToken);

  return (
    <Canvas
      shadows
      style={{ width: "100%", height: "100%", background: "#161210" }}
      onPointerMissed={() => selectToken(null)}
    >
      <CameraRig />
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 15, 8]} intensity={1} castShadow />

      <Board />

      {tokens.map((token) => (
        <Token key={token.id} token={token} />
      ))}
    </Canvas>
  );
}

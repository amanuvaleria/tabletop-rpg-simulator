import { Canvas } from "@react-three/fiber";
import Board from "./Board";
import Token from "./Token";
import CameraRig from "./CameraRig";
import DiceRollMesh from "./DiceMesh";
import PropItem from "../props/PropItem";
import { useBoardStore } from "../store";

export default function Scene() {
  const tokens = useBoardStore((s) => s.tokens);
  const props = useBoardStore((s) => s.props);
  const night = useBoardStore((s) => s.night);
  const liveRolls = useBoardStore((s) => s.liveRolls);
  const selectToken = useBoardStore((s) => s.selectToken);

  return (
    <Canvas
      shadows
      style={{ width: "100%", height: "100%", background: night ? "#07080d" : "#161210" }}
      onPointerMissed={() => {
        selectToken(null); // tambem limpa a selecao de props
      }}
    >
      <CameraRig />
      <ambientLight intensity={night ? 0.12 : 0.6} color={night ? "#8fa4ff" : "#ffffff"} />
      <directionalLight position={[8, 15, 8]} intensity={night ? 0.12 : 1} color={night ? "#8fa4ff" : "#ffffff"} castShadow />

      <Board />

      {props.map((prop) => (
        <PropItem key={prop.id} prop={prop} />
      ))}

      {tokens.map((token) => (
        <Token key={token.id} token={token} />
      ))}
      {liveRolls.map((roll) => (
        <DiceRollMesh key={roll.id} roll={roll} />
      ))}
    </Canvas>
  );
}

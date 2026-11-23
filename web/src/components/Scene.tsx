import { Canvas } from "@react-three/fiber";
import Board from "./Board";
import SpriteLayer from "../sprites/SpriteLayer";
import Token from "./Token";
import CameraRig from "./CameraRig";
import DiceRollMesh from "./DiceMesh";
import PropItem from "../props/PropItem";
import Atmosphere from "./Atmosphere";
import * as THREE from "three";
import { useBoardStore } from "../store";

export default function Scene() {
  const tokens = useBoardStore((s) => s.tokens);
  const props = useBoardStore((s) => s.props);
  const liveRolls = useBoardStore((s) => s.liveRolls);
  const selectToken = useBoardStore((s) => s.selectToken);

  return (
    <Canvas
      shadows
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
      style={{ width: "100%", height: "100%" }}
      onPointerMissed={() => {
        selectToken(null);
        useBoardStore.getState().selectSprites([]);
      }}
    >
      <CameraRig />
      <Atmosphere />

      <Board />
      <SpriteLayer />

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

import Scene from "./components/Scene";
import Toolbar from "./components/Toolbar";
import RoomGate from "./components/RoomGate";
import PropPalette from "./components/PropPalette";
import DicePanel from "./components/DicePanel";
import RoomBadge from "./components/RoomBadge";
import CharacterSheetPanel from "./components/CharacterSheetPanel";
import { useBoardStore } from "./store";
import "./App.css";

export default function App() {
  const connectionStatus = useBoardStore((s) => s.connectionStatus);
  const roomId = useBoardStore((s) => s.roomId);

  if (!roomId) {
    return <RoomGate />;
  }

  return (
    <div className="app-root">
      <Toolbar />
      <RoomBadge />
      <DicePanel />
      <PropPalette />
      <CharacterSheetPanel />
      {connectionStatus !== "connected" && (
        <div
          style={{
            position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 20,
            background: "#7a3030", color: "#fff", padding: "6px 14px", borderRadius: 6,
            fontFamily: "system-ui, sans-serif", fontSize: 13,
          }}
        >
          Conexão perdida, reconectando…
        </div>
      )}
      <Scene />
    </div>
  );
}

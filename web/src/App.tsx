import Scene from "./components/Scene";
import Toolbar from "./components/Toolbar";
import RoomGate from "./components/RoomGate";
import RoomBadge from "./components/RoomBadge";
import { useBoardStore } from "./store";
import "./App.css";

export default function App() {
  const connectionStatus = useBoardStore((s) => s.connectionStatus);
  const roomId = useBoardStore((s) => s.roomId);

  if (!roomId || connectionStatus !== "connected") {
    return <RoomGate />;
  }

  return (
    <div className="app-root">
      <Toolbar />
      <RoomBadge />
      <Scene />
    </div>
  );
}

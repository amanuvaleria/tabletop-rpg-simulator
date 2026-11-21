import Scene from "./components/Scene";
import Toolbar from "./components/Toolbar";
import "./App.css";

export default function App() {
  return (
    <div className="app-root">
      <Toolbar />
      <Scene />
    </div>
  );
}

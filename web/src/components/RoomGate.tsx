import { useState } from "react";
import { useBoardStore } from "../store";
import { joinRoom, generateRoomCode } from "../multiplayer";

/**
 * Tela exibida antes de entrar no tabuleiro: escolher nome e
 * criar uma sala nova ou entrar numa existente via código/link.
 */
export default function RoomGate() {
  const connectionStatus = useBoardStore((s) => s.connectionStatus);
  const connectionError = useBoardStore((s) => s.connectionError);

  const urlRoom = new URLSearchParams(window.location.search).get("room") ?? "";
  const [name, setName] = useState(() => localStorage.getItem("tabletop:name") ?? "");
  const [roomCode, setRoomCode] = useState(urlRoom.toUpperCase());

  const connecting = connectionStatus === "connecting";

  async function enterRoom(code: string) {
    const trimmedName = name.trim() || "Jogador";
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return;

    localStorage.setItem("tabletop:name", trimmedName);
    try {
      await joinRoom(trimmedCode, trimmedName);
      const url = new URL(window.location.href);
      url.searchParams.set("room", trimmedCode);
      window.history.replaceState(null, "", url.toString());
    } catch (err) {
      console.error(err);
    }
  }

  function handleCreate() {
    const code = generateRoomCode();
    setRoomCode(code);
    enterRoom(code);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    enterRoom(roomCode);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎲 Tabletop RPG Simulator</h1>
        <p style={styles.subtitle}>Entre numa sala pra jogar com seu grupo em tempo real.</p>

        <label style={styles.label}>
          Seu nome
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como quer ser chamado"
            maxLength={32}
          />
        </label>

        <form onSubmit={handleJoin} style={styles.row}>
          <label style={{ ...styles.label, flex: 1 }}>
            Código da sala
            <input
              style={styles.input}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Ex: A1B2C3"
              maxLength={12}
            />
          </label>
          <button type="submit" style={styles.btn} disabled={connecting || !roomCode.trim()}>
            Entrar
          </button>
        </form>

        <div style={styles.divider}>ou</div>

        <button style={styles.btnPrimary} onClick={handleCreate} disabled={connecting}>
          + Criar nova sala
        </button>

        {connecting && <p style={styles.status}>Conectando…</p>}
        {connectionError && <p style={styles.error}>⚠️ {connectionError}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#161210",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    width: 360,
    background: "rgba(30, 24, 20, 0.95)",
    border: "1px solid #4a3a2c",
    borderRadius: 12,
    padding: 28,
    color: "#f1e6d6",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  title: { margin: 0, fontSize: 20 },
  subtitle: { margin: 0, opacity: 0.75, fontSize: 13, lineHeight: 1.4 },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.9 },
  input: {
    background: "#120e0c",
    border: "1px solid #4a3a2c",
    borderRadius: 6,
    padding: "8px 10px",
    color: "#f1e6d6",
    fontSize: 14,
  },
  row: { display: "flex", gap: 8, alignItems: "flex-end" },
  btn: {
    background: "#352a21",
    color: "#f1e6d6",
    border: "1px solid #5a4a3a",
    borderRadius: 6,
    padding: "9px 14px",
    cursor: "pointer",
    fontSize: 13,
  },
  btnPrimary: {
    background: "#a8762c",
    color: "#1a140f",
    border: "1px solid #c99043",
    borderRadius: 6,
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  divider: { textAlign: "center", fontSize: 11, opacity: 0.5 },
  status: { margin: 0, fontSize: 12, opacity: 0.8 },
  error: { margin: 0, fontSize: 12, color: "#ff8a8a" },
};

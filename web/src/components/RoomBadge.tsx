import { useState } from "react";
import { useBoardStore } from "../store";
import { leaveRoom } from "../multiplayer";

/** Badge com código da sala, botão de copiar link, papel e usuários conectados. */
export default function RoomBadge() {
  const roomId = useBoardStore((s) => s.roomId);
  const roomUsers = useBoardStore((s) => s.roomUsers);
  const playerName = useBoardStore((s) => s.playerName);
  const role = useBoardStore((s) => s.role);
  const [copied, setCopied] = useState(false);

  if (!roomId) return null;

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId!);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={styles.badge}>
      <div style={styles.row}>
        <span style={styles.dot} />
        <strong>Sala {roomId}</strong>
        <button style={styles.copyBtn} onClick={copyLink}>
          {copied ? "Copiado!" : "Copiar link"}
        </button>
      </div>
      <div style={styles.roleLine}>
        {role === "gm" ? "👑 Você é o Mestre" : "🎭 Você é Jogador"}
      </div>
      <div style={styles.users}>
        {roomUsers.length > 0 ? (
          roomUsers.map((u, i) => (
            <div key={i}>
              {u.role === "gm" ? "👑" : "🎭"} {u.name}
              {u.name === playerName ? " (você)" : ""}
            </div>
          ))
        ) : (
          `Você (${playerName})`
        )}
      </div>
      <button style={styles.leaveBtn} onClick={() => leaveRoom()}>
        Sair da sala
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(20, 16, 14, 0.85)",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    padding: 10,
    color: "#f1e6d6",
    fontFamily: "system-ui, sans-serif",
    fontSize: 12,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 180,
  },
  row: { display: "flex", alignItems: "center", gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#5fd16a",
    display: "inline-block",
  },
  copyBtn: {
    marginLeft: "auto",
    background: "#352a21",
    color: "#f1e6d6",
    border: "1px solid #5a4a3a",
    borderRadius: 5,
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: 11,
  },
  roleLine: { fontWeight: 600, opacity: 0.9 },
  users: { opacity: 0.75, display: "flex", flexDirection: "column", gap: 2 },
  leaveBtn: {
    background: "transparent",
    color: "#ff8a8a",
    border: "1px solid #5a2020",
    borderRadius: 5,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 11,
  },
};

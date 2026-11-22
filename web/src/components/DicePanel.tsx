import { useEffect, useRef, useState } from "react";
import { useBoardStore } from "../store";
import { emitRoll } from "../multiplayer";
import { DICE_SIDES } from "../types";

/** Painel de dados: escolhe quantidade/modificador, rola e mostra o histórico da sala. */
export default function DicePanel() {
  const rolls = useBoardStore((s) => s.rolls);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rolls.length]);

  return (
    <div style={styles.panel}>
      <strong style={styles.label}>Dados</strong>

      <div style={styles.row}>
        <label style={styles.field}>
          Qtd
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            style={styles.input}
            onChange={(e) => setCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          />
        </label>
        <label style={styles.field}>
          Mod
          <input
            type="number"
            min={-99}
            max={99}
            value={modifier}
            style={styles.input}
            onChange={(e) => setModifier(Math.min(99, Math.max(-99, parseInt(e.target.value, 10) || 0)))}
          />
        </label>
      </div>

      <div style={styles.row}>
        {DICE_SIDES.map((s) => (
          <button key={s} style={styles.btn} onClick={() => emitRoll(s, count, modifier)}>
            d{s}
          </button>
        ))}
      </div>

      <div ref={logRef} style={styles.log}>
        {rolls.length === 0 && <span style={{ opacity: 0.5 }}>Nenhuma rolagem ainda.</span>}
        {rolls.map((r) => (
          <div key={r.id} style={styles.entry}>
            <b>{r.user}</b> rolou {r.results.length}d{r.sides}
            {r.modifier ? (r.modifier > 0 ? `+${r.modifier}` : r.modifier) : ""}:{" "}
            [{r.results.join(", ")}] = <b style={{ color: "#ffcc66" }}>{r.total}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 280,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(20, 16, 14, 0.88)",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    padding: 12,
    color: "#f1e6d6",
    fontFamily: "system-ui, sans-serif",
    zIndex: 10,
  },
  label: { fontSize: 12, letterSpacing: 0.5, opacity: 0.8 },
  row: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" },
  field: { display: "flex", flexDirection: "column", gap: 2, fontSize: 11 },
  input: {
    width: 56,
    background: "#241c16",
    color: "#f1e6d6",
    border: "1px solid #5a4a3a",
    borderRadius: 4,
    padding: "4px 6px",
  },
  btn: {
    background: "#352a21",
    color: "#f1e6d6",
    border: "1px solid #5a4a3a",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
  log: {
    maxHeight: 160,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    borderTop: "1px solid #3a3028",
    paddingTop: 6,
  },
  entry: { lineHeight: 1.35 },
};

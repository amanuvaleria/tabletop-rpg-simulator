import { useState } from "react";
import { useBoardStore } from "../store";
import type { CharacterSheet } from "../types";
import { emitUpdateToken } from "../multiplayer";

const ATTR_LABELS: Record<keyof CharacterSheet["attributes"], string> = {
  str: "Força",
  dex: "Destreza",
  con: "Constituição",
  int: "Inteligência",
  wis: "Sabedoria",
  cha: "Carisma",
};

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

/**
 * Painel de ficha de personagem/NPC: HP, CA, atributos e anotações.
 * Qualquer edição é sincronizada com os outros jogadores da sala.
 */
export default function CharacterSheetPanel() {
  const sheetOpenTokenId = useBoardStore((s) => s.sheetOpenTokenId);
  const token = useBoardStore((s) => s.tokens.find((t) => t.id === sheetOpenTokenId));
  const updateToken = useBoardStore((s) => s.updateToken);
  const closeSheet = useBoardStore((s) => s.closeSheet);
  const canControlToken = useBoardStore((s) => s.canControlToken);
  const [hpDelta, setHpDelta] = useState("");

  if (!token || !token.sheet) return null;
  const sheet = token.sheet;
  const locked = !canControlToken(token);

  function patchSheet(patch: Partial<CharacterSheet>) {
    if (!token || !token.sheet) return;
    const nextSheet = { ...token.sheet, ...patch };
    updateToken(token.id, { sheet: nextSheet });
    emitUpdateToken(token.id, { sheet: nextSheet });
  }

  function applyHpDelta(sign: 1 | -1) {
    const n = parseInt(hpDelta, 10);
    if (!Number.isFinite(n)) return;
    const next = Math.max(0, Math.min(sheet.maxHp, sheet.hp + sign * n));
    patchSheet({ hp: next });
    setHpDelta("");
  }

  const hpPct = sheet.maxHp > 0 ? Math.max(0, Math.min(100, (sheet.hp / sheet.maxHp) * 100)) : 0;
  const hpColor = hpPct > 50 ? "#5fd16a" : hpPct > 20 ? "#e0b63c" : "#e05c5c";

  return (
    <div style={styles.overlay} onClick={closeSheet}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <img src={token.imageUrl} alt={token.name} style={styles.portrait} />
          <div style={{ flex: 1 }}>
            <input
              style={styles.nameInput}
              value={token.name}
              disabled={locked}
              onChange={(e) => {
                updateToken(token.id, { name: e.target.value });
                emitUpdateToken(token.id, { name: e.target.value });
              }}
            />
            <div style={styles.kindLabel}>
              {token.kind === "character" ? "Personagem" : "NPC"}
              {locked && token.ownerName && ` · controlado por ${token.ownerName}`}
            </div>
          </div>
          <button style={styles.closeBtn} onClick={closeSheet}>
            ✕
          </button>
        </div>

        <div style={styles.section}>
          <div style={styles.hpRow}>
            <strong style={styles.sectionLabel}>Pontos de Vida</strong>
            <span style={{ fontSize: 13 }}>
              {sheet.hp} / {sheet.maxHp}
            </span>
          </div>
          <div style={styles.hpBarBg}>
            <div style={{ ...styles.hpBarFill, width: `${hpPct}%`, background: hpColor }} />
          </div>
          <div style={styles.row}>
            <input
              style={{ ...styles.smallInput, width: 56 }}
              type="number"
              placeholder="qtd"
              value={hpDelta}
              disabled={locked}
              onChange={(e) => setHpDelta(e.target.value)}
            />
            <button style={styles.btnDanger} disabled={locked} onClick={() => applyHpDelta(-1)}>
              − Dano
            </button>
            <button style={styles.btnHeal} disabled={locked} onClick={() => applyHpDelta(1)}>
              + Cura
            </button>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>
              HP máximo
              <input
                style={styles.smallInput}
                type="number"
                value={sheet.maxHp}
                disabled={locked}
                onChange={(e) => {
                  const maxHp = Math.max(1, parseInt(e.target.value, 10) || 1);
                  patchSheet({ maxHp, hp: Math.min(sheet.hp, maxHp) });
                }}
              />
            </label>
            <label style={styles.label}>
              Classe de Armadura (CA)
              <input
                style={styles.smallInput}
                type="number"
                value={sheet.ac}
                disabled={locked}
                onChange={(e) => patchSheet({ ac: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
          </div>
        </div>

        <div style={styles.section}>
          <strong style={styles.sectionLabel}>Atributos</strong>
          <div style={styles.attrGrid}>
            {(Object.keys(sheet.attributes) as (keyof CharacterSheet["attributes"])[]).map(
              (key) => (
                <div key={key} style={styles.attrBox}>
                  <span style={styles.attrLabel}>{ATTR_LABELS[key]}</span>
                  <input
                    style={styles.attrInput}
                    type="number"
                    value={sheet.attributes[key]}
                    disabled={locked}
                    onChange={(e) =>
                      patchSheet({
                        attributes: {
                          ...sheet.attributes,
                          [key]: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                  />
                  <span style={styles.attrMod}>{mod(sheet.attributes[key])}</span>
                </div>
              )
            )}
          </div>
        </div>

        <div style={styles.section}>
          <strong style={styles.sectionLabel}>Anotações</strong>
          <textarea
            style={styles.textarea}
            value={sheet.notes}
            placeholder="Inventário, habilidades, história..."
            disabled={locked}
            onChange={(e) => patchSheet({ notes: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  panel: {
    width: 380,
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#1e1814",
    border: "1px solid #4a3a2c",
    borderRadius: 10,
    padding: 18,
    color: "#f1e6d6",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: { display: "flex", gap: 12, alignItems: "center" },
  portrait: {
    width: 56,
    height: 56,
    objectFit: "cover",
    borderRadius: 8,
    border: "1px solid #5a4a3a",
    background: "#120e0c",
  },
  nameInput: {
    background: "transparent",
    border: "none",
    borderBottom: "1px solid #4a3a2c",
    color: "#f1e6d6",
    fontSize: 16,
    fontWeight: 600,
    width: "100%",
    padding: "2px 0",
  },
  kindLabel: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  closeBtn: {
    background: "transparent",
    border: "1px solid #5a4a3a",
    color: "#f1e6d6",
    borderRadius: 6,
    width: 28,
    height: 28,
    cursor: "pointer",
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.5, opacity: 0.85 },
  hpRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  hpBarBg: {
    width: "100%",
    height: 10,
    background: "#120e0c",
    borderRadius: 5,
    overflow: "hidden",
    border: "1px solid #4a3a2c",
  },
  hpBarFill: { height: "100%", transition: "width 0.2s ease" },
  row: { display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.85 },
  smallInput: {
    background: "#120e0c",
    border: "1px solid #4a3a2c",
    borderRadius: 6,
    padding: "6px 8px",
    color: "#f1e6d6",
    fontSize: 13,
    width: 70,
  },
  btnDanger: {
    background: "#5a2020",
    color: "#f1e6d6",
    border: "1px solid #7a3030",
    borderRadius: 6,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  btnHeal: {
    background: "#1f4a2a",
    color: "#f1e6d6",
    border: "1px solid #2f6a3a",
    borderRadius: 6,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  attrGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  attrBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    background: "#120e0c",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    padding: "8px 4px",
  },
  attrLabel: { fontSize: 10, opacity: 0.7 },
  attrInput: {
    background: "transparent",
    border: "none",
    color: "#f1e6d6",
    fontSize: 16,
    fontWeight: 600,
    width: "100%",
    textAlign: "center",
  },
  attrMod: { fontSize: 11, opacity: 0.6 },
  textarea: {
    background: "#120e0c",
    border: "1px solid #4a3a2c",
    borderRadius: 6,
    padding: 8,
    color: "#f1e6d6",
    fontSize: 13,
    minHeight: 70,
    resize: "vertical",
    fontFamily: "inherit",
  },
};

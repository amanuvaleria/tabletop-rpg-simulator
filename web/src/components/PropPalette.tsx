import { useState } from "react";
import { useBoardStore } from "../store";
import { emitAddProp, emitLoadMap, emitRemoveProp, emitUpdateProp } from "../multiplayer";
import { MOODS } from "./Atmosphere";
import type { Mood } from "../types";
import { CATEGORIES, FLOORS, MAP_PRESETS, PROP_CATALOG, newProp } from "../props/catalog";
import type { FloorKind } from "../types";

/** Painel de cenário: mapas prontos, piso, objetos para adicionar e edição do objeto selecionado. */
export default function PropPalette() {
  const [open, setOpen] = useState(true);
  const props = useBoardStore((s) => s.props);
  const selectedPropId = useBoardStore((s) => s.selectedPropId);
  const floor = useBoardStore((s) => s.floor);
  const mood = useBoardStore((s) => s.mood);
  const setMood = useBoardStore((s) => s.setMood);
  const fx = useBoardStore((s) => s.fx);
  const setFx = useBoardStore((s) => s.setFx);
  const selected = props.find((p) => p.id === selectedPropId) ?? null;
  const selDef = selected ? PROP_CATALOG[selected.kind] : null;

  function add(kind: string) {
    // Espalha um pouquinho para objetos novos não ficarem empilhados no mesmo ponto
    const n = props.length % 5;
    const p = newProp(kind, -2 + n, 0 + n * 0.5);
    useBoardStore.getState().addProp(p);
    useBoardStore.getState().selectProp(p.id);
    emitAddProp(p);
  }

  function loadPreset(id: string) {
    const preset = MAP_PRESETS.find((m) => m.id === id);
    if (!preset) return;
    if (props.length > 0 && !window.confirm(`Carregar "${preset.label}"? Isso substitui os objetos de cenário atuais (tokens e dados continuam).`)) return;
    emitLoadMap(preset.floor, preset.build());
  }

  function setFloor(f: FloorKind) {
    emitLoadMap(f, props); // mantém os props, só troca o piso (vale pra sala toda)
  }

  function patchSel(patch: Partial<NonNullable<typeof selected>>) {
    if (!selected) return;
    useBoardStore.getState().updateProp(selected.id, patch);
    emitUpdateProp(selected.id, patch);
  }

  return (
    <div style={styles.panel}>
      <div style={styles.head} onClick={() => setOpen(!open)}>
        <strong>Cenário</strong>
        <span>{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={styles.body}>
          {selected && selDef && (
            <div style={styles.sel}>
              <strong style={styles.label}>Selecionado: {selDef.label}</strong>
              <div style={styles.row}>
                {selDef.light && (
                  <button style={selected.on ? styles.btnActive : styles.btn} onClick={() => patchSel({ on: !selected.on })}>
                    {selected.on ? "💡 Ligado" : "⚫ Desligado"}
                  </button>
                )}
                <button style={styles.btn} onClick={() => patchSel({ rotationY: selected.rotationY - Math.PI / 4 })}>⟲ 45°</button>
                <button style={styles.btn} onClick={() => patchSel({ rotationY: selected.rotationY + Math.PI / 4 })}>⟳ 45°</button>
              </div>
              <label style={styles.small}>
                Tamanho
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={selected.scale}
                  onChange={(e) => patchSel({ scale: parseFloat(e.target.value) })}
                />
              </label>
              <button
                style={styles.btnDanger}
                onClick={() => {
                  useBoardStore.getState().removeProp(selected.id);
                  emitRemoveProp(selected.id);
                }}
              >
                Remover objeto
              </button>
              {selDef.light && <span style={styles.hint}>Dica: clique no próprio objeto no mapa para ligar/desligar.</span>}
            </div>
          )}

          <strong style={styles.label}>Mapas prontos</strong>
          <div style={styles.row}>
            {MAP_PRESETS.map((m) => (
              <button key={m.id} style={styles.btn} onClick={() => loadPreset(m.id)}>
                {m.label}
              </button>
            ))}
          </div>

          <strong style={styles.label}>Piso e ambiente</strong>
          <div style={styles.row}>
            {(Object.keys(FLOORS) as FloorKind[]).map((f) => (
              <button key={f} style={floor === f ? styles.btnActive : styles.btn} onClick={() => setFloor(f)}>
                {FLOORS[f].label}
              </button>
            ))}
          </div>

          <strong style={styles.label}>Clima</strong>
          <div style={styles.row}>
            {(Object.keys(MOODS) as Mood[]).map((k) => (
              <button key={k} style={mood === k ? styles.btnActive : styles.btn} onClick={() => setMood(k)}>
                {MOODS[k].label}
              </button>
            ))}
            <button style={fx ? styles.btnActive : styles.btn} onClick={() => setFx(!fx)} title="Desligue se estiver pesado">
              ✨ Efeitos {fx ? "on" : "off"}
            </button>
          </div>

          {CATEGORIES.map((cat) => (
            <div key={cat} style={styles.cat}>
              <strong style={styles.label}>{cat}</strong>
              <div style={styles.row}>
                {Object.entries(PROP_CATALOG)
                  .filter(([, d]) => d.category === cat)
                  .map(([kind, d]) => (
                    <button key={kind} style={styles.btn} onClick={() => add(kind)}>
                      + {d.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}

          <button
            style={styles.btnDanger}
            onClick={() => {
              if (!window.confirm("Limpar todo o cenário?")) return;
              emitLoadMap(floor, []);
            }}
          >
            Limpar cenário
          </button>
        </div>
      )}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  background: "#352a21",
  color: "#f1e6d6",
  border: "1px solid #5a4a3a",
  borderRadius: 6,
  padding: "5px 8px",
  cursor: "pointer",
  fontSize: 12,
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 120,
    right: 12,
    width: 270,
    maxHeight: "calc(100vh - 120px - 250px)",
    display: "flex",
    flexDirection: "column",
    background: "rgba(20, 16, 14, 0.9)",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    color: "#f1e6d6",
    fontFamily: "system-ui, sans-serif",
    zIndex: 10,
  },
  head: { display: "flex", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer" },
  body: { overflowY: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 },
  cat: { display: "flex", flexDirection: "column", gap: 6 },
  sel: { display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px solid #a8762c", borderRadius: 6 },
  label: { fontSize: 12, letterSpacing: 0.4, opacity: 0.85 },
  small: { display: "flex", flexDirection: "column", gap: 2, fontSize: 11 },
  hint: { fontSize: 11, opacity: 0.6 },
  row: { display: "flex", gap: 5, flexWrap: "wrap" },
  btn: btnBase,
  btnActive: { ...btnBase, background: "#a8762c", color: "#1a140f", border: "1px solid #c99043", fontWeight: 600 },
  btnDanger: { ...btnBase, background: "#5a2020", border: "1px solid #7a3030" },
};

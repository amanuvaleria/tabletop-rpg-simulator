import { useRef } from "react";
import { useBoardStore } from "../store";
import type { TokenKind } from "../types";
import { emitAddToken, emitRemoveToken, emitUpdateToken } from "../multiplayer";

const KIND_LABEL: Record<TokenKind, string> = {
  character: "Personagem",
  npc: "NPC",
  object: "Objeto",
};

/**
 * Barra de ferramentas: alterna câmera 2D/3D, faz upload de PNG para
 * criar novos tokens, e permite editar o token selecionado.
 */
export default function Toolbar() {
  const cameraMode = useBoardStore((s) => s.cameraMode);
  const setCameraMode = useBoardStore((s) => s.setCameraMode);
  const addToken = useBoardStore((s) => s.addToken);
  const tokens = useBoardStore((s) => s.tokens);
  const selectedTokenId = useBoardStore((s) => s.selectedTokenId);
  const updateToken = useBoardStore((s) => s.updateToken);
  const removeToken = useBoardStore((s) => s.removeToken);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKindRef = useRef<TokenKind>("character");

  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? null;

  function triggerUpload(kind: TokenKind) {
    pendingKindRef.current = kind;
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const kind = pendingKindRef.current;
      const token = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        kind,
        imageUrl: dataUrl,
        position: [0, 0.75, 0] as [number, number, number],
        scale: 1.5,
        rotationY: 0,
      };
      addToken(token);
      emitAddToken(token);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={styles.toolbar}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/webp"
        style={{ display: "none" }}
        onChange={onFileChosen}
      />

      <div style={styles.group}>
        <strong style={styles.groupLabel}>Câmera</strong>
        <div style={styles.row}>
          <button
            style={cameraMode === "2d" ? styles.btnActive : styles.btn}
            onClick={() => setCameraMode("2d")}
          >
            2D (topo)
          </button>
          <button
            style={cameraMode === "3d" ? styles.btnActive : styles.btn}
            onClick={() => setCameraMode("3d")}
          >
            3D (livre)
          </button>
        </div>
      </div>

      <div style={styles.group}>
        <strong style={styles.groupLabel}>Adicionar PNG</strong>
        <div style={styles.row}>
          <button style={styles.btn} onClick={() => triggerUpload("character")}>
            + Personagem
          </button>
          <button style={styles.btn} onClick={() => triggerUpload("npc")}>
            + NPC
          </button>
          <button style={styles.btn} onClick={() => triggerUpload("object")}>
            + Objeto
          </button>
        </div>
      </div>

      {selectedToken && (
        <div style={styles.group}>
          <strong style={styles.groupLabel}>
            Selecionado: {selectedToken.name} ({KIND_LABEL[selectedToken.kind]})
          </strong>
          <div style={styles.row}>
            <label style={styles.label}>
              Tamanho
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.1}
                value={selectedToken.scale}
                onChange={(e) => {
                  const scale = parseFloat(e.target.value);
                  updateToken(selectedToken.id, { scale });
                  emitUpdateToken(selectedToken.id, { scale });
                }}
              />
            </label>
            <button
              style={styles.btnDanger}
              onClick={() => {
                removeToken(selectedToken.id);
                emitRemoveToken(selectedToken.id);
              }}
            >
              Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    position: "absolute",
    top: 12,
    left: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "rgba(20, 16, 14, 0.85)",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    padding: 12,
    color: "#f1e6d6",
    fontFamily: "system-ui, sans-serif",
    zIndex: 10,
    maxWidth: 280,
  },
  group: { display: "flex", flexDirection: "column", gap: 6 },
  groupLabel: { fontSize: 12, letterSpacing: 0.5, opacity: 0.8 },
  row: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  btn: {
    background: "#352a21",
    color: "#f1e6d6",
    border: "1px solid #5a4a3a",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
  btnActive: {
    background: "#a8762c",
    color: "#1a140f",
    border: "1px solid #c99043",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnDanger: {
    background: "#5a2020",
    color: "#f1e6d6",
    border: "1px solid #7a3030",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
  label: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 },
};

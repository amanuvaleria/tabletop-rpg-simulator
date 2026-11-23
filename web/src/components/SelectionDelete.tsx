import { useEffect } from "react";
import { useBoardStore } from "../store";
import { emitRemoveProp, emitRemoveToken } from "../multiplayer";
import { deleteSelected } from "../sprites/actions";

/** Delete never consumes a key used by an editable control or an open character sheet. */
function isEditing(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]'
  );
}

export function removeSelection() {
  const s = useBoardStore.getState();
  if (s.connectionStatus !== "connected") return;
  if (s.selectedPropId) {
    if (s.role !== "gm") return;
    emitRemoveProp(s.selectedPropId);
    s.removeProp(s.selectedPropId);
    s.setInteracting(false);
  } else if (s.selectedTokenId) {
    const token = s.tokens.find(t => t.id === s.selectedTokenId);
    // Match the server's ownership check, including old tokens without an owner.
    if (!token || !(s.role === "gm" || token.ownerId === s.mySocketId)) return;
    emitRemoveToken(token.id);
    s.removeToken(token.id);
    if (s.sheetOpenTokenId === token.id) s.closeSheet();
    s.setInteracting(false);
  } else if (s.selectedSpriteIds.length && s.role === "gm") {
    deleteSelected(); // respects sprite/layer locks and records undo
  }
}

/** Keyboard shortcut shared by existing props, PNG tokens and library sprites. */
export default function SelectionDelete() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const s = useBoardStore.getState();
      if (isEditing(e.target) || isEditing(document.activeElement) || s.sheetOpenTokenId) return;
      if (!s.selectedPropId && !s.selectedTokenId && !s.selectedSpriteIds.length) return;
      e.preventDefault();
      removeSelection();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return null;
}

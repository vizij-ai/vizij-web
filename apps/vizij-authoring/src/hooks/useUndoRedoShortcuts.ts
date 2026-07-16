import { useEffect } from "react";
import { appHistory } from "../state/history/historyStore";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Global ⌘Z / ⇧⌘Z (Ctrl on non-mac; Ctrl+Y also redoes) bound to the app
 * history. Skips events targeting text fields so native text-editing undo
 * keeps working inside inputs.
 */
export function useUndoRedoShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (key === "y" || event.shiftKey) {
        appHistory.redo();
      } else {
        appHistory.undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

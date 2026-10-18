import { useCallback, useEffect, useRef } from "react";
import type { Runtime } from "@vizij/runtime";

/**
 * Holds the keys an edit writes, while the edit is made, against the face's
 * own behavior (`Runtime.holdKeys`): a rig input or a pose weight that the
 * standard adaptation, a program or an animation also writes shows the
 * author's value while it is being edited.
 *
 * An edit is made while a pointer is down or a key is held anywhere on the
 * page: from the press to the release of a slider, a drag in a field, a key
 * held on a focused control. Its end — the pointer's or the key's release,
 * or the page losing focus — releases every key it held, and the behavior
 * writes them again at the next step. A write made outside an edit, such as
 * a reset or the inputs restaged on a reloaded face, holds nothing.
 *
 * Returns `holdWhileEditing(key)`, to call with each key an edit writes.
 */
export function useEditHolds(runtime: Runtime | null): (key: string) => void {
  const editingRef = useRef(false);
  const heldRef = useRef<{ runtime: Runtime; keys: Set<string> } | null>(null);

  useEffect(() => {
    const release = () => {
      editingRef.current = false;
      const held = heldRef.current;
      heldRef.current = null;
      if (held && held.keys.size > 0) {
        held.runtime.releaseKeys([...held.keys]);
      }
    };
    const begin = () => {
      editingRef.current = true;
    };
    window.addEventListener("pointerdown", begin, true);
    window.addEventListener("keydown", begin, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", begin, true);
      window.removeEventListener("keydown", begin, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("keyup", release, true);
      window.removeEventListener("blur", release);
      release();
    };
  }, []);

  return useCallback(
    (key: string) => {
      if (!editingRef.current || !runtime) {
        return;
      }
      // A reloaded face starts with no holds: what the previous one held
      // went with it.
      if (heldRef.current?.runtime !== runtime) {
        heldRef.current = { runtime, keys: new Set() };
      }
      const held = heldRef.current;
      if (held.keys.has(key)) {
        return;
      }
      held.keys.add(key);
      runtime.holdKeys([key]);
    },
    [runtime],
  );
}

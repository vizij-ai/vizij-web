import { useEffect, useRef, useState, type RefObject } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

const STANDARD_PATHS = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

const POINTER_IDLE_TIMEOUT_MS = 1400;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export type MouseGazeHandle = {
  ref: RefObject<HTMLDivElement | null>;
  isPointerActive: boolean;
};

export function useMouseGaze(enabled: boolean): MouseGazeHandle {
  const { setInput, faceId: runtimeFaceId } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();
  const ref = useRef<HTMLDivElement>(null);
  const [isPointerActive, setPointerActive] = useState(false);
  const pointerActiveRef = useRef(false);
  const idleTimeoutRef = useRef<number | null>(null);

  const updatePointerActive = (next: boolean) => {
    if (pointerActiveRef.current === next) {
      return;
    }
    pointerActiveRef.current = next;
    setPointerActive(next);
  };

  useEffect(() => {
    if (!enabled) {
      updatePointerActive(false);
      return;
    }
    const target = ref.current;
    if (!target) {
      return;
    }

    const clearIdleTimeout = () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };

    const scheduleIdleTimeout = () => {
      clearIdleTimeout();
      idleTimeoutRef.current = window.setTimeout(() => {
        updatePointerActive(false);
        idleTimeoutRef.current = null;
      }, POINTER_IDLE_TIMEOUT_MS);
    };

    const setEye = (path: string, value: number) => {
      const fullPath = `rig/${faceId}/${path}`;
      // console.log(fullPath, { float: clamp(value) })
      setInput(fullPath, { float: clamp(value) });
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      const normalizedX = clamp(xRatio * 2 - 1);
      const normalizedY = ((1 - yRatio) * 2 - 1) * 3;

      setEye(STANDARD_PATHS.leftX, normalizedX);
      setEye(STANDARD_PATHS.rightX, normalizedX);
      setEye(STANDARD_PATHS.leftY, normalizedY);
      setEye(STANDARD_PATHS.rightY, normalizedY);
      updatePointerActive(true);
      scheduleIdleTimeout();
    };

    const reset = () => {
      setEye(STANDARD_PATHS.leftX, 0);
      setEye(STANDARD_PATHS.leftY, 0);
      setEye(STANDARD_PATHS.rightX, 0);
      setEye(STANDARD_PATHS.rightY, 0);
      updatePointerActive(false);
      clearIdleTimeout();
    };

    target.addEventListener("pointermove", handlePointer);
    target.addEventListener("pointerdown", handlePointer);
    target.addEventListener("pointerleave", reset);
    target.addEventListener("pointerup", reset);

    return () => {
      target.removeEventListener("pointermove", handlePointer);
      target.removeEventListener("pointerdown", handlePointer);
      target.removeEventListener("pointerleave", reset);
      target.removeEventListener("pointerup", reset);
      clearIdleTimeout();
      updatePointerActive(false);
    };
  }, [enabled, faceId, setInput]);

  return { ref, isPointerActive };
}

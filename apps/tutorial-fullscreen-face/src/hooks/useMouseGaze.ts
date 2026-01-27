import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

const STANDARD_PATHS = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export function useMouseGaze(
  enabled: boolean,
): RefObject<HTMLDivElement | null> {
  const { setInput, faceId: runtimeFaceId } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const target = ref.current;
    if (!target) {
      return;
    }

    const setEye = (path: string, value: number) => {
      const fullPath = `rig/${faceId}/${path}`;
      setInput(fullPath, { float: clamp(value) });
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      const normalizedX = -1 * clamp(xRatio * 2 - 1);
      const normalizedY = clamp((1 - yRatio) * 2 - 1);

      setEye(STANDARD_PATHS.leftX, normalizedX);
      setEye(STANDARD_PATHS.rightX, normalizedX);
      setEye(STANDARD_PATHS.leftY, normalizedY);
      setEye(STANDARD_PATHS.rightY, normalizedY);
    };

    const reset = () => {
      setEye(STANDARD_PATHS.leftX, 0);
      setEye(STANDARD_PATHS.leftY, 0);
      setEye(STANDARD_PATHS.rightX, 0);
      setEye(STANDARD_PATHS.rightY, 0);
    };

    target.addEventListener("pointermove", handlePointer, true);
    target.addEventListener("pointerdown", handlePointer, true);
    target.addEventListener("pointerleave", reset);
    target.addEventListener("pointerup", reset, true);

    return () => {
      target.removeEventListener("pointermove", handlePointer, true);
      target.removeEventListener("pointerdown", handlePointer, true);
      target.removeEventListener("pointerleave", reset);
      target.removeEventListener("pointerup", reset, true);
    };
  }, [enabled, faceId, setInput]);
  return ref;
}

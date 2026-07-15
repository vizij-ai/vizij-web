import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  mapNormalizedControlValue,
  resolveFaceControls,
  useVizijRuntime,
} from "@vizij/runtime-react";

const POINTER_IDLE_TIMEOUT_MS = 1400;
// The demo face area is short and wide, so vertical pointer travel is
// amplified to keep the eyes expressive across the full frame height.
const POINTER_Y_SCALE = 3;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export type DemoMouseGazeHandle = {
  ref: RefObject<HTMLDivElement | null>;
  isPointerActive: boolean;
};

export function useDemoMouseGaze(enabled: boolean): DemoMouseGazeHandle {
  const {
    setInput,
    faceId: runtimeFaceId,
    assetBundle,
    inputConstraints,
  } = useVizijRuntime();
  const ref = useRef<HTMLDivElement>(null);
  const [isPointerActive, setPointerActive] = useState(false);
  const pointerActiveRef = useRef(false);
  const idleTimeoutRef = useRef<number | null>(null);
  const controls = useMemo(
    () => resolveFaceControls(assetBundle, runtimeFaceId, inputConstraints),
    [assetBundle, inputConstraints, runtimeFaceId],
  );

  const updatePointerActive = (next: boolean) => {
    if (pointerActiveRef.current === next) {
      return;
    }
    pointerActiveRef.current = next;
    setPointerActive(next);
  };

  const setEye = useCallback(
    (path: keyof typeof controls.eyes, value: number) => {
      const control = controls.eyes[path];
      if (!control) {
        return;
      }
      setInput(control.path, {
        float: mapNormalizedControlValue(control, clamp(value)),
      });
    },
    [controls, setInput],
  );

  const resetEyes = useCallback(() => {
    setEye("leftX", 0);
    setEye("leftY", 0);
    setEye("rightX", 0);
    setEye("rightY", 0);
  }, [setEye]);

  useEffect(() => {
    if (!enabled) {
      resetEyes();
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

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      const normalizedX = clamp(xRatio * 2 - 1);
      const normalizedY = clamp(((1 - yRatio) * 2 - 1) * POINTER_Y_SCALE);

      setEye("leftX", normalizedX);
      setEye("rightX", normalizedX);
      setEye("leftY", normalizedY);
      setEye("rightY", normalizedY);
      updatePointerActive(true);
      scheduleIdleTimeout();
    };

    const reset = () => {
      resetEyes();
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
      resetEyes();
      updatePointerActive(false);
    };
  }, [enabled, resetEyes, setEye]);

  return { ref, isPointerActive };
}

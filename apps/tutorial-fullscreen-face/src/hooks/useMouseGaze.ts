import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  mapNormalizedControlValue,
  resolveFaceControls,
} from "@vizij/studio-support";

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export function useMouseGaze(
  enabled: boolean,
): RefObject<HTMLDivElement | null> {
  const {
    setInput,
    faceId: runtimeFaceId,
    assetBundle,
    inputConstraints,
  } = useVizijRuntime();
  const ref = useRef<HTMLDivElement>(null);
  const controls = useMemo(
    () => resolveFaceControls(assetBundle, runtimeFaceId, inputConstraints),
    [assetBundle, inputConstraints, runtimeFaceId],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const target = ref.current;
    if (!target) {
      return;
    }

    const setEye = (path: keyof typeof controls.eyes, value: number) => {
      const control = controls.eyes[path];
      if (!control) {
        return;
      }
      setInput(control.path, {
        float: mapNormalizedControlValue(control, clamp(value)),
      });
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      const normalizedX = clamp(xRatio * 2 - 1);
      const normalizedY = clamp((1 - yRatio) * 2 - 1);

      setEye("leftX", normalizedX);
      setEye("rightX", normalizedX);
      setEye("leftY", normalizedY);
      setEye("rightY", normalizedY);
    };

    const reset = () => {
      setEye("leftX", 0);
      setEye("leftY", 0);
      setEye("rightX", 0);
      setEye("rightY", 0);
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
  }, [controls, enabled, setInput]);

  return ref;
}

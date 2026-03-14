import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildPoseWeightPathMap,
  buildPoseWeightRelativePath,
  resolvePoseSemantics,
  type PoseRigConfig,
  type PoseDefinition,
  useVizijRuntime,
} from "@vizij/runtime-react";

const HOTKEY_LAYOUT = [
  { code: "Digit1", label: "1" },
  { code: "Digit2", label: "2" },
  { code: "Digit3", label: "3" },
  { code: "Digit4", label: "4" },
  { code: "Digit5", label: "5" },
  { code: "Digit6", label: "6" },
  { code: "Digit7", label: "7" },
  { code: "Digit8", label: "8" },
  { code: "Digit9", label: "9" },
  { code: "Digit0", label: "0" },
  { code: "KeyQ", label: "Q" },
  { code: "KeyW", label: "W" },
  { code: "KeyE", label: "E" },
  { code: "KeyR", label: "R" },
  { code: "KeyT", label: "T" },
  { code: "KeyY", label: "Y" },
  { code: "KeyU", label: "U" },
  { code: "KeyI", label: "I" },
  { code: "KeyO", label: "O" },
  { code: "KeyP", label: "P" },
  { code: "KeyA", label: "A" },
  { code: "KeyS", label: "S" },
  { code: "KeyD", label: "D" },
  { code: "KeyF", label: "F" },
  { code: "KeyG", label: "G" },
  { code: "KeyH", label: "H" },
  { code: "KeyJ", label: "J" },
  { code: "KeyK", label: "K" },
  { code: "KeyL", label: "L" },
  { code: "KeyZ", label: "Z" },
  { code: "KeyX", label: "X" },
  { code: "KeyC", label: "C" },
  { code: "KeyV", label: "V" },
  { code: "KeyB", label: "B" },
  { code: "KeyN", label: "N" },
  { code: "KeyM", label: "M" },
] as const;

export const POSE_HOTKEY_ORDER = HOTKEY_LAYOUT.map((entry) => entry.code);
export const POSE_HOTKEY_LAYOUT = HOTKEY_LAYOUT;
export type PoseHotkey = (typeof HOTKEY_LAYOUT)[number];

const DEFAULT_POSE_WEIGHT = 0.75;

function clampPoseWeight(weight: number) {
  return Math.min(DEFAULT_POSE_WEIGHT, Math.max(0, weight));
}

export type PoseHotkeyBinding = {
  pose: PoseDefinition;
  weightPath: string;
  relativePath: string;
  semanticKey: string | null;
  semanticKind: "emotion" | "viseme" | "other";
};

export function usePoseHotkeys(
  poseConfig: PoseRigConfig | null,
  enabled: boolean,
) {
  const { faceId: runtimeFaceId, animateValue } = useVizijRuntime();
  const poseFaceSegment = poseConfig?.faceId ?? runtimeFaceId ?? "face";
  const bindingsLoggedRef = useRef(false);

  const poseWeightPaths = useMemo(() => {
    if (!poseConfig) {
      return new Map<string, string>();
    }
    return buildPoseWeightPathMap(poseConfig.poses ?? [], poseFaceSegment);
  }, [poseConfig, poseFaceSegment]);

  const bindings = useMemo<PoseHotkeyBinding[]>(() => {
    if (!poseConfig) {
      return [];
    }
    const poses = poseConfig.poses ?? [];
    return poses.map((pose) => {
      const relativePath = buildPoseWeightRelativePath(pose.id);
      const fallbackPath = `rig/${poseFaceSegment}${relativePath}`;
      const semantics = resolvePoseSemantics(pose, poseConfig.poseGroups);
      return {
        pose,
        weightPath: poseWeightPaths.get(pose.id) ?? fallbackPath,
        relativePath,
        semanticKey: semantics.key,
        semanticKind: semantics.kind,
      };
    });
  }, [poseConfig, poseFaceSegment, poseWeightPaths]);

  const setPoseWeight = useCallback(
    (binding: PoseHotkeyBinding, weight: number, duration?: number) => {
      if (!binding || !enabled) {
        return;
      }
      void animateValue(
        binding.weightPath,
        { float: clampPoseWeight(weight) },
        { duration: duration ?? (weight > 0 ? 0.2 : 0.25) },
      );
    },
    [animateValue, enabled],
  );

  useEffect(() => {
    if (bindingsLoggedRef.current || bindings.length === 0) {
      return;
    }
    bindingsLoggedRef.current = true;
    const entries = bindings.map((binding) => ({
      id: binding.pose.id,
      name: binding.pose.name ?? null,
      group: binding.pose.group ?? null,
      path: binding.weightPath,
    }));
    console.log("[fullscreen-face] pose hotkey bindings", entries);
  }, [bindings]);

  return { bindings, setPoseWeight };
}

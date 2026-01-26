import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useVizijRuntime,
  type PoseRigConfig,
  type PoseDefinition,
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

export type PoseHotkeyBinding = {
  pose: PoseDefinition;
  weightPath: string;
  relativePath: string;
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
      const faceSegment = sanitizeFaceSegment(poseFaceSegment);
      const groupSegment = sanitizeGroupSegment(pose.group);
      const relativeSegment = sanitizePoseSegment(
        pose.name ?? pose.id,
        pose.id,
      );
      const relativePath = `/${groupSegment}/${relativeSegment}.weight`;
      const fallbackPath = buildRigInputPath(faceSegment, relativePath);
      return {
        pose,
        weightPath: poseWeightPaths.get(pose.id) ?? fallbackPath,
        relativePath,
      };
    });
  }, [poseConfig, poseFaceSegment, poseWeightPaths]);

  const setPoseWeight = useCallback(
    (binding: PoseHotkeyBinding, weight: number) => {
      if (!binding || !enabled) {
        return;
      }
      void animateValue(
        binding.weightPath,
        { float: weight },
        { duration: weight > 0 ? 0.2 : 0.25 },
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

function sanitizeFaceSegment(faceId: string | null | undefined): string {
  const trimmed = faceId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "face";
}

function sanitizePoseSegment(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalised = normalizeSegment(value);
  if (normalised) {
    return normalised;
  }
  const fallbackNormalised = normalizeSegment(fallback);
  if (fallbackNormalised) {
    return fallbackNormalised;
  }
  return "pose";
}

function sanitizeGroupSegment(group: string | null | undefined): string {
  const normalised = normalizeSegment(group);
  if (!normalised) {
    return "poses";
  }
  if (normalised.startsWith("emotion")) {
    return "emotions";
  }
  if (normalised.startsWith("viseme")) {
    return "visemes";
  }
  return normalised;
}

function normalizeSegment(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildPoseWeightPathMap(
  poses: PoseDefinition[],
  faceSegment: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const usage = new Map<string, number>();
  const face = sanitizeFaceSegment(faceSegment);

  poses.forEach((pose) => {
    const groupSegment = sanitizeGroupSegment(pose.group);
    const baseSegment = sanitizePoseSegment(pose.name ?? pose.id, pose.id);
    const usageKey = `${groupSegment}:${baseSegment}`;
    const count = usage.get(usageKey) ?? 0;
    usage.set(usageKey, count + 1);
    const segment = count === 0 ? baseSegment : `${baseSegment}_${count + 1}`;
    const relativePath = `/${groupSegment}/${segment}.weight`;
    map.set(pose.id, buildRigInputPath(face, relativePath));
  });

  return map;
}

function buildRigInputPath(faceId: string, path: string): string {
  let trimmed = path.startsWith("/") ? path.slice(1) : path;
  if (!trimmed) {
    return `rig/${faceId}`;
  }
  while (trimmed.startsWith("rig/")) {
    const segments = trimmed.split("/");
    if (segments.length >= 3) {
      const existingFaceId = segments[1];
      const remainder = segments.slice(2).join("/");
      if (existingFaceId === faceId) {
        return trimmed;
      }
      trimmed = remainder || "";
    } else {
      trimmed = segments.slice(1).join("/");
    }
  }
  const suffix = trimmed ? `/${trimmed}` : "";
  return `rig/${faceId}${suffix}`;
}

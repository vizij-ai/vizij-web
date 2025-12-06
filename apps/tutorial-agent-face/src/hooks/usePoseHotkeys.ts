import { useEffect, useMemo } from "react";
import {
  useVizijRuntime,
  type PoseDefinition,
  type PoseRigConfig,
} from "@vizij/runtime-react";

export const POSE_HOTKEY_ORDER = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
] as const;

export type PoseHotkeyBinding = {
  pose: PoseDefinition;
  weightPath: string;
  relativePath: string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeGroup(group?: string | null): string {
  const normalized = slugify(group ?? "poses");
  if (!normalized) return "poses";
  if (normalized.startsWith("emotion")) return "emotions";
  if (normalized.startsWith("viseme")) return "visemes";
  return normalized;
}

function createPosePathMap(
  faceId: string,
  poseConfig: PoseRigConfig,
): Map<string, string> {
  const map = new Map<string, string>();
  const counters = new Map<string, Map<string, number>>();
  const poses = poseConfig.poses ?? [];

  poses.forEach((pose, index) => {
    const group = normalizeGroup(pose.group);
    let slug = slugify(pose.name ?? "") || slugify(pose.id ?? "");
    if (!slug) slug = `pose_${index + 1}`;

    const groupCounts = counters.get(group) ?? new Map<string, number>();
    const seen = groupCounts.get(slug) ?? 0;
    groupCounts.set(slug, seen + 1);
    counters.set(group, groupCounts);
    const uniqueSlug = seen === 0 ? slug : `${slug}_${seen + 1}`;

    map.set(pose.id, `rig/${faceId}/${group}/${uniqueSlug}.weight`);
  });

  return map;
}

export function usePoseHotkeys(
  poseConfig: PoseRigConfig | null,
  enabled: boolean,
  options: { enableHotkeys?: boolean } = {},
) {
  const { faceId: runtimeFaceId, animateValue } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();
  const { enableHotkeys = true } = options;

  const bindings = useMemo<PoseHotkeyBinding[]>(() => {
    if (!poseConfig) return [];
    const posePathMap = createPosePathMap(faceId, poseConfig);
    return (poseConfig.poses ?? [])
      .map((pose) => {
        const weightPath = posePathMap.get(pose.id);
        if (!weightPath) return null;
        return {
          pose,
          weightPath,
          relativePath: weightPath.replace(`rig/${faceId}/`, ""),
        } as PoseHotkeyBinding;
      })
      .filter(Boolean) as PoseHotkeyBinding[];
  }, [faceId, poseConfig]);

  useEffect(() => {
    if (!enableHotkeys || !enabled || bindings.length === 0) return;

    const hotkeyBindings = POSE_HOTKEY_ORDER.reduce<
      Map<string, PoseHotkeyBinding>
    >((acc, code, index) => {
      const binding = bindings[index];
      if (binding) acc.set(code, binding);
      return acc;
    }, new Map());

    if (hotkeyBindings.size === 0) return;

    const activeKeys = new Set<string>();

    const applyWeight = (binding: PoseHotkeyBinding, weight: number) => {
      animateValue(binding.weightPath, { float: weight }, { duration: 0.2 });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const binding = hotkeyBindings.get(event.code);
      if (!binding || activeKeys.has(event.code)) return;
      activeKeys.add(event.code);
      applyWeight(binding, 1);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const binding = hotkeyBindings.get(event.code);
      if (!binding) return;
      activeKeys.delete(event.code);
      applyWeight(binding, 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      hotkeyBindings.forEach((binding) => applyWeight(binding, 0));
    };
  }, [animateValue, bindings, enableHotkeys, enabled]);

  const setPoseWeight = (
    binding: PoseHotkeyBinding,
    weight: number,
    duration = 0.25,
  ) => {
    if (!binding?.weightPath) return;
    animateValue(binding.weightPath, { float: weight }, { duration });
  };

  return { bindings, setPoseWeight };
}

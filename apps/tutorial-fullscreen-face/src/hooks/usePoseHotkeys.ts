import { useEffect, useMemo } from "react";
import {
  useVizijRuntime,
  type PoseRigConfig,
  type PoseDefinition,
} from "@vizij/runtime-react";

export const POSE_HOTKEY_ORDER = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
] as const;

type PosePathBinding = {
  pose: PoseDefinition;
  path: string;
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
  if (!normalized) {
    return "poses";
  }
  if (normalized.startsWith("emotion")) {
    return "emotions";
  }
  if (normalized.startsWith("viseme")) {
    return "visemes";
  }
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
    if (!slug) {
      slug = `pose_${index + 1}`;
    }

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
) {
  const { faceId: runtimeFaceId, animateValue } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();
  const posePathMap = useMemo(() => {
    if (!poseConfig) {
      return null;
    }
    return createPosePathMap(faceId, poseConfig);
  }, [faceId, poseConfig]);

  useEffect(() => {
    if (!enabled || !poseConfig || !posePathMap || posePathMap.size === 0) {
      return;
    }

    const poses = poseConfig.poses ?? [];

    const bindings = POSE_HOTKEY_ORDER.reduce<Map<string, PosePathBinding>>(
      (acc, code, index) => {
        const pose = poses[index];
        if (pose) {
          const path = posePathMap.get(pose.id);
          if (path) {
            acc.set(code, { pose, path });
          } else {
            console.warn(
              `[fullscreen-face] Missing pose path for ${pose.name ?? pose.id}`,
            );
          }
        }
        return acc;
      },
      new Map(),
    );

    if (bindings.size === 0) {
      return;
    }

    const activeKeys = new Set<string>();

    const applyWeight = (binding: PosePathBinding, weight: number) => {
      animateValue(binding.path, { float: weight }, { duration: 2 });
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const binding = bindings.get(event.code);
      if (!binding) {
        return;
      }
      if (activeKeys.has(event.code)) {
        return;
      }
      activeKeys.add(event.code);
      applyWeight(binding, 1);
    };

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      const binding = bindings.get(event.code);
      if (!binding) {
        return;
      }
      activeKeys.delete(event.code);
      applyWeight(binding, 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      bindings.forEach((binding) => applyWeight(binding, 0));
    };
  }, [animateValue, enabled, faceId, poseConfig, posePathMap]);
}

import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

import type { PoseRigConfig, PoseDefinition } from "../assets";

export const POSE_HOTKEY_ORDER = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
] as const;

function toPathSegment(pose: PoseDefinition): string {
  const source = (pose.name ?? pose.id ?? "").trim();
  if (!source) {
    return pose.id.toLowerCase();
  }
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function usePoseHotkeys(
  poseConfig: PoseRigConfig,
  enabled: boolean,
) {
  const { setInput, faceId: runtimeFaceId } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const bindings = POSE_HOTKEY_ORDER.reduce<Map<string, PoseDefinition>>(
      (acc, code, index) => {
        const pose = poseConfig.poses[index];
        if (pose) {
          acc.set(code, pose);
        }
        return acc;
      },
      new Map(),
    );

    if (bindings.size === 0) {
      return;
    }

    const activeKeys = new Set<string>();

    const applyWeight = (pose: PoseDefinition, weight: number) => {
      const segment = toPathSegment(pose);
      const path = `rig/${faceId}/poses/${segment}.weight`;
      setInput(path, { float: weight });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose) {
        return;
      }
      if (activeKeys.has(event.code)) {
        return;
      }
      activeKeys.add(event.code);
      applyWeight(pose, 1);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose) {
        return;
      }
      activeKeys.delete(event.code);
      applyWeight(pose, 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      bindings.forEach((pose) => applyWeight(pose, 0));
    };
  }, [enabled, faceId, poseConfig.poses, setInput]);
}

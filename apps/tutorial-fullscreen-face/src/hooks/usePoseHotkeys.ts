import { useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  buildPoseWeightPathMap,
  EXPRESSIVE_EMOTION_POSE_KEYS,
  filterPosesBySemanticKind,
  getPoseSemanticKey,
  type PoseRigConfig,
  type PoseDefinition,
} from "@vizij/studio-support";

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

const DEFAULT_POSE_WEIGHT = 0.75;

type PosePathBinding = {
  pose: PoseDefinition;
  path: string;
  semanticKey: string | null;
};

function orderFullscreenPoses(config: PoseRigConfig): PoseDefinition[] {
  const poses = config.poses ?? [];
  const emotions = filterPosesBySemanticKind(
    poses,
    config.poseGroups,
    "emotion",
  );
  const visemes = filterPosesBySemanticKind(poses, config.poseGroups, "viseme");
  const emotionsByKey = new Map(
    emotions.map((pose) => [getPoseSemanticKey(pose), pose] as const),
  );
  const orderedExpressive = EXPRESSIVE_EMOTION_POSE_KEYS.map((key) =>
    emotionsByKey.get(key),
  ).filter((pose): pose is PoseDefinition => Boolean(pose));
  const expressiveIds = new Set(orderedExpressive.map((pose) => pose.id));
  const remainingEmotions = emotions.filter(
    (pose) => !expressiveIds.has(pose.id),
  );
  const claimedIds = new Set(
    [...orderedExpressive, ...remainingEmotions].map((pose) => pose.id),
  );
  const remainingVisemes = visemes.filter((pose) => !claimedIds.has(pose.id));
  remainingVisemes.forEach((pose) => claimedIds.add(pose.id));
  const remainingPoses = poses.filter((pose) => !claimedIds.has(pose.id));
  return [
    ...orderedExpressive,
    ...remainingEmotions,
    ...remainingVisemes,
    ...remainingPoses,
  ];
}

export function usePoseHotkeys(
  poseConfig: PoseRigConfig | null,
  enabled: boolean,
) {
  const { faceId: runtimeFaceId, animateValue } = useVizijRuntime();
  const faceId = poseConfig?.faceId ?? runtimeFaceId ?? "face";
  const posePathMap = useMemo(() => {
    if (!poseConfig) {
      return null;
    }
    return buildPoseWeightPathMap(poseConfig.poses ?? [], faceId);
  }, [faceId, poseConfig]);
  const orderedBindings = useMemo<PosePathBinding[]>(() => {
    if (!poseConfig || !posePathMap || posePathMap.size === 0) {
      return [];
    }
    return orderFullscreenPoses(poseConfig)
      .map((pose) => {
        const path = posePathMap.get(pose.id);
        if (!path) {
          return null;
        }
        return {
          pose,
          path,
          semanticKey: getPoseSemanticKey(pose),
        };
      })
      .filter((binding): binding is PosePathBinding => Boolean(binding));
  }, [poseConfig, posePathMap]);

  useEffect(() => {
    if (!enabled || orderedBindings.length === 0) {
      return;
    }

    const bindings = POSE_HOTKEY_ORDER.reduce<Map<string, PosePathBinding>>(
      (acc, code, index) => {
        const binding = orderedBindings[index];
        if (binding) {
          acc.set(code, binding);
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
      applyWeight(binding, DEFAULT_POSE_WEIGHT);
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
  }, [animateValue, enabled, orderedBindings]);

  return { bindings: orderedBindings };
}

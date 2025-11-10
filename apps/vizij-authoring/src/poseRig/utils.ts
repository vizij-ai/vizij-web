import { useMemo } from "react";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import type {
  LowLevelBinding,
  LowLevelRigSummary,
  PoseDefinition,
  StandardInputId,
} from "./types";

export function createNeutralInputs(
  inputs: StandardRigInput[] = [],
): Record<StandardInputId, number> {
  const values: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    values[input.id] = input.defaultValue ?? 0;
  });
  return values;
}

export function ensureNeutralDefaults(
  current: Record<StandardInputId, number>,
  inputs: StandardRigInput[],
): Record<StandardInputId, number> {
  const next = { ...current };
  let changed = false;
  inputs.forEach((input) => {
    if (next[input.id] === undefined) {
      next[input.id] = input.defaultValue ?? 0;
      changed = true;
    }
  });
  return changed ? next : current;
}

export function buildRigInputPath(faceId: string, path: string): string {
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

export function buildBindingsByInput(
  summary: LowLevelRigSummary | null | undefined,
): Map<StandardInputId, LowLevelBinding[]> {
  const map = new Map<StandardInputId, LowLevelBinding[]>();
  if (!summary) {
    return map;
  }
  summary.bindings.forEach((binding) => {
    if (!binding.inputId) {
      return;
    }
    const list = map.get(binding.inputId) ?? [];
    list.push(binding);
    map.set(binding.inputId, list);
  });
  return map;
}

export function collectBindingIssues(
  summary: LowLevelRigSummary | null | undefined,
  animatables: Record<string, AnimatableValue>,
  components: AnimatableComponent[],
): string[] {
  if (!summary) {
    return [];
  }

  const issues: string[] = [];
  const componentLookup = new Set(components.map((component) => component.id));

  summary.bindings.forEach((binding) => {
    if (!binding.inputId) {
      return;
    }
    if (!animatables[binding.animatableId]) {
      issues.push(
        `Animatable ${binding.animatableId} missing for binding ${binding.inputId}`,
      );
    }
    if (!componentLookup.has(binding.targetId)) {
      issues.push(`Component ${binding.targetId} missing for binding.`);
    }
  });

  return issues;
}

export function useMemoizedBindingsByInput(summary: LowLevelRigSummary | null) {
  return useMemo(() => buildBindingsByInput(summary), [summary]);
}

export function capturePoseSnapshot(options: {
  inputs: StandardRigInput[];
  currentValues: Record<StandardInputId, number>;
}): Record<StandardInputId, number> {
  const { inputs, currentValues } = options;
  const snapshot: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    const value = currentValues[input.id] ?? 0;
    snapshot[input.id] = value;
  });
  return snapshot;
}

export function duplicatePoseDefinition(pose: PoseDefinition): PoseDefinition {
  return {
    ...pose,
    id: `${pose.id}_copy_${Math.random().toString(36).slice(2, 8)}`,
    name: `${pose.name} Copy`,
    values: { ...pose.values },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

import { useMemo } from "react";
import type { AnimatableValue } from "@vizij/utils";
import {
  STANDARD_RIG_INPUTS,
  STANDARD_RIG_INPUTS_BY_ID,
  type StandardRigInput,
} from "../low-level/standardRigInputs";
import { createDefaultInputValues as createDefaultStandardInputs } from "../low-level/state";
import type { AnimatableComponent } from "../low-level/animatableMetadata";
import type {
  LowLevelBinding,
  LowLevelRigSummary,
  StandardInputId,
} from "./types";

export function createNeutralInputs(
  inputs: StandardRigInput[] = STANDARD_RIG_INPUTS,
): Record<StandardInputId, number> {
  const defaults = createDefaultStandardInputs();
  const values: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    values[input.id] = defaults[input.id] ?? input.defaultValue ?? 0;
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
      next[input.id] = input.defaultValue;
      changed = true;
    }
  });
  return changed ? next : current;
}

export function clampToInputRange(
  inputId: StandardInputId,
  value: number,
): number {
  const input = STANDARD_RIG_INPUTS_BY_ID.get(inputId);
  if (!input) {
    return value;
  }
  const { min, max } = input.range;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function buildRigInputPath(faceId: string, path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `rig/${faceId}/${trimmed}`;
}

export function computeStandardInputsFromPaths(
  paths: string[],
): StandardRigInput[] {
  const seen = new Set<string>();
  const inputs: StandardRigInput[] = [];
  paths.forEach((path) => {
    const input = STANDARD_RIG_INPUTS.find(
      (candidate) => candidate.path === path,
    );
    if (input && !seen.has(input.id)) {
      inputs.push(input);
      seen.add(input.id);
    }
  });
  return inputs;
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
    if (!STANDARD_RIG_INPUTS_BY_ID.has(binding.inputId)) {
      issues.push(
        `Unknown standard rig input: ${binding.inputId} (bound to ${binding.targetId})`,
      );
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

export function captureEmotionPoseSnapshot(options: {
  inputs: StandardRigInput[];
  currentValues: Record<StandardInputId, number>;
}): Record<StandardInputId, number> {
  const { inputs, currentValues } = options;
  const snapshot: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    const value = currentValues[input.id] ?? input.defaultValue ?? 0;
    snapshot[input.id] = clampToInputRange(input.id, value);
  });
  return snapshot;
}

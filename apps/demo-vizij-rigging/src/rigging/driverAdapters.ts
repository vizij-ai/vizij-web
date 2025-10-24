import type {
  RigDriver,
  RigDriverGraph,
  RigDriverSource,
  RigDriverTarget,
  RigDriverTransform,
  StandardRigInput,
} from "@vizij/utils";

import { buildRigInputPath } from "./utils";
import type {
  EmotionDefinition,
  LowLevelRigSummary,
  StandardInputId,
} from "./types";

interface BuildRiggingDriverGraphOptions {
  faceId: string | null;
  namespace?: string;
  standardInputs: StandardRigInput[];
  neutralInputs: Record<StandardInputId, number>;
  emotions: EmotionDefinition[];
  lowLevelSummary?: LowLevelRigSummary | null;
}

function createUnassignedSource(targetId: string): RigDriverSource {
  return {
    type: "unassigned",
    id: `unassigned:${targetId}`,
    label: "Unassigned",
  };
}

function createStandardInputSource(
  input: StandardRigInput | undefined,
  inputId: string | null,
  fallbackTargetId: string,
): RigDriverSource {
  if (!inputId) {
    return createUnassignedSource(fallbackTargetId);
  }
  if (!input) {
    return {
      type: "standard-input",
      id: inputId,
      label: inputId,
    };
  }
  return {
    type: "standard-input",
    id: input.id,
    label: input.label,
    path: input.path,
  };
}

function createLinearRemapTransform(
  binding: LowLevelRigSummary["bindings"][number],
): RigDriverTransform {
  return {
    type: "linear-remap",
    inMin: binding.remap.inMin,
    inMax: binding.remap.inMax,
    outMin: binding.remap.outMin,
    outMax: binding.remap.outMax,
  };
}

function createPoseDeltaTransform(
  neutral: number,
  value: number,
): RigDriverTransform {
  const delta = value - neutral;
  return {
    type: "pose-delta",
    neutral,
    value,
    delta,
  };
}

function clampValueForInput(input: StandardRigInput, value: number): number {
  if (!Number.isFinite(value)) {
    return input.defaultValue ?? 0;
  }
  const { min, max } = input.range;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildPoseWeightPath(faceId: string, segment: string): string {
  return buildRigInputPath(faceId, `/poses/${segment}.weight`);
}

function sanitizePathSegment(value: string, fallback: string): string {
  const fromLabel = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (fromLabel) {
    return fromLabel;
  }
  const fromFallback = fallback
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return fromFallback || "pose";
}

function createRemapDriversFromSummary(
  summary: LowLevelRigSummary,
  standardInputsById: Map<string, StandardRigInput>,
): RigDriver[] {
  return summary.bindings.map((binding) => {
    const input = binding.inputId
      ? standardInputsById.get(binding.inputId)
      : undefined;

    const source =
      binding.inputId !== null
        ? createStandardInputSource(input, binding.inputId, binding.targetId)
        : createUnassignedSource(binding.targetId);

    const target: RigDriverTarget = {
      type: "animatable",
      id: binding.animatableId,
      path: binding.animatableId,
      component: binding.component,
      label: binding.targetId,
    };

    return {
      id: `remap:${binding.targetId}`,
      kind: "remap",
      source,
      outputs: [
        {
          target,
          transform: createLinearRemapTransform(binding),
        },
      ],
      metadata: {
        targetId: binding.targetId,
        animatableId: binding.animatableId,
        component: binding.component,
        standardInputId: binding.inputId ?? null,
      },
    } satisfies RigDriver;
  });
}

function createPoseDrivers(
  options: BuildRiggingDriverGraphOptions,
): RigDriver[] {
  const { emotions, faceId, neutralInputs } = options;
  if (!emotions.length) {
    return [];
  }

  const normalizedNeutralInputs: Record<string, number> = {};
  options.standardInputs.forEach((input) => {
    normalizedNeutralInputs[input.id] = input.defaultValue ?? 0;
  });
  Object.assign(normalizedNeutralInputs, neutralInputs);

  const faceSegment =
    faceId && faceId.trim().length > 0 ? faceId.trim() : "face";
  const usage = new Map<string, number>();

  return emotions.map((emotion) => {
    const sanitized = sanitizePathSegment(emotion.name ?? "", emotion.id);
    const count = usage.get(sanitized) ?? 0;
    usage.set(sanitized, count + 1);
    const segment = count === 0 ? sanitized : `${sanitized}_${count + 1}`;
    const weightPath = buildPoseWeightPath(faceSegment, segment);

    const outputs = options.standardInputs.reduce<RigDriver["outputs"]>(
      (acc, input) => {
        const neutral = clampValueForInput(
          input,
          normalizedNeutralInputs[input.id] ?? input.defaultValue ?? 0,
        );
        const poseValueRaw = emotion.values[input.id];
        const poseValue = clampValueForInput(
          input,
          poseValueRaw === undefined ? neutral : poseValueRaw,
        );
        const delta = poseValue - neutral;
        if (Math.abs(delta) < 1e-6) {
          return acc;
        }
        const target: RigDriverTarget = {
          type: "rig-input",
          id: input.id,
          path: buildRigInputPath(faceSegment, input.path),
          label: input.label,
        };
        acc.push({
          target,
          transform: createPoseDeltaTransform(neutral, poseValue),
        });
        return acc;
      },
      [],
    );

    return {
      id: `pose:${emotion.id}`,
      kind: "pose",
      source: {
        type: "pose-weight",
        id: emotion.id,
        label: emotion.name,
        path: weightPath,
      },
      outputs,
      metadata: {
        pose: {
          id: emotion.id,
          name: emotion.name,
          description: emotion.description,
          createdAt: emotion.createdAt,
          updatedAt: emotion.updatedAt,
        },
      },
    } satisfies RigDriver;
  });
}

export function buildRiggingDriverGraph(
  options: BuildRiggingDriverGraphOptions,
): RigDriverGraph {
  const standardInputsById = new Map(
    options.standardInputs.map((input) => [input.id, input]),
  );
  const drivers: RigDriver[] = [];

  if (options.lowLevelSummary) {
    drivers.push(
      ...createRemapDriversFromSummary(
        options.lowLevelSummary,
        standardInputsById,
      ),
    );
  }

  drivers.push(
    ...createPoseDrivers(options).filter((driver) => driver.outputs.length > 0),
  );

  return {
    faceId: options.faceId ?? null,
    namespace: options.namespace,
    drivers,
    standardInputs: options.standardInputs,
  };
}

import {
  buildMachineReport,
  buildRigGraphSpec,
  type BindingMap,
  type BuildGraphResult,
  type InputBindingMap,
  type InputComposeMode,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent as AnimComponent,
  AnimatableValue,
  RigPipelineV1InputConfig,
  StandardRigInput,
} from "@vizij/utils";
import type { PersistedGraphInsight } from "../../rig/persistence";
import {
  resolveRuntimeGraphSpec,
  type RuntimeGraphSpec,
} from "../runtimeGraphSpec";

export interface PoseConfigSnapshot {
  poses?: Array<{
    values?: Record<string, number | undefined>;
    composeModes?: Record<string, unknown>;
  }>;
}

export type PipelineConfigByInputId = Record<string, Record<string, unknown>>;

export function withPipelineConfigBuildOptions<
  T extends Record<string, unknown>,
>(
  options: T,
  pipelineConfigByInputId: PipelineConfigByInputId | null | undefined,
  pipelineMetadataV1?: Record<string, unknown> | null,
): T {
  const normalizedMap = pipelineConfigByInputId
    ? Object.fromEntries(
        Object.entries(pipelineConfigByInputId)
          .filter(
            ([, config]) =>
              Boolean(config) &&
              typeof config === "object" &&
              !Array.isArray(config),
          )
          .map(([inputId, config]) => [
            inputId,
            {
              ...(config as Record<string, unknown>),
              inputId,
            } satisfies RigPipelineV1InputConfig,
          ]),
      )
    : {};
  const hasNormalizedMap = Object.keys(normalizedMap).length > 0;
  const hasPipelineMetadata =
    Boolean(pipelineMetadataV1) &&
    typeof pipelineMetadataV1 === "object" &&
    !Array.isArray(pipelineMetadataV1);
  if (!hasNormalizedMap && !hasPipelineMetadata) {
    return options;
  }
  const mergedPipelineV1 = {
    ...(hasPipelineMetadata
      ? (pipelineMetadataV1 as Record<string, unknown>)
      : {}),
    ...(hasNormalizedMap
      ? {
          byInputId: normalizedMap as Record<string, RigPipelineV1InputConfig>,
        }
      : {}),
  };
  return {
    ...(options as Record<string, unknown>),
    pipelineV1: mergedPipelineV1,
  } as unknown as T;
}

export interface RigGraphCompileInputs {
  faceId: string | null;
  animatables: Record<string, AnimatableValue>;
  components: AnimComponent[];
  bindings: BindingMap;
  inputsById: Map<string, StandardRigInput>;
  inputBindings: InputBindingMap;
  inputMetadata: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  poseConfig: PoseConfigSnapshot | null;
  pipelineConfigByInputId?: PipelineConfigByInputId;
  pipelineMetadataV1?: Record<string, unknown> | null;
}

export function buildPoseComposeModeByInputId(
  poseConfig: PoseConfigSnapshot | null | undefined,
): Partial<Record<string, InputComposeMode>> {
  const next: Partial<Record<string, InputComposeMode>> = {};
  const poses = Array.isArray(poseConfig?.poses) ? poseConfig.poses : [];
  poses.forEach((pose) => {
    if (!pose || typeof pose !== "object") {
      return;
    }
    const targets =
      pose.values && typeof pose.values === "object" ? pose.values : {};
    Object.keys(targets).forEach((inputId) => {
      const rawMode =
        pose.composeModes && typeof pose.composeModes === "object"
          ? pose.composeModes[inputId]
          : undefined;
      next[inputId] = rawMode === "average" ? "average" : "add";
    });
  });
  return next;
}

export function buildRigGraphCompile(
  inputs: RigGraphCompileInputs,
): BuildGraphResult | null {
  const {
    faceId,
    animatables,
    components,
    bindings,
    inputsById,
    inputBindings,
    inputMetadata,
    poseConfig,
    pipelineConfigByInputId,
    pipelineMetadataV1,
  } = inputs;
  if (!faceId) {
    return null;
  }
  const buildOptions = withPipelineConfigBuildOptions(
    {
      faceId,
      animatables,
      components,
      bindings,
      inputsById,
      inputBindings,
      inputMetadata,
      inputComposeModesById: buildPoseComposeModeByInputId(poseConfig),
    },
    pipelineConfigByInputId,
    pipelineMetadataV1,
  );
  return buildRigGraphSpec(buildOptions);
}

export interface RuntimeGraphResolution {
  resolved: ReturnType<typeof resolveRuntimeGraphSpec>;
  nextLastKnownGood: RuntimeGraphSpec | null;
}

export function resolveRuntimeGraphSpecWithCache(
  rigGraphBuild: BuildGraphResult | null,
  lastKnownGoodRuntimeSpec: RuntimeGraphSpec | null,
): RuntimeGraphResolution {
  const resolved = resolveRuntimeGraphSpec(
    rigGraphBuild,
    lastKnownGoodRuntimeSpec,
  );
  const nextLastKnownGood =
    !resolved.blocked && resolved.runtimeSpec
      ? resolved.runtimeSpec
      : lastKnownGoodRuntimeSpec;
  return { resolved, nextLastKnownGood };
}

export function buildBindingIssuesMap(
  rigGraphBuild: BuildGraphResult | null,
): Map<string, readonly string[]> {
  if (!rigGraphBuild) {
    return new Map<string, readonly string[]>();
  }
  return new Map(
    Object.entries(rigGraphBuild.issues.byTarget).map(([targetId, issues]) => [
      targetId,
      [...issues],
    ]),
  );
}

export function buildGraphMachineReport(
  rigGraphBuild: BuildGraphResult | null,
): ReturnType<typeof buildMachineReport> | null {
  return rigGraphBuild ? buildMachineReport(rigGraphBuild) : null;
}

export function createGraphInsightSnapshot(
  result: BuildGraphResult,
): PersistedGraphInsight {
  return {
    summary: {
      faceId: result.summary.faceId,
      inputs: [...result.summary.inputs],
      outputs: [...result.summary.outputs],
      bindings: result.summary.bindings.length,
    },
    issues: {
      fatal: [...result.issues.fatal],
      byTarget: Object.fromEntries(
        Object.entries(result.issues.byTarget).map(([targetId, issues]) => [
          targetId,
          [...issues],
        ]),
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}

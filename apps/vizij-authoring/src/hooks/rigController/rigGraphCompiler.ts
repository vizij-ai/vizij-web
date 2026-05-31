import {
  buildMachineReport,
  type BindingMap,
  type BuildGraphResult,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import {
  buildAuthoringRigGraphArtifacts,
  type PipelineConfigByInputId,
  type PoseConfigSnapshot,
  type VizijPipelineMetadataV1,
} from "@vizij/studio-support";
import type {
  AnimatableComponent as AnimComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import type { PersistedGraphInsight } from "../../rig/persistence";
import {
  resolveRuntimeGraphSpec,
  type RuntimeGraphSpec,
} from "../runtimeGraphSpec";

export type { PipelineConfigByInputId, PoseConfigSnapshot };

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
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
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
  return buildAuthoringRigGraphArtifacts({
    faceId,
    animatablesForExport: animatables,
    animatableComponents: components,
    bindings,
    inputBindings,
    standardInputsById: inputsById,
    inputMetadata,
    pipelineConfigByInputId,
    pipelineMetadataV1,
    poseConfigForCompose: poseConfig,
  }).graphResult;
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

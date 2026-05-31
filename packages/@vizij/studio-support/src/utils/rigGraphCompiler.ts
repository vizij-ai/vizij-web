import {
  buildMachineReport,
  type BindingMap,
  type BuildGraphResult,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { buildAuthoringRigGraphArtifacts } from "./bundleAssembly";
import type {
  PipelineConfigByInputId,
  PoseConfigSnapshot,
} from "./pipelineMetadata";
import type { VizijPipelineMetadataV1 } from "./standardInputRemap";

export type { PipelineConfigByInputId, PoseConfigSnapshot };

export type RigGraphInputMetadata = Map<
  string,
  { source?: "auto" | "custom" | "preset"; root?: string }
>;

export interface RigGraphCompileInputs {
  faceId: string | null;
  animatables: Record<string, AnimatableValue>;
  components: AnimatableComponent[];
  bindings: BindingMap;
  inputsById: Map<string, StandardRigInput>;
  inputBindings: InputBindingMap;
  inputMetadata: RigGraphInputMetadata;
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

export interface AuthoringGraphInsightSnapshot {
  summary: {
    faceId: string;
    inputs: string[];
    outputs: string[];
    bindings: number;
  };
  issues: {
    fatal: string[];
    byTarget: Record<string, string[]>;
  };
  generatedAt: string;
}

export function createGraphInsightSnapshot(
  result: BuildGraphResult,
): AuthoringGraphInsightSnapshot {
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

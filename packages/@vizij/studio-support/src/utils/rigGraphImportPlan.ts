import type {
  InputBindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { World } from "@vizij/render";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { buildAutoRigInputBlueprints } from "./autoRigInputs";
import type { AutoRigInputBlueprintMetadata } from "./autoRigInputs";
import {
  canonicalizeImportedPipelineMetadataV1,
  deriveLockedInspectorTargetsFromPipeline,
  type PipelineConfigByInputId,
  type PoseConfigSnapshot,
} from "./pipelineMetadata";
import {
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineMetadataV1,
} from "./graphImport";
import {
  rehydrateRigDataFromGraph,
  type RehydratedRigData,
} from "./rigGraphImport";
import {
  compareImportedRigGraph,
  normalizeRehydratedInputMetadata,
  type ImportedRigGraphComparison,
} from "./rigRoundtripDiagnostics";
import type { VizijPipelineMetadataV1 } from "./standardInputRemap";

export interface RigGraphImportAutoInputState {
  input: StandardRigInput;
  metadata: AutoRigInputBlueprintMetadata;
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
  sourcePath: string;
  sourceId: string | undefined;
}

export interface PrepareRigGraphImportPlanOptions {
  spec: GraphSpec;
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  world: World;
  featureLabelOverrides: Record<string, string>;
  poseConfig?: PoseConfigSnapshot | null;
  normalizeFaceId?: (value: string) => string;
  diffLimit?: number;
}

export interface RigGraphImportPlan {
  rehydrated: RehydratedRigData;
  importedFaceId: string | null;
  resolvedFaceId: string;
  importedPipelineMetadataV1: VizijPipelineMetadataV1 | null;
  importedPipelineConfigByInputId: PipelineConfigByInputId;
  importedLockedInspectorTargetIds: Set<string>;
  nextAutoInputs: Map<string, RigGraphImportAutoInputState>;
  nextCustomInputs: StandardRigInput[];
  nextInputValues: StandardInputValues;
  missingBlueprintPaths: string[];
  comparison: ImportedRigGraphComparison;
}

function defaultNormalizeFaceId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "face";
}

export async function prepareRigGraphImportPlan(
  options: PrepareRigGraphImportPlanOptions,
): Promise<RigGraphImportPlan> {
  const normalizeFaceId = options.normalizeFaceId ?? defaultNormalizeFaceId;
  const blueprint = buildAutoRigInputBlueprints(
    options.world,
    options.animatables,
    options.animatableComponents,
    options.featureLabelOverrides,
  );
  const rehydrated = rehydrateRigDataFromGraph(options.spec, {
    faceId: options.faceId,
    components: options.animatableComponents,
    provisionedPropsRigInputs: blueprint.blueprints.map((entry) => entry.input),
  });
  const importedFaceId =
    rehydrated.sourceFaceId && rehydrated.sourceFaceId.trim().length > 0
      ? normalizeFaceId(rehydrated.sourceFaceId)
      : null;
  const resolvedFaceId = importedFaceId ?? options.faceId ?? "face";
  const importedPipelineMetadataV1 = canonicalizeImportedPipelineMetadataV1({
    faceId: resolvedFaceId,
    standardInputs: rehydrated.standardInputs,
    pipelineMetadataV1: extractVizijPipelineMetadataV1(options.spec),
  });
  const importedPipelineConfigByInputId =
    extractVizijPipelineConfigMapFromMetadata(importedPipelineMetadataV1);
  const importedLockedInspectorTargetIds =
    deriveLockedInspectorTargetsFromPipeline({
      bindings: rehydrated.bindings,
      standardInputs: rehydrated.standardInputs,
      pipelineConfigByInputId: importedPipelineConfigByInputId,
    });

  const inputsByPath = new Map(
    rehydrated.standardInputs.map((input) => [input.path, input]),
  );
  const inputsBySourceId = new Map<string, StandardRigInput>();
  rehydrated.standardInputs.forEach((input) => {
    if (input.sourceId) {
      inputsBySourceId.set(input.sourceId, input);
    }
  });

  const nextAutoInputs = new Map<string, RigGraphImportAutoInputState>();
  const missingBlueprintPaths: string[] = [];
  blueprint.blueprints.forEach((entry) => {
    let input: StandardRigInput | undefined;
    if (entry.sourceId) {
      input = inputsBySourceId.get(entry.sourceId);
    }
    if (!input) {
      input = inputsByPath.get(entry.path);
    }
    if (!input) {
      missingBlueprintPaths.push(entry.path);
      return;
    }
    if (entry.sourceId) {
      inputsBySourceId.delete(entry.sourceId);
    }
    inputsByPath.delete(input.path);
    const resolvedSourceId = input.sourceId ?? entry.sourceId;
    nextAutoInputs.set(entry.path, {
      input,
      metadata: entry.metadata,
      generatedLabel: entry.input.label,
      generatedDefaultValue: entry.input.defaultValue,
      generatedRange: {
        min: entry.input.range.min,
        max: entry.input.range.max,
      },
      sourcePath: entry.path,
      sourceId: resolvedSourceId,
    });
  });

  const nextCustomInputs = Array.from(inputsByPath.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const nextInputValues: StandardInputValues = {};
  rehydrated.standardInputs.forEach((input) => {
    nextInputValues[input.id] = input.defaultValue;
  });
  const inputMetadata = normalizeRehydratedInputMetadata(
    rehydrated.inputMetadata,
  );
  const comparison = await compareImportedRigGraph({
    importedSpec: options.spec,
    faceId: resolvedFaceId,
    animatables: options.animatables,
    animatableComponents: options.animatableComponents,
    bindings: rehydrated.bindings,
    inputBindings: rehydrated.inputBindings as InputBindingMap,
    standardInputs: rehydrated.standardInputs,
    inputMetadata,
    pipelineConfigByInputId: importedPipelineConfigByInputId,
    pipelineMetadataV1: importedPipelineMetadataV1,
    poseConfig: options.poseConfig,
    diffLimit: options.diffLimit ?? 300,
  });

  return {
    rehydrated,
    importedFaceId,
    resolvedFaceId,
    importedPipelineMetadataV1,
    importedPipelineConfigByInputId,
    importedLockedInspectorTargetIds,
    nextAutoInputs,
    nextCustomInputs,
    nextInputValues,
    missingBlueprintPaths,
    comparison,
  };
}

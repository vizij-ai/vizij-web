import {
  type BindingMap,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import {
  type AnimatableComponent,
  type AnimatableValue,
  type RawValue,
} from "@vizij/utils";
import type { World } from "@vizij/render";
import {
  applyRuntimeOverridesToAnimatables,
  buildAuthoringRigGraphArtifacts,
  canonicalizeGraphComparable,
  compareImportedRigGraph,
  countGraphDiffsByCategory,
  diffGraphSpecs,
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineMetadataV1,
  filterBenignGeneratedNodeIdDiffs,
  prepareSpecForImport,
  summarizeGraphEdgeDiffRisk,
  type PoseConfigSnapshot,
  type VizijPipelineConfigMap,
  type VizijPipelineMetadataV1,
} from "@vizij/studio-support";
import type { ManagedStandardInput } from "../types/standardInputs";
import type { GraphDiffCategory, GraphDiffResult } from "../types/discrepancy";
import { buildAutoRigInputBlueprints } from "../rig/autoInputs";
import { rehydrateRigDataFromGraph } from "../rig/importer";

function resolveFaceId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "face";
}

function buildInputMetadataMap(
  managedStandardInputs: readonly ManagedStandardInput[],
): Map<string, { source?: "auto" | "custom" | "preset"; root?: string }> {
  const map = new Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >();
  managedStandardInputs.forEach((entry) => {
    map.set(entry.input.id, {
      source: entry.source,
      root: entry.metadata?.root ?? entry.input.group,
    });
  });
  return map;
}

export interface RigRoundtripAuditOptions {
  faceId: string;
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  animatableComponents: AnimatableComponent[];
  managedStandardInputs: readonly ManagedStandardInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  pipelineMetadataV1: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId: VizijPipelineConfigMap;
  featureLabelOverrides: Record<string, string>;
  poseConfig: PoseConfigSnapshot | null;
  diffLimit?: number;
}

export interface RigRoundtripAuditResult {
  status: "match" | "diff" | "error";
  faceId: string;
  exportedSpec: GraphSpec | null;
  importPreparedSpec: GraphSpec | null;
  rebuiltSpec: GraphSpec | null;
  exportImportDiff: GraphDiffResult;
  exportImportIgnoredGeneratedNodeIdDiffs: number;
  exportImportCategoryCounts: Record<GraphDiffCategory, number>;
  exportImportEdgeDiffSummary: {
    total: number;
    likelyNormalization: number;
    likelySemanticRisk: number;
  };
  diff: GraphDiffResult;
  ignoredGeneratedNodeIdDiffs: number;
  categoryCounts: Record<GraphDiffCategory, number>;
  edgeDiffSummary: {
    total: number;
    likelyNormalization: number;
    likelySemanticRisk: number;
  };
  fatalIssueCount: number;
  issuesByTargetCount: number;
  error?: string;
}

export async function runRigRoundtripAudit(
  options: RigRoundtripAuditOptions,
): Promise<RigRoundtripAuditResult> {
  const {
    world,
    animatables,
    values,
    animatableComponents,
    managedStandardInputs,
    bindings,
    inputBindings,
    pipelineMetadataV1,
    pipelineConfigByInputId,
    featureLabelOverrides,
    poseConfig,
  } = options;
  const faceId = resolveFaceId(options.faceId);
  const limit = Math.max(options.diffLimit ?? 400, 1);
  const emptyDiff: GraphDiffResult = { entries: [], limitReached: false };

  try {
    const animatablesForExport = applyRuntimeOverridesToAnimatables({
      faceId,
      animatables,
      values,
    });
    const standardInputsById = new Map(
      managedStandardInputs.map((entry) => [entry.input.id, entry.input]),
    );
    const inputMetadata = buildInputMetadataMap(managedStandardInputs);

    const exportArtifacts = buildAuthoringRigGraphArtifacts({
      faceId,
      animatablesForExport,
      animatableComponents,
      bindings,
      inputBindings,
      standardInputsById,
      inputMetadata,
      pipelineMetadataV1,
      pipelineConfigByInputId,
      poseConfigForCompose: poseConfig,
    });
    const exportBuild = exportArtifacts.graphResult;
    const exportedSpec = exportArtifacts.spec as GraphSpec;
    const importPreparedSpec = prepareSpecForImport(
      exportedSpec,
      exportArtifacts.irGraph,
    ) as GraphSpec;

    const blueprint = buildAutoRigInputBlueprints(
      world,
      animatablesForExport,
      animatableComponents,
      featureLabelOverrides,
    );
    const rehydrated = rehydrateRigDataFromGraph(importPreparedSpec, {
      faceId,
      animatables: animatablesForExport,
      components: animatableComponents,
      provisionedPropsRigInputs: blueprint.blueprints.map(
        (entry) => entry.input,
      ),
    });
    const importedPipelineMetadataV1 =
      extractVizijPipelineMetadataV1(importPreparedSpec);
    const importedPipelineConfigByInputId =
      extractVizijPipelineConfigMapFromMetadata(importedPipelineMetadataV1);

    const comparison = await compareImportedRigGraph({
      importedSpec: importPreparedSpec,
      faceId,
      animatables: animatablesForExport,
      animatableComponents,
      bindings: rehydrated.bindings,
      inputBindings: rehydrated.inputBindings,
      standardInputs: rehydrated.standardInputs,
      inputMetadata: rehydrated.inputMetadata,
      pipelineConfigByInputId: importedPipelineConfigByInputId,
      pipelineMetadataV1: importedPipelineMetadataV1,
      poseConfig,
      diffLimit: limit,
    });

    const exportedNormalized = await normalizeGraphSpec(exportedSpec);
    const importPreparedNormalized = comparison.importedNormalized;
    const rebuiltNormalized = comparison.rebuiltNormalized;
    const exportedComparable = canonicalizeGraphComparable(exportedNormalized);
    const importPreparedComparable = comparison.importedComparable;
    const exportImportDiffResult = diffGraphSpecs(
      exportedComparable,
      importPreparedComparable,
      { limit },
    );
    const {
      filteredDiff: exportImportFilteredDiff,
      ignoredCount: exportImportIgnoredCount,
    } = filterBenignGeneratedNodeIdDiffs(exportImportDiffResult);
    const hasMainDiffs = comparison.diff.entries.length > 0;
    const hasExportImportDiffs = exportImportFilteredDiff.entries.length > 0;

    return {
      status: !hasMainDiffs && !hasExportImportDiffs ? "match" : "diff",
      faceId,
      exportedSpec: exportedNormalized,
      importPreparedSpec: importPreparedNormalized,
      rebuiltSpec: rebuiltNormalized,
      exportImportDiff: exportImportFilteredDiff,
      exportImportIgnoredGeneratedNodeIdDiffs: exportImportIgnoredCount,
      exportImportCategoryCounts: countGraphDiffsByCategory(
        exportImportFilteredDiff.entries,
      ),
      exportImportEdgeDiffSummary: summarizeGraphEdgeDiffRisk(
        exportImportFilteredDiff.entries,
      ),
      diff: comparison.diff,
      ignoredGeneratedNodeIdDiffs: comparison.ignoredGeneratedNodeIdDiffs,
      categoryCounts: countGraphDiffsByCategory(comparison.diff.entries),
      edgeDiffSummary: summarizeGraphEdgeDiffRisk(comparison.diff.entries),
      fatalIssueCount: exportBuild.issues.fatal.length,
      issuesByTargetCount: Object.keys(exportBuild.issues.byTarget ?? {})
        .length,
    };
  } catch (error) {
    return {
      status: "error",
      faceId,
      exportedSpec: null,
      importPreparedSpec: null,
      rebuiltSpec: null,
      exportImportDiff: emptyDiff,
      exportImportIgnoredGeneratedNodeIdDiffs: 0,
      exportImportCategoryCounts: countGraphDiffsByCategory([]),
      exportImportEdgeDiffSummary: {
        total: 0,
        likelyNormalization: 0,
        likelySemanticRisk: 0,
      },
      diff: emptyDiff,
      ignoredGeneratedNodeIdDiffs: 0,
      categoryCounts: countGraphDiffsByCategory([]),
      edgeDiffSummary: {
        total: 0,
        likelyNormalization: 0,
        likelySemanticRisk: 0,
      },
      fatalIssueCount: 0,
      issuesByTargetCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

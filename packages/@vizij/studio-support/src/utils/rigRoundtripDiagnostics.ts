import {
  buildRigGraphSpec,
  type BindingMap,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import {
  cloneRawValue,
  getLookup,
  type AnimatableComponent,
  type AnimatableValue,
  type RawValue,
  type StandardRigInput,
} from "@vizij/utils";
import type { World } from "../types";
import { buildAuthoringRigGraphArtifacts } from "./bundleAssembly";
import { buildAutoRigInputBlueprints } from "./autoRigInputs";
import {
  buildPoseComposeModeByInputId,
  withPipelineConfigBuildOptions,
  type PipelineConfigByInputId,
  type PoseConfigSnapshot,
} from "./pipelineMetadata";
import {
  canonicalizeGraphComparable,
  diffGraphSpecs,
  filterBenignGeneratedNodeIdDiffs,
  type GraphDiffCategory,
  type GraphDiffEntry,
  type GraphDiffResult,
} from "./graphDiff";
import {
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineMetadataV1,
  prepareSpecForImport,
  withVizijPipelineMetadataV1,
} from "./graphImport";
import { rehydrateRigDataFromGraph } from "./rigGraphImport";
import type {
  VizijPipelineConfigMap,
  VizijPipelineMetadataV1,
} from "./standardInputRemap";

export type NormalizedInputMetadata = {
  source?: "auto" | "custom" | "preset";
  root?: string;
};

export function applyRuntimeOverridesToAnimatables(options: {
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  values: ReadonlyMap<string, RawValue | undefined>;
}): Record<string, AnimatableValue> {
  const { faceId, animatables, values } = options;
  return Object.fromEntries(
    Object.entries(animatables).map(([id, animatable]) => {
      const override = values.get(getLookup(faceId, id));
      if (override === undefined) {
        return [id, animatable];
      }
      return [
        id,
        {
          ...animatable,
          default: cloneRawValue(override),
        } as AnimatableValue,
      ];
    }),
  );
}

export function normalizeRehydratedInputMetadata(
  rehydratedInputMetadata: ReadonlyMap<
    string,
    { source?: string; root?: string }
  >,
): Map<string, NormalizedInputMetadata> {
  const next = new Map<string, NormalizedInputMetadata>();
  rehydratedInputMetadata.forEach((metadata, inputId) => {
    const source =
      metadata.source === "auto" ||
      metadata.source === "custom" ||
      metadata.source === "preset"
        ? metadata.source
        : undefined;
    next.set(inputId, {
      source,
      root: metadata.root,
    });
  });
  return next;
}

export function countGraphDiffsByCategory(
  entries: readonly GraphDiffEntry[],
): Record<GraphDiffCategory, number> {
  return entries.reduce<Record<GraphDiffCategory, number>>(
    (acc, entry) => {
      acc[entry.category] = (acc[entry.category] ?? 0) + 1;
      return acc;
    },
    {
      identifiers: 0,
      inputs: 0,
      bindings: 0,
      expressions: 0,
      values: 0,
      metadata: 0,
      structure: 0,
      other: 0,
    },
  );
}

export function summarizeGraphEdgeDiffRisk(
  entries: readonly GraphDiffEntry[],
): {
  total: number;
  likelyNormalization: number;
  likelySemanticRisk: number;
} {
  const edgeEntries = entries.filter(
    (entry) => entry.context?.entityType === "edge",
  );
  return {
    total: edgeEntries.length,
    likelyNormalization: edgeEntries.filter(
      (entry) => entry.context?.connection?.likelyNormalizationOnly,
    ).length,
    likelySemanticRisk: edgeEntries.filter(
      (entry) => entry.context?.connection?.likelySemanticRisk,
    ).length,
  };
}

export interface ImportedRigGraphComparisonOptions {
  importedSpec: GraphSpec;
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  standardInputs: readonly StandardRigInput[];
  inputMetadata: ReadonlyMap<string, { source?: string; root?: string }>;
  pipelineConfigByInputId?: PipelineConfigByInputId | null;
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
  poseConfig?: PoseConfigSnapshot | null;
  diffLimit?: number;
}

export interface ImportedRigGraphComparison {
  rebuiltGraph: ReturnType<typeof buildRigGraphSpec>;
  rebuiltSpec: GraphSpec;
  importedNormalized: GraphSpec;
  rebuiltNormalized: GraphSpec;
  importedComparable: ReturnType<typeof canonicalizeGraphComparable>;
  rebuiltComparable: ReturnType<typeof canonicalizeGraphComparable>;
  importedSignature: string;
  rebuiltSignature: string;
  diff: GraphDiffResult;
  ignoredGeneratedNodeIdDiffs: number;
  issueCount: number;
  fatalIssueCount: number;
  issuesByTargetCount: number;
  issueEntries: Array<{ targetId: string; issue: string }>;
  composeModeHintCount: number;
}

export interface RigRoundtripManagedStandardInput {
  input: StandardRigInput;
  source?: NormalizedInputMetadata["source"];
  metadata?: { root?: string | null } | null;
}

export interface RigRoundtripAuditOptions {
  faceId: string;
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: ReadonlyMap<string, RawValue | undefined>;
  animatableComponents: AnimatableComponent[];
  managedStandardInputs: readonly RigRoundtripManagedStandardInput[];
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

function resolveFaceId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "face";
}

function buildInputMetadataMap(
  managedStandardInputs: readonly RigRoundtripManagedStandardInput[],
): Map<string, NormalizedInputMetadata> {
  const map = new Map<string, NormalizedInputMetadata>();
  managedStandardInputs.forEach((entry) => {
    map.set(entry.input.id, {
      source: entry.source,
      root: entry.metadata?.root ?? entry.input.group,
    });
  });
  return map;
}

export async function compareImportedRigGraph(
  options: ImportedRigGraphComparisonOptions,
): Promise<ImportedRigGraphComparison> {
  const limit = Math.max(options.diffLimit ?? 300, 1);
  const inputsById = new Map(
    options.standardInputs.map((input) => [input.id, input]),
  );
  const poseComposeModes = buildPoseComposeModeByInputId(
    options.poseConfig ?? null,
  );
  const rebuiltGraph = buildRigGraphSpec(
    withPipelineConfigBuildOptions(
      {
        faceId: options.faceId,
        animatables: options.animatables,
        components: options.animatableComponents,
        bindings: options.bindings,
        inputsById,
        inputBindings: options.inputBindings,
        inputMetadata: normalizeRehydratedInputMetadata(options.inputMetadata),
        inputComposeModesById: poseComposeModes,
      },
      options.pipelineConfigByInputId ?? undefined,
      options.pipelineMetadataV1 ?? null,
    ),
  );
  const rebuiltSpec = withVizijPipelineMetadataV1(
    rebuiltGraph.spec,
    options.pipelineMetadataV1 ?? null,
  ) as GraphSpec;
  const [importedNormalized, rebuiltNormalized] = await Promise.all([
    normalizeGraphSpec(options.importedSpec),
    normalizeGraphSpec(rebuiltSpec),
  ]);
  const importedComparable = canonicalizeGraphComparable(importedNormalized);
  const rebuiltComparable = canonicalizeGraphComparable(rebuiltNormalized);
  const importedSignature = JSON.stringify(importedComparable);
  const rebuiltSignature = JSON.stringify(rebuiltComparable);
  const diffResult =
    importedSignature === rebuiltSignature
      ? { entries: [], limitReached: false }
      : diffGraphSpecs(importedComparable, rebuiltComparable, { limit });
  const { filteredDiff, ignoredCount } =
    filterBenignGeneratedNodeIdDiffs(diffResult);
  const issueEntries = Object.entries(rebuiltGraph.issues.byTarget)
    .flatMap(([targetId, issues]) =>
      issues.map((issue) => ({ targetId, issue })),
    )
    .slice(0, 8);
  const targetIssueCount = Object.values(
    rebuiltGraph.issues.byTarget ?? {},
  ).reduce((count, issues) => count + issues.length, 0);

  return {
    rebuiltGraph,
    rebuiltSpec,
    importedNormalized,
    rebuiltNormalized,
    importedComparable,
    rebuiltComparable,
    importedSignature,
    rebuiltSignature,
    diff: filteredDiff,
    ignoredGeneratedNodeIdDiffs: ignoredCount,
    issueCount: rebuiltGraph.issues.fatal.length + targetIssueCount,
    fatalIssueCount: rebuiltGraph.issues.fatal.length,
    issuesByTargetCount: Object.keys(rebuiltGraph.issues.byTarget ?? {}).length,
    issueEntries,
    composeModeHintCount: Object.keys(poseComposeModes).length,
  };
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

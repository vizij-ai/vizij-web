import {
  buildRigGraphSpec,
  type BindingMap,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph";
import {
  getLookup,
  cloneRawValue,
  type AnimatableComponent,
  type AnimatableValue,
  type RawValue,
} from "@vizij/utils";
import type { World } from "@vizij/render";
import type { ManagedStandardInput } from "../types/standardInputs";
import type {
  GraphDiffCategory,
  GraphDiffEntry,
  GraphDiffResult,
} from "../types/discrepancy";
import { buildAutoRigInputBlueprints } from "../rig/autoInputs";
import { rehydrateRigDataFromGraph } from "../rig/importer";
import {
  buildPoseComposeModeByInputId,
  type PoseConfigSnapshot,
  withPipelineConfigBuildOptions,
} from "../hooks/rigController/rigGraphCompiler";
import type {
  VizijPipelineConfigMap,
  VizijPipelineMetadataV1,
} from "./graphImport";
import {
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineMetadataV1,
  prepareSpecForImport,
  withVizijPipelineMetadataV1,
} from "./graphImport";
import { canonicalizeGraphComparable, diffGraphSpecs } from "./graphDiff";

const GENERATED_NODE_ID_PREFIXES = [
  "join_",
  "out_",
  "const_",
  "input_",
  "derived_default_",
  "reserved_",
];

function isGeneratedNodeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    GENERATED_NODE_ID_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function isNodeIdDiffPath(path: string): boolean {
  return (
    /\.node_id$/i.test(path) ||
    /\.nodeId$/i.test(path) ||
    (/\.id$/i.test(path) && path.includes("nodes["))
  );
}

function isBenignGeneratedNodeIdDiff(entry: GraphDiffEntry): boolean {
  return (
    entry.kind === "mismatch" &&
    isNodeIdDiffPath(entry.path) &&
    isGeneratedNodeId(entry.importedValue) &&
    isGeneratedNodeId(entry.rebuiltValue)
  );
}

function filterBenignGeneratedNodeIdDiffs(diff: GraphDiffResult): {
  filteredDiff: GraphDiffResult;
  ignoredCount: number;
} {
  const filteredEntries = diff.entries.filter(
    (entry) => !isBenignGeneratedNodeIdDiff(entry),
  );
  return {
    filteredDiff: {
      entries: filteredEntries,
      limitReached: diff.limitReached,
    },
    ignoredCount: diff.entries.length - filteredEntries.length,
  };
}

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

function applyRuntimeOverridesToAnimatables(options: {
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
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

function normalizeRehydratedInputMetadata(
  rehydratedInputMetadata: Map<string, { source?: string; root?: string }>,
): Map<string, { source?: "auto" | "custom" | "preset"; root?: string }> {
  const next = new Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >();
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

function countByCategory(
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

function countEdgeRisk(entries: readonly GraphDiffEntry[]) {
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

    const exportBuild = buildRigGraphSpec(
      withPipelineConfigBuildOptions(
        {
          faceId,
          animatables: animatablesForExport,
          components: animatableComponents,
          bindings,
          inputsById: standardInputsById,
          inputBindings,
          inputMetadata,
          inputComposeModesById: buildPoseComposeModeByInputId(poseConfig),
        },
        pipelineConfigByInputId,
        pipelineMetadataV1,
      ),
    );
    const exportedSpec = withVizijPipelineMetadataV1(
      exportBuild.spec,
      pipelineMetadataV1,
    ) as GraphSpec;
    const importPreparedSpec = prepareSpecForImport(
      exportedSpec,
      exportBuild.ir?.graph,
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

    const rebuiltBuild = buildRigGraphSpec(
      withPipelineConfigBuildOptions(
        {
          faceId,
          animatables: animatablesForExport,
          components: animatableComponents,
          bindings: rehydrated.bindings,
          inputsById: new Map(
            rehydrated.standardInputs.map((input) => [input.id, input]),
          ),
          inputBindings: rehydrated.inputBindings,
          inputMetadata: normalizeRehydratedInputMetadata(
            rehydrated.inputMetadata,
          ),
          inputComposeModesById: buildPoseComposeModeByInputId(poseConfig),
        },
        importedPipelineConfigByInputId,
        importedPipelineMetadataV1,
      ),
    );
    const rebuiltSpec = withVizijPipelineMetadataV1(
      rebuiltBuild.spec,
      importedPipelineMetadataV1,
    ) as GraphSpec;

    const [exportedNormalized, importPreparedNormalized, rebuiltNormalized] =
      await Promise.all([
        normalizeGraphSpec(exportedSpec),
        normalizeGraphSpec(importPreparedSpec),
        normalizeGraphSpec(rebuiltSpec),
      ]);
    const exportedComparable = canonicalizeGraphComparable(exportedNormalized);
    const importPreparedComparable = canonicalizeGraphComparable(
      importPreparedNormalized,
    );
    const rebuiltComparable = canonicalizeGraphComparable(rebuiltNormalized);
    const exportImportDiffResult = diffGraphSpecs(
      exportedComparable,
      importPreparedComparable,
      { limit },
    );
    const {
      filteredDiff: exportImportFilteredDiff,
      ignoredCount: exportImportIgnoredCount,
    } = filterBenignGeneratedNodeIdDiffs(exportImportDiffResult);
    const diffResult = diffGraphSpecs(
      importPreparedComparable,
      rebuiltComparable,
      {
        limit,
      },
    );
    const { filteredDiff, ignoredCount } =
      filterBenignGeneratedNodeIdDiffs(diffResult);
    const hasMainDiffs = filteredDiff.entries.length > 0;
    const hasExportImportDiffs = exportImportFilteredDiff.entries.length > 0;

    return {
      status: !hasMainDiffs && !hasExportImportDiffs ? "match" : "diff",
      faceId,
      exportedSpec: exportedNormalized,
      importPreparedSpec: importPreparedNormalized,
      rebuiltSpec: rebuiltNormalized,
      exportImportDiff: exportImportFilteredDiff,
      exportImportIgnoredGeneratedNodeIdDiffs: exportImportIgnoredCount,
      exportImportCategoryCounts: countByCategory(
        exportImportFilteredDiff.entries,
      ),
      exportImportEdgeDiffSummary: countEdgeRisk(
        exportImportFilteredDiff.entries,
      ),
      diff: filteredDiff,
      ignoredGeneratedNodeIdDiffs: ignoredCount,
      categoryCounts: countByCategory(filteredDiff.entries),
      edgeDiffSummary: countEdgeRisk(filteredDiff.entries),
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
      exportImportCategoryCounts: countByCategory([]),
      exportImportEdgeDiffSummary: {
        total: 0,
        likelyNormalization: 0,
        likelySemanticRisk: 0,
      },
      diff: emptyDiff,
      ignoredGeneratedNodeIdDiffs: 0,
      categoryCounts: countByCategory([]),
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

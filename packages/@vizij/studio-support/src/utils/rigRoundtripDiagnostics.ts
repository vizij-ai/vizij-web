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
import { withVizijPipelineMetadataV1 } from "./graphImport";
import type { VizijPipelineMetadataV1 } from "./standardInputRemap";

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

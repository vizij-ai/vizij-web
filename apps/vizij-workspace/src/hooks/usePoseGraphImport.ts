import { useCallback, useState } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  ensureStandardPathInput,
  inferStandardSuggestion,
  readJsonFile,
} from "@vizij/authoring-shared";
import { cloneSerializable } from "../utils/serialization";
import { normalizeGraphPath } from "../utils/graphPaths";
import {
  remapPoseGraphInputs,
  listPoseGraphOutputs,
  updatePoseGraphOutputPath,
} from "../poseRig/graphImport";
import { collectPoseGraphDeltaInputs } from "../poseRig/graphParser";
import { remapPoseGraphInputIds } from "../poseRig/graphTransforms";
import { buildRigInputPath } from "../poseRig/utils";
import type {
  PoseGraphRemapOption,
  PoseGraphRemapRow,
} from "../components/poseRig/PoseGraphRemapWizard";

export interface PoseGraphRemapState {
  spec: GraphSpec;
  autoRows: PoseGraphRemapRow[];
  reviewRows: PoseGraphRemapRow[];
  rigNameHint: string;
}

interface UsePoseGraphImportOptions {
  faceSegment: string;
  standardInputs: StandardRigInput[];
  rigOutputLookup: ReadonlyMap<string, StandardRigInput>;
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>;
  alertDialog: (message: string) => Promise<void> | void;
  applyPoseGraphImport: (
    spec: GraphSpec,
    sourceNameHint: string,
  ) => Promise<void> | void;
}

export interface UsePoseGraphImportResult {
  poseGraphRemap: PoseGraphRemapState | null;
  handleImportPoseGraphFile: (file: File) => Promise<void>;
  handlePoseGraphRemapApply: (rows: PoseGraphRemapRow[]) => Promise<void>;
  handlePoseGraphRemapCancel: () => void;
}

function extractPoseSlug(nodeId: string): string {
  return nodeId.replace(/^out_/, "");
}

export function usePoseGraphImport({
  faceSegment,
  standardInputs,
  rigOutputLookup,
  standardInputsByPath,
  alertDialog,
  applyPoseGraphImport,
}: UsePoseGraphImportOptions): UsePoseGraphImportResult {
  const [poseGraphRemap, setPoseGraphRemap] =
    useState<PoseGraphRemapState | null>(null);

  const handleImportPoseGraphFile = useCallback(
    async (file: File) => {
      try {
        const parsed = await readJsonFile<GraphSpec>(file);
        const workingSpec = cloneSerializable(parsed) as GraphSpec;
        remapPoseGraphInputs(workingSpec, faceSegment);
        let activeInputIds: Set<string> | null = null;
        try {
          activeInputIds = collectPoseGraphDeltaInputs(workingSpec);
        } catch (error) {
          console.warn(
            "[poseRig] Unable to collect pose graph deltas before remap",
            error,
          );
        }
        const outputs = listPoseGraphOutputs(workingSpec);
        const autoRows: PoseGraphRemapRow[] = [];
        const reviewRows: PoseGraphRemapRow[] = [];

        outputs.forEach((output, index) => {
          if (
            activeInputIds &&
            activeInputIds.size > 0 &&
            output.inputId &&
            !activeInputIds.has(output.inputId)
          ) {
            return;
          }
          const poseSlug = extractPoseSlug(output.nodeId);
          const normalizedPath = output.path
            ? normalizeGraphPath(output.path)
            : null;
          const canonicalPath = normalizedPath
            ? normalizeStandardRigInputPath(normalizedPath)
            : null;
          const canonicalInput = canonicalPath
            ? standardInputsByPath.get(canonicalPath)
            : null;
          if (canonicalInput) {
            autoRows.push({
              id: `${output.nodeId}-${index}`,
              nodeId: output.nodeId,
              originalPath: output.path,
              suggestedPath: canonicalInput.path,
              poseSlug,
              status: "auto",
              reason: "Matched existing standard input",
            });
            return;
          }

          const inferred = inferStandardSuggestion(output.path, standardInputs);
          const inferredCanonical = inferred
            ? normalizeStandardRigInputPath(inferred)
            : null;
          const inferredInput = inferredCanonical
            ? standardInputsByPath.get(inferredCanonical)
            : null;
          if (inferredInput) {
            autoRows.push({
              id: `${output.nodeId}-${index}`,
              nodeId: output.nodeId,
              originalPath: output.path,
              suggestedPath: inferredInput.path,
              poseSlug,
              status: "auto",
              reason: "Converted rig path to standard input",
            });
            return;
          }

          const suggestions = rankStandardInputs(
            output.path ?? "",
            poseSlug,
            standardInputs,
          );
          const best = suggestions[0] ?? null;
          reviewRows.push({
            id: `${output.nodeId}-${index}`,
            nodeId: output.nodeId,
            originalPath: output.path,
            suggestedPath: best?.path ?? inferred ?? null,
            poseSlug,
            status: "review",
            needsReview: true,
            reason: output.path
              ? "No standard input match found"
              : "Output path missing",
            options: suggestions,
          });
        });

        if (reviewRows.length > 0 || autoRows.length > 0) {
          setPoseGraphRemap({
            spec: workingSpec,
            autoRows,
            reviewRows,
            rigNameHint: file.name.replace(/\.json$/i, ""),
          });
          return;
        }

        await applyPoseGraphImport(workingSpec, file.name);
      } catch (error) {
        await alertDialog(
          `Failed to import pose graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [
      alertDialog,
      applyPoseGraphImport,
      faceSegment,
      rigOutputLookup,
      standardInputs,
      standardInputsByPath,
    ],
  );

  const handlePoseGraphRemapApply = useCallback(
    async (rows: PoseGraphRemapRow[]) => {
      if (!poseGraphRemap) {
        return;
      }
      const combinedRows = [...poseGraphRemap.autoRows, ...rows].filter(
        (row) => row.suggestedPath,
      );
      const idRemaps: Array<{ fromId: string; toId: string }> = [];
      const assigned = new Map<string, string>();
      combinedRows.forEach((row) => {
        const desired = row.suggestedPath?.trim();
        if (desired) {
          const standardPath = ensureStandardPathInput(desired);
          const normalizedStandardPath =
            normalizeStandardRigInputPath(standardPath);
          const targetInput = standardInputsByPath.get(normalizedStandardPath);
          if (
            targetInput &&
            row.poseSlug &&
            targetInput.id !== row.poseSlug &&
            assigned.get(row.poseSlug) !== targetInput.id
          ) {
            assigned.set(row.poseSlug, targetInput.id);
            idRemaps.push({ fromId: row.poseSlug, toId: targetInput.id });
          }
          const rigPath = buildRigInputPath(faceSegment, standardPath);
          updatePoseGraphOutputPath(poseGraphRemap.spec, row.nodeId, rigPath);
        }
      });
      if (idRemaps.length > 0) {
        remapPoseGraphInputIds(poseGraphRemap.spec, idRemaps);
      }
      await applyPoseGraphImport(
        poseGraphRemap.spec,
        poseGraphRemap.rigNameHint,
      );
      setPoseGraphRemap(null);
    },
    [applyPoseGraphImport, faceSegment, poseGraphRemap, standardInputsByPath],
  );

  const handlePoseGraphRemapCancel = useCallback(() => {
    setPoseGraphRemap(null);
  }, []);

  return {
    poseGraphRemap,
    handleImportPoseGraphFile,
    handlePoseGraphRemapApply,
    handlePoseGraphRemapCancel,
  };
}

function tokenize(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function getPathLeaf(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const normalized = normalizeGraphPath(path);
  if (!normalized) {
    return null;
  }
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? null;
}

function computeSimilarityScore(
  targetTokens: string[],
  candidateTokens: string[],
  targetLeaf: string | null,
  candidateLeaf: string | null,
): number {
  if (!targetTokens.length || !candidateTokens.length) {
    return 0;
  }
  const union = new Set([...targetTokens, ...candidateTokens]);
  if (union.size === 0) {
    return 0;
  }
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  targetTokens.forEach((token) => {
    if (candidateSet.has(token)) {
      overlap += 1;
    }
  });
  const jaccard = overlap / union.size;
  const suffixBonus =
    targetLeaf && candidateLeaf && targetLeaf === candidateLeaf ? 0.3 : 0;
  const lengthPenalty =
    1 / (1 + Math.abs(candidateTokens.length - targetTokens.length));
  const headMatch =
    targetTokens[0] && targetTokens[0] === candidateTokens[0] ? 0.1 : 0;
  return jaccard * 0.7 + suffixBonus + lengthPenalty * 0.1 + headMatch;
}

function rankStandardInputs(
  targetPath: string,
  poseSlug: string | undefined,
  standardInputs: StandardRigInput[],
): PoseGraphRemapOption[] {
  const targetTokens = [...tokenize(targetPath), ...tokenize(poseSlug)].filter(
    Boolean,
  );
  const targetLeaf = getPathLeaf(targetPath) ?? null;
  const ranked = standardInputs
    .map((input) => {
      const candidateTokens = [
        ...tokenize(input.path),
        ...tokenize(input.label),
        ...tokenize(input.id),
      ];
      const candidateLeaf = getPathLeaf(input.path);
      const score = computeSimilarityScore(
        targetTokens,
        candidateTokens,
        targetLeaf,
        candidateLeaf,
      );
      if (score <= 0) {
        return null;
      }
      return {
        path: input.path,
        label: input.label ?? input.path,
        score,
      };
    })
    .filter((entry): entry is PoseGraphRemapOption => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return ranked;
}

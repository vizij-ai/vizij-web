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
import {
  createPoseImportResult,
  type PoseImportResult,
} from "../types/importOutcome";
import type {
  PoseGraphRemapOption,
  PoseGraphRemapRow,
  PoseRemapConfidence,
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
  createMissingStandardInput?: (path: string) => StandardRigInput | null;
  alertDialog: (message: string) => Promise<void> | void;
  applyPoseGraphImport: (
    spec: GraphSpec,
    sourceNameHint: string,
  ) => Promise<PoseImportResult> | PoseImportResult;
}

export interface UsePoseGraphImportResult {
  poseGraphRemap: PoseGraphRemapState | null;
  handleImportPoseGraphFile: (file: File) => Promise<PoseImportResult>;
  handlePoseGraphRemapApply: (
    rows: PoseGraphRemapRow[],
  ) => Promise<PoseImportResult>;
  handlePoseGraphRemapCancel: () => void;
}

function extractPoseSlug(nodeId: string): string {
  return nodeId.replace(/^out_/, "");
}

export function resolvePoseGraphSourceInputId(
  row: Pick<PoseGraphRemapRow, "currentInputId" | "poseSlug">,
): string | null {
  const current = row.currentInputId?.trim();
  if (current) {
    return current;
  }
  const fallback = row.poseSlug?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

export type PoseGraphRemapApplyPlan =
  | { status: "ready"; spec: GraphSpec }
  | { status: "needs_creation"; paths: string[] }
  | { status: "conflict"; message: string };

function compareRemapRows(left: PoseGraphRemapRow, right: PoseGraphRemapRow) {
  const leftLabel = (
    left.poseSlug ??
    left.currentInputId ??
    left.nodeId ??
    left.id
  ).toLowerCase();
  const rightLabel = (
    right.poseSlug ??
    right.currentInputId ??
    right.nodeId ??
    right.id
  ).toLowerCase();
  if (leftLabel !== rightLabel) {
    return leftLabel.localeCompare(rightLabel);
  }
  if (left.nodeId !== right.nodeId) {
    return left.nodeId.localeCompare(right.nodeId);
  }
  return left.id.localeCompare(right.id);
}

export function buildPoseGraphRemapApplyPlan(params: {
  spec: GraphSpec;
  rows: PoseGraphRemapRow[];
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>;
  faceSegment: string;
}): PoseGraphRemapApplyPlan {
  const { spec, rows, standardInputsByPath, faceSegment } = params;
  const combinedRows = rows
    .filter((row) => Boolean(row.suggestedPath?.trim()))
    .sort(compareRemapRows);
  const targetToSourceMap = new Map<string, Set<string>>();
  const targetLabels = new Map<string, string>();
  const idRemaps: Array<{ fromId: string; toId: string }> = [];
  const assigned = new Map<string, string>();
  const outputPathUpdates: Array<{ nodeId: string; path: string }> = [];
  const missingCreateRows: Array<{ rowId: string; path: string }> = [];
  const pathsToCreate = new Set<string>();

  combinedRows.forEach((row) => {
    const desired = row.suggestedPath?.trim();
    if (!desired) {
      return;
    }

    const standardPath = ensureStandardPathInput(desired);
    const normalizedStandardPath = normalizeStandardRigInputPath(standardPath);
    const targetInput = standardInputsByPath.get(normalizedStandardPath);
    const sourceInputId = resolvePoseGraphSourceInputId(row);
    const shouldCreateMissing = Boolean(row.createMissingInput);
    const targetKey = targetInput
      ? targetInput.id
      : `path:${normalizedStandardPath}`;

    targetLabels.set(targetKey, targetInput?.id ?? normalizedStandardPath);
    if (!targetInput && shouldCreateMissing) {
      pathsToCreate.add(normalizedStandardPath);
    }
    if (!targetInput && !shouldCreateMissing) {
      missingCreateRows.push({
        rowId: row.poseSlug ?? row.currentInputId ?? row.nodeId ?? row.id,
        path: normalizedStandardPath,
      });
    }

    if (sourceInputId) {
      const sourceSet = targetToSourceMap.get(targetKey) ?? new Set();
      sourceSet.add(sourceInputId);
      targetToSourceMap.set(targetKey, sourceSet);
    }

    if (
      targetInput &&
      sourceInputId &&
      targetInput.id !== sourceInputId &&
      assigned.get(sourceInputId) !== targetInput.id
    ) {
      assigned.set(sourceInputId, targetInput.id);
      idRemaps.push({ fromId: sourceInputId, toId: targetInput.id });
    }

    outputPathUpdates.push({
      nodeId: row.nodeId,
      path: buildRigInputPath(faceSegment, standardPath),
    });
  });

  if (missingCreateRows.length > 0) {
    const details = missingCreateRows
      .sort(
        (left, right) =>
          left.path.localeCompare(right.path) ||
          left.rowId.localeCompare(right.rowId),
      )
      .map((entry) => `${entry.rowId} -> ${entry.path}`)
      .join("\n");
    return {
      status: "conflict",
      message:
        "Resolve unknown standard inputs before applying remap:\n" +
        `${details}\n` +
        "Enable create-missing for each unknown row or choose an existing standard input.",
    };
  }

  const conflictingTargets = Array.from(targetToSourceMap.entries()).filter(
    ([, sourceSet]) => sourceSet.size > 1,
  );
  if (conflictingTargets.length > 0) {
    const conflictMessage = conflictingTargets
      .sort(([left], [right]) =>
        (targetLabels.get(left) ?? left).localeCompare(
          targetLabels.get(right) ?? right,
        ),
      )
      .map(
        ([targetId, sourceSet]) =>
          `${targetLabels.get(targetId) ?? targetId} <= ${Array.from(sourceSet)
            .sort((left, right) => left.localeCompare(right))
            .join(", ")}`,
      )
      .join("\n");
    return {
      status: "conflict",
      message: `Resolve remap conflicts before applying:\n${conflictMessage}`,
    };
  }

  if (pathsToCreate.size > 0) {
    return {
      status: "needs_creation",
      paths: Array.from(pathsToCreate).sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  const nextSpec = cloneSerializable(spec) as GraphSpec;
  outputPathUpdates
    .slice()
    .sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) ||
        left.path.localeCompare(right.path),
    )
    .forEach(({ nodeId, path }) => {
      updatePoseGraphOutputPath(nextSpec, nodeId, path);
    });
  if (idRemaps.length > 0) {
    remapPoseGraphInputIds(
      nextSpec,
      idRemaps
        .slice()
        .sort(
          (left, right) =>
            left.fromId.localeCompare(right.fromId) ||
            left.toId.localeCompare(right.toId),
        ),
    );
  }

  return { status: "ready", spec: nextSpec };
}

function toConfidence(score: number): PoseRemapConfidence {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.45) {
    return "medium";
  }
  return "low";
}

export function usePoseGraphImport({
  faceSegment,
  standardInputs,
  rigOutputLookup,
  standardInputsByPath,
  createMissingStandardInput,
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
        } catch {
          activeInputIds = null;
        }
        const outputs = listPoseGraphOutputs(workingSpec);
        const autoRows: PoseGraphRemapRow[] = [];
        const reviewRows: PoseGraphRemapRow[] = [];

        outputs.forEach((output, index) => {
          const isDeltaOutput = !(
            activeInputIds &&
            activeInputIds.size > 0 &&
            output.inputId &&
            !activeInputIds.has(output.inputId)
          );
          const poseSlug = extractPoseSlug(output.nodeId);
          const currentInputId = output.inputId?.trim() || poseSlug || null;
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
              isDeltaOutput,
              poseSlug,
              currentInputId,
              status: "auto",
              reason: "Matched existing standard input",
              confidence: "high",
              confidenceScore: 1,
              rationale: ["Exact standard input path match"],
            });
            return;
          }

          const rigMatchedInput = normalizedPath
            ? rigOutputLookup.get(normalizedPath)
            : null;
          if (rigMatchedInput) {
            autoRows.push({
              id: `${output.nodeId}-${index}`,
              nodeId: output.nodeId,
              originalPath: output.path,
              suggestedPath: rigMatchedInput.path,
              isDeltaOutput,
              poseSlug,
              currentInputId,
              status: "auto",
              reason: "Matched existing rig output path",
              confidence: "high",
              confidenceScore: 0.95,
              rationale: ["Exact rig output to standard input match"],
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
              isDeltaOutput,
              poseSlug,
              currentInputId,
              status: "auto",
              reason: "Converted rig path to standard input",
              confidence: "medium",
              confidenceScore: 0.72,
              rationale: [
                "Legacy rig path converted to a known standard input",
              ],
            });
            return;
          }

          const suggestions = rankStandardInputs(
            output.path ?? "",
            poseSlug,
            currentInputId,
            standardInputs,
          );
          const best = suggestions[0] ?? null;
          reviewRows.push({
            id: `${output.nodeId}-${index}`,
            nodeId: output.nodeId,
            originalPath: output.path,
            suggestedPath: best?.path ?? inferred ?? null,
            isDeltaOutput,
            poseSlug,
            currentInputId,
            status: "review",
            needsReview: true,
            reason: output.path
              ? "No standard input match found"
              : "Output path missing",
            options: suggestions,
            confidence: best?.confidence ?? "low",
            confidenceScore: best?.score ?? 0,
            rationale: best?.rationale ?? [
              "No high-confidence mapping detected",
            ],
          });
        });

        if (reviewRows.length > 0 || autoRows.length > 0) {
          setPoseGraphRemap({
            spec: workingSpec,
            autoRows,
            reviewRows,
            rigNameHint: file.name.replace(/\.json$/i, ""),
          });
          return createPoseImportResult(
            "blocked_recoverable",
            "Pose graph import requires remap decisions.",
          );
        }

        return (
          (await applyPoseGraphImport(workingSpec, file.name)) ??
          createPoseImportResult("success")
        );
      } catch (error) {
        await alertDialog(
          `Failed to import pose graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return createPoseImportResult("blocked_fatal");
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
        return createPoseImportResult(
          "blocked_recoverable",
          "Pose graph remap state is not available.",
        );
      }
      const workingStandardInputsByPath = new Map(standardInputsByPath);
      let plan = buildPoseGraphRemapApplyPlan({
        spec: poseGraphRemap.spec,
        rows,
        standardInputsByPath: workingStandardInputsByPath,
        faceSegment,
      });
      if (plan.status === "needs_creation") {
        if (!createMissingStandardInput) {
          const message =
            "Cannot create missing standard inputs in this import flow:\n" +
            plan.paths.join("\n");
          await alertDialog(message);
          return createPoseImportResult("blocked_recoverable", message);
        }

        const createFailures: string[] = [];
        for (const path of plan.paths) {
          if (workingStandardInputsByPath.has(path)) {
            continue;
          }
          const created = createMissingStandardInput(path);
          if (!created) {
            createFailures.push(`${path} (creation failed)`);
            continue;
          }
          const createdPath = normalizeStandardRigInputPath(
            ensureStandardPathInput(created.path),
          );
          workingStandardInputsByPath.set(createdPath, created);
          if (createdPath !== path) {
            createFailures.push(`${path} (created as ${createdPath})`);
          }
        }
        if (createFailures.length > 0) {
          const message =
            "Failed to create required standard inputs:\n" +
            createFailures.join("\n");
          await alertDialog(message);
          return createPoseImportResult("blocked_recoverable", message);
        }

        plan = buildPoseGraphRemapApplyPlan({
          spec: poseGraphRemap.spec,
          rows,
          standardInputsByPath: workingStandardInputsByPath,
          faceSegment,
        });
      }
      if (plan.status === "needs_creation") {
        const message =
          "Missing standard inputs remain unresolved:\n" +
          plan.paths.join("\n");
        await alertDialog(message);
        return createPoseImportResult("blocked_recoverable", message);
      }
      if (plan.status === "conflict") {
        await alertDialog(plan.message);
        return createPoseImportResult("blocked_recoverable", plan.message);
      }
      const outcome =
        (await applyPoseGraphImport(plan.spec, poseGraphRemap.rigNameHint)) ??
        createPoseImportResult("success_with_repair");
      setPoseGraphRemap(null);
      return outcome;
    },
    [
      alertDialog,
      applyPoseGraphImport,
      createMissingStandardInput,
      faceSegment,
      poseGraphRemap,
      standardInputsByPath,
    ],
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
  currentInputId: string | null,
  standardInputs: StandardRigInput[],
): PoseGraphRemapOption[] {
  const targetTokens = [...tokenize(targetPath), ...tokenize(poseSlug)].filter(
    Boolean,
  );
  const targetLeaf = getPathLeaf(targetPath) ?? null;
  const ranked = standardInputs
    .map((input) => {
      const rationale: string[] = [];
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
      let weightedScore = score;
      if (currentInputId && currentInputId === input.id) {
        weightedScore += 0.9;
        rationale.push("Input id matches existing pose output id");
      } else if (
        currentInputId &&
        input.sourceId &&
        currentInputId === input.sourceId
      ) {
        weightedScore += 0.75;
        rationale.push("Source id matches existing pose output id");
      }
      if (targetLeaf && candidateLeaf && targetLeaf === candidateLeaf) {
        weightedScore += 0.25;
        rationale.push("Path leaf matches");
      }
      if (
        targetPath &&
        normalizeGraphPath(targetPath) === normalizeGraphPath(input.path)
      ) {
        weightedScore += 0.4;
        rationale.push("Path matches exactly");
      }
      const normalizedScore = Math.max(0, Math.min(weightedScore, 1));
      if (normalizedScore <= 0.2) {
        return null;
      }
      const confidence = toConfidence(normalizedScore);
      return {
        path: input.path,
        label: input.label ?? input.path,
        score: normalizedScore,
        confidence,
        rationale:
          rationale.length > 0
            ? rationale
            : confidence === "high"
              ? ["High token similarity"]
              : ["Partial token similarity"],
      };
    })
    .filter((entry): entry is PoseGraphRemapOption => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return ranked;
}

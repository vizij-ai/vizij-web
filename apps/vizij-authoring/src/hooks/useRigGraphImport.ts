import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  type BindingMap,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  canonicalizeImportedPipelineMetadataV1,
  compareImportedRigGraph,
  deriveLockedInspectorTargetsFromPipeline,
  diffGraphSpecs,
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineMetadataV1,
  filterBenignGeneratedNodeIdDiffs,
  rewriteGraphFaceNamespace,
  type GraphDiffResult,
  type VizijPipelineMetadataV1,
  type PoseConfigSnapshot,
} from "@vizij/studio-support";
import {
  createStandardRigInputFromPath,
  normalizeStandardRigInputPath,
  type AnimatableComponent as AnimComponent,
  type StandardRigInput,
} from "@vizij/utils";
import type { VizijData, World } from "@vizij/render";
import { buildAutoRigInputBlueprints } from "../rig/autoInputs";
import { rehydrateRigDataFromGraph } from "../rig/importer";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import type { AutoInputState } from "../types/autoInputs";
import type { DiscrepancyResolutionResult } from "../types/discrepancy";
import { sanitizeFaceId } from "../utils/faceId";
import { waitForNextFrame } from "../utils/frame";
import type { FaceLoadPhaseUpdate } from "./useVizijAssetLoader";

interface UseRigGraphImportOptions {
  faceId: string;
  animatables: VizijData["animatables"];
  animatableComponents: AnimComponent[];
  world: World;
  featureLabelOverrides: Record<string, string>;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  updateInputValues: (
    updater: (prev: StandardInputValues) => StandardInputValues,
  ) => void;
  setBindings: Dispatch<SetStateAction<BindingMap>>;
  setInputBindings: Dispatch<SetStateAction<InputBindingMap>>;
  setSelectedStandardInputRoots: Dispatch<SetStateAction<string[]>>;
  setSelectedStandardInputSubgroups: Dispatch<SetStateAction<string[]>>;
  setLockedInspectorTargetIds: Dispatch<SetStateAction<Set<string>>>;
  setPipelineMetadataV1: Dispatch<
    SetStateAction<VizijPipelineMetadataV1 | null>
  >;
  poseConfig: PoseConfigSnapshot | null;
  setFaceId: Dispatch<SetStateAction<string>>;
  skipPersistRef: MutableRefObject<boolean>;
  persistedAutoInputsRef: MutableRefObject<
    Map<string, PersistedAutoStandardInput>
  >;
  lastLoadedFaceIdRef: MutableRefObject<string | null>;
  openDiscrepancyReview: (payload: {
    faceId: string;
    importedFaceId: string | null;
    mismatchReasons: string[];
    diff: GraphDiffResult;
    missingAutoInputs: string[];
  }) => Promise<DiscrepancyResolutionResult>;
  alertDialog: (message: string) => void;
  debugLog: (...args: unknown[]) => void;
  onImportPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
}

export function useRigGraphImport({
  faceId,
  animatables,
  animatableComponents,
  world,
  featureLabelOverrides,
  setAutoInputs,
  setCustomInputs,
  updateInputValues,
  setBindings,
  setInputBindings,
  setSelectedStandardInputRoots,
  setSelectedStandardInputSubgroups,
  setLockedInspectorTargetIds,
  setPipelineMetadataV1,
  poseConfig,
  setFaceId,
  skipPersistRef,
  persistedAutoInputsRef,
  lastLoadedFaceIdRef,
  openDiscrepancyReview,
  alertDialog,
  debugLog,
  pendingFaceRenameRef,
  onImportPhaseChange,
}: UseRigGraphImportOptions & {
  pendingFaceRenameRef: MutableRefObject<string | null>;
}) {
  const pendingReviewRef = useRef<Promise<DiscrepancyResolutionResult> | null>(
    null,
  );
  const lastAcceptedSignatureRef = useRef<string | null>(null);
  // faceRenameRef is passed down so persistence can avoid clearing on rename.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const faceRenameRef = pendingFaceRenameRef;

  return useCallback(
    async (
      spec: GraphSpec,
      options?: {
        skipDiscrepancyCheck?: boolean;
        faceIdHint?: string;
        poseConfigHint?: PoseConfigSnapshot | null;
      },
    ): Promise<{ faceChanged: boolean; importedFaceId: string | null }> => {
      try {
        const poseConfigForRebuild =
          options?.poseConfigHint === undefined
            ? poseConfig
            : options.poseConfigHint;
        const requestedFaceId =
          options?.faceIdHint && options.faceIdHint.trim().length > 0
            ? sanitizeFaceId(options.faceIdHint)
            : null;
        const loadedFaceId = requestedFaceId ?? faceId;
        if (requestedFaceId && requestedFaceId !== faceId) {
          setFaceId(requestedFaceId);
        }
        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          substepId: "rehydrate-rig-data",
          status: "active",
        });
        await waitForNextFrame();
        const blueprint = buildAutoRigInputBlueprints(
          world,
          animatables,
          animatableComponents,
          featureLabelOverrides,
        );
        await waitForNextFrame();
        const rehydrated = rehydrateRigDataFromGraph(spec, {
          faceId: loadedFaceId,
          animatables,
          components: animatableComponents,
          provisionedPropsRigInputs: blueprint.blueprints.map(
            (entry) => entry.input,
          ),
        });
        await waitForNextFrame();
        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          substepId: "rehydrate-rig-data",
          status: "complete",
        });

        const importedFaceIdRaw = rehydrated.sourceFaceId;
        const importedFaceId =
          importedFaceIdRaw && importedFaceIdRaw.trim().length > 0
            ? sanitizeFaceId(importedFaceIdRaw)
            : null;
        const importedPipelineMetadataV1 =
          canonicalizeImportedPipelineMetadataV1({
            faceId: importedFaceId ?? loadedFaceId ?? "face",
            standardInputs: rehydrated.standardInputs,
            pipelineMetadataV1: extractVizijPipelineMetadataV1(spec),
          });
        const importedPipelineConfigByInputId =
          extractVizijPipelineConfigMapFromMetadata(importedPipelineMetadataV1);
        const importedLockedInspectorTargetIds =
          deriveLockedInspectorTargetsFromPipeline({
            bindings: rehydrated.bindings,
            standardInputs: rehydrated.standardInputs,
            pipelineConfigByInputId: importedPipelineConfigByInputId,
          });
        const faceChangedDuringImport =
          !!importedFaceId && importedFaceId !== loadedFaceId;

        const normalizedInputMetadata = new Map<
          string,
          { source?: "auto" | "custom" | "preset"; root?: string }
        >();
        rehydrated.inputMetadata.forEach((metadata, inputId) => {
          const source =
            metadata.source === "auto" ||
            metadata.source === "custom" ||
            metadata.source === "preset"
              ? metadata.source
              : undefined;
          normalizedInputMetadata.set(inputId, {
            source,
            root: metadata.root,
          });
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

        const nextAutoInputs = new Map<string, AutoInputState>();
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

        let nextCustomInputs = Array.from(inputsByPath.values()).sort((a, b) =>
          a.label.localeCompare(b.label),
        );

        if (missingBlueprintPaths.length > 0) {
          console.warn(
            "[vizij-authoring] Missing inputs while importing graph.",
            missingBlueprintPaths,
          );
        }

        const nextInputValues: StandardInputValues = {};
        rehydrated.standardInputs.forEach((input) => {
          nextInputValues[input.id] = input.defaultValue;
        });

        const resolvedFaceId = importedFaceId ?? loadedFaceId ?? "face";
        if (!loadedFaceId && importedFaceId) {
          setFaceId(importedFaceId);
        }
        await waitForNextFrame();

        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          substepId: "compare-signatures",
          status: "active",
        });
        const comparison = await compareImportedRigGraph({
          importedSpec: spec,
          faceId: resolvedFaceId,
          animatables,
          animatableComponents,
          bindings: rehydrated.bindings,
          inputBindings: rehydrated.inputBindings,
          standardInputs: rehydrated.standardInputs,
          inputMetadata: normalizedInputMetadata,
          pipelineConfigByInputId: importedPipelineConfigByInputId,
          pipelineMetadataV1: importedPipelineMetadataV1,
          poseConfig: poseConfigForRebuild,
          diffLimit: 300,
        });
        const {
          importedComparable,
          rebuiltComparable,
          importedSignature,
          rebuiltSignature,
          issueEntries: rebuiltIssueEntries,
          issueCount: rebuiltIssueCount,
          composeModeHintCount,
        } = comparison;
        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          substepId: "compare-signatures",
          status: "complete",
        });
        debugLog("import comparison", {
          importedFaceId,
          loadedFaceId,
          importedSignatureHash: importedSignature.length,
          rebuiltSignatureHash: rebuiltSignature.length,
          missingBlueprintPaths,
          composeModeHintCount,
        });

        if (rehydrated.legacyPropsRigInputPaths.length > 0) {
          const limited = rehydrated.legacyPropsRigInputPaths.slice(0, 8);
          const remaining = Math.max(
            0,
            rehydrated.legacyPropsRigInputPaths.length - limited.length,
          );
          const samplePaths = limited
            .map((path) => {
              const suggestion = path.replace(
                /^\/rig\/element\/?/,
                "/propsrig/",
              );
              return `  ${path} -> ${suggestion}`;
            })
            .join("\n");
          const suffix = remaining > 0 ? `\n  ...and ${remaining} more` : "";
          alertDialog(
            "Legacy props rig namespace detected.\n" +
              `Imported graph contains ${rehydrated.legacyPropsRigInputPaths.length} input path(s) under /rig/element.\n` +
              "Expected low-level generated namespace is /propsrig.\n" +
              "Example remaps:\n" +
              samplePaths +
              suffix,
          );
        }
        const normalizationDiagnostics = rehydrated.normalizationDiagnostics;
        const normalizationCount =
          normalizationDiagnostics.createdPropsRigInputs.length +
          normalizationDiagnostics.inputIdRemaps.length +
          normalizationDiagnostics.targetIdRemaps.length +
          normalizationDiagnostics.animatableRetargets.length;
        if (normalizationCount > 0) {
          onImportPhaseChange?.({
            stepId: "rig-import-normalization",
            substepId: "apply-normalization",
            status: "active",
          });
          // eslint-disable-next-line no-console -- explicit import migration diagnostics
          console.warn("[vizij-authoring] Import normalization applied.", {
            createdPropsRigInputs:
              normalizationDiagnostics.createdPropsRigInputs.length,
            inputIdRemaps: normalizationDiagnostics.inputIdRemaps.length,
            targetIdRemaps: normalizationDiagnostics.targetIdRemaps.length,
            animatableRetargets:
              normalizationDiagnostics.animatableRetargets.length,
          });
          onImportPhaseChange?.({
            stepId: "rig-import-normalization",
            substepId: "apply-normalization",
            status: "complete",
          });
        }
        if (normalizationDiagnostics.animatableFallbacks.length > 0) {
          const limitedFallbacks =
            normalizationDiagnostics.animatableFallbacks.slice(0, 8);
          const remainingFallbacks = Math.max(
            0,
            normalizationDiagnostics.animatableFallbacks.length -
              limitedFallbacks.length,
          );
          const fallbackLines = limitedFallbacks
            .map((fallback) => {
              const suffix =
                fallback.reason === "missing-propsrig-target"
                  ? "missing props rig target"
                  : "missing source input";
              return `  ${fallback.animatableTargetId} (${fallback.slotId}) <- ${fallback.inputId} (${suffix})`;
            })
            .join("\n");
          const fallbackSuffix =
            remainingFallbacks > 0
              ? `\n  ...and ${remainingFallbacks} more`
              : "";
          alertDialog(
            "Import normalization could not safely retarget all direct animatable bindings.\n" +
              `Fallbacks flagged: ${normalizationDiagnostics.animatableFallbacks.length}\n` +
              "Review these unresolved bindings:\n" +
              fallbackLines +
              fallbackSuffix,
          );
        }
        const shouldOpenDiscrepancyWizard =
          !options?.skipDiscrepancyCheck &&
          (importedSignature !== rebuiltSignature ||
            missingBlueprintPaths.length > 0 ||
            rebuiltIssueCount > 0);

        const signatureKey = [
          importedSignature.length,
          rebuiltSignature.length,
          importedFaceId ?? "",
          loadedFaceId ?? "",
        ].join("|");

        if (
          shouldOpenDiscrepancyWizard &&
          signatureKey === lastAcceptedSignatureRef.current
        ) {
          debugLog("skip discrepancy – signature accepted previously", {
            signatureKey,
          });
          return { faceChanged: false, importedFaceId: importedFaceId ?? null };
        }

        let discrepancyResult: DiscrepancyResolutionResult | null = null;

        if (shouldOpenDiscrepancyWizard) {
          onImportPhaseChange?.({
            stepId: "rig-import-normalization",
            status: "active",
          });
          await waitForNextFrame();
          let diffResult = comparison.diff;
          let ignoredGeneratedNodeIdDiffs =
            comparison.ignoredGeneratedNodeIdDiffs;

          let canAutoResolveFaceRename = false;
          if (
            importedFaceId !== null &&
            importedFaceId !== loadedFaceId &&
            missingBlueprintPaths.length === 0
          ) {
            const rewrittenComparable = rewriteGraphFaceNamespace(
              importedComparable,
              importedFaceId,
              loadedFaceId,
            );
            const rewrittenSignature = JSON.stringify(rewrittenComparable);
            const rewrittenDiffResult =
              rewrittenSignature === rebuiltSignature
                ? { entries: [], limitReached: false }
                : diffGraphSpecs(rewrittenComparable, rebuiltComparable, {
                    limit: 300,
                  });
            const rewrittenFiltered =
              filterBenignGeneratedNodeIdDiffs(rewrittenDiffResult);
            diffResult = rewrittenFiltered.filteredDiff;
            ignoredGeneratedNodeIdDiffs += rewrittenFiltered.ignoredCount;
            canAutoResolveFaceRename = diffResult.entries.length === 0;
          }

          debugLog("discrepancy diff summary", {
            initialDiffCount: comparison.diff.entries.length,
            residualDiffCount: diffResult.entries.length,
            ignoredGeneratedNodeIdDiffs,
            canAutoResolveFaceRename,
          });

          if (
            diffResult.entries.length === 0 &&
            missingBlueprintPaths.length === 0
          ) {
            discrepancyResult = {
              accepted: true,
              renameFaceId: canAutoResolveFaceRename
                ? (importedFaceId ?? undefined)
                : undefined,
            };
          }

          if (pendingReviewRef.current) {
            debugLog("discrepancy review already open – awaiting resolution");
            discrepancyResult = await pendingReviewRef.current;
          } else if (!discrepancyResult) {
            const edgeDiffEntries = diffResult.entries.filter(
              (entry) => entry.context?.entityType === "edge",
            );
            const edgeLikelyNormalizationCount = edgeDiffEntries.filter(
              (entry) => entry.context?.connection?.likelyNormalizationOnly,
            ).length;
            const edgeLikelyRiskCount = edgeDiffEntries.filter(
              (entry) => entry.context?.connection?.likelySemanticRisk,
            ).length;
            const mismatchReasons = [
              "Slot aliases, expressions, and defaults are normalised during import.",
              "Identifier sanitisation may regenerate component or input ids.",
              "Auto-generated standard inputs are reconstructed from rig metadata rather than the saved graph structure.",
              "Recent node-graph compiler updates can reorder commutative operands during IR->GraphSpec compilation; edge rows now classify normalization-only versus semantic-risk slot changes.",
            ];
            if (edgeDiffEntries.length > 0) {
              mismatchReasons.push(
                `Edge discrepancy summary: ${edgeDiffEntries.length} edge differences, ${edgeLikelyNormalizationCount} likely normalization-only, ${edgeLikelyRiskCount} potential semantic risks.`,
              );
            }
            if (missingBlueprintPaths.length > 0) {
              mismatchReasons.push(
                `Auto-generated inputs missing from the imported metadata: ${missingBlueprintPaths
                  .map((path) => `"${path}"`)
                  .join(", ")}.`,
              );
            }
            if (normalizationDiagnostics.targetIdRemaps.length > 0) {
              mismatchReasons.push(
                `Target id normalization remaps applied: ${normalizationDiagnostics.targetIdRemaps.length}.`,
              );
            }
            if (normalizationDiagnostics.createdPropsRigInputs.length > 0) {
              mismatchReasons.push(
                `Props rig targets provisioned before rebinding: ${normalizationDiagnostics.createdPropsRigInputs.length}.`,
              );
            }
            if (normalizationDiagnostics.inputIdRemaps.length > 0) {
              mismatchReasons.push(
                `Input id normalization remaps applied: ${normalizationDiagnostics.inputIdRemaps.length}.`,
              );
            }
            if (normalizationDiagnostics.animatableRetargets.length > 0) {
              mismatchReasons.push(
                `Invalid direct animatable bindings retargeted to props rig inputs: ${normalizationDiagnostics.animatableRetargets.length}.`,
              );
            }
            if (normalizationDiagnostics.animatableFallbacks.length > 0) {
              mismatchReasons.push(
                `Unresolved direct animatable bindings explicitly flagged: ${normalizationDiagnostics.animatableFallbacks.length}.`,
              );
            }
            if (rebuiltIssueCount > 0) {
              const preview = rebuiltIssueEntries
                .map((entry) => `${entry.targetId}: ${entry.issue}`)
                .join(" | ");
              mismatchReasons.push(
                `Rebuilt graph still reports ${rebuiltIssueCount} compile/validation issue(s). Sample: ${preview}`,
              );
            }
            pendingReviewRef.current = openDiscrepancyReview({
              faceId: loadedFaceId,
              importedFaceId: importedFaceId ?? null,
              mismatchReasons,
              diff: diffResult,
              missingAutoInputs: [...missingBlueprintPaths],
            });
            discrepancyResult = await pendingReviewRef.current;
            pendingReviewRef.current = null;
          }
          debugLog("discrepancy result", discrepancyResult);

          if (!discrepancyResult?.accepted) {
            onImportPhaseChange?.({
              stepId: "rig-import-normalization",
              status: "error",
            });
            return { faceChanged: false, importedFaceId: null };
          }
        }

        if (
          discrepancyResult?.missingInputChoices &&
          missingBlueprintPaths.length > 0
        ) {
          const placeholderPaths = Object.entries(
            discrepancyResult.missingInputChoices,
          )
            .filter(([, choice]) => choice === "create-placeholder")
            .map(([path]) => path);
          if (placeholderPaths.length > 0) {
            const normalizedExistingPaths = new Set(
              rehydrated.standardInputs.map((input) =>
                normalizeStandardRigInputPath(input.path),
              ),
            );
            const placeholderInputs: StandardRigInput[] = [];
            placeholderPaths.forEach((path) => {
              const normalized = normalizeStandardRigInputPath(path);
              if (normalizedExistingPaths.has(normalized)) {
                return;
              }
              const placeholder = createStandardRigInputFromPath(normalized);
              normalizedExistingPaths.add(normalized);
              rehydrated.standardInputs.push(placeholder);
              nextInputValues[placeholder.id] = placeholder.defaultValue;
              placeholderInputs.push(placeholder);
            });
            if (placeholderInputs.length > 0) {
              nextCustomInputs = [
                ...nextCustomInputs,
                ...placeholderInputs,
              ].sort((a, b) => a.label.localeCompare(b.label));
            }
          }
        }

        if (discrepancyResult) {
          debugLog("discrepancy resolution applied", discrepancyResult);
          if (discrepancyResult.accepted) {
            lastAcceptedSignatureRef.current = signatureKey;
          }
        }

        skipPersistRef.current = true;
        persistedAutoInputsRef.current = new Map();
        setAutoInputs(nextAutoInputs);
        setCustomInputs(nextCustomInputs);
        updateInputValues(() => nextInputValues);
        setBindings(rehydrated.bindings);
        setInputBindings(rehydrated.inputBindings);
        setLockedInspectorTargetIds(importedLockedInspectorTargetIds);
        setPipelineMetadataV1(importedPipelineMetadataV1);
        setSelectedStandardInputRoots([]);
        setSelectedStandardInputSubgroups([]);
        setTimeout(() => {
          skipPersistRef.current = false;
        }, 0);

        const targetFaceId =
          discrepancyResult?.renameFaceId &&
          discrepancyResult.renameFaceId.trim().length > 0
            ? sanitizeFaceId(discrepancyResult.renameFaceId)
            : importedFaceId && importedFaceId !== loadedFaceId
              ? importedFaceId
              : null;
        if (targetFaceId) {
          // mark this as a rename so downstream persistence can avoid clearing state
          pendingFaceRenameRef.current = targetFaceId;
          lastLoadedFaceIdRef.current = targetFaceId;
          setFaceId(targetFaceId);
        }

        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          status: "complete",
        });
        return {
          faceChanged: faceChangedDuringImport || Boolean(targetFaceId),
          importedFaceId: targetFaceId ?? importedFaceId ?? null,
        };
      } catch (error) {
        onImportPhaseChange?.({
          stepId: "rig-import-normalization",
          status: "error",
        });
        alertDialog(
          `Failed to import graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { faceChanged: false, importedFaceId: null };
      }
    },
    [
      faceId,
      animatables,
      animatableComponents,
      world,
      featureLabelOverrides,
      setAutoInputs,
      setCustomInputs,
      updateInputValues,
      setBindings,
      setInputBindings,
      setLockedInspectorTargetIds,
      setPipelineMetadataV1,
      poseConfig,
      setSelectedStandardInputRoots,
      setSelectedStandardInputSubgroups,
      setFaceId,
      openDiscrepancyReview,
      alertDialog,
      debugLog,
      onImportPhaseChange,
    ],
  );
}

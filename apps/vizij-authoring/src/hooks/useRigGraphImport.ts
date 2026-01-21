import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  buildRigGraphSpec,
  type BindingMap,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
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
import type {
  DiscrepancyResolutionResult,
  GraphDiffResult,
} from "../types/discrepancy";
import { diffGraphSpecs } from "../utils/graphDiff";
import { sanitizeFaceId } from "../utils/faceId";

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
  setFaceId,
  skipPersistRef,
  persistedAutoInputsRef,
  lastLoadedFaceIdRef,
  openDiscrepancyReview,
  alertDialog,
  debugLog,
  pendingFaceRenameRef,
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
      options?: { skipDiscrepancyCheck?: boolean },
    ): Promise<{ faceChanged: boolean; importedFaceId: string | null }> => {
      try {
        const rehydrated = rehydrateRigDataFromGraph(spec, {
          faceId,
          animatables,
          components: animatableComponents,
        });

        const importedFaceIdRaw = rehydrated.sourceFaceId;
        const importedFaceId =
          importedFaceIdRaw && importedFaceIdRaw.trim().length > 0
            ? sanitizeFaceId(importedFaceIdRaw)
            : null;
        const faceChangedDuringImport =
          !!importedFaceId && importedFaceId !== faceId;

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

        const blueprint = buildAutoRigInputBlueprints(
          world,
          animatables,
          animatableComponents,
          featureLabelOverrides,
        );

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

        const resolvedFaceId = importedFaceId ?? faceId ?? "face";
        // If the import carries a faceId and we don't have one, adopt it immediately
        if (!faceId && importedFaceId) {
          setFaceId(importedFaceId);
        }
        const rebuiltSpec = buildRigGraphSpec({
          faceId: resolvedFaceId,
          animatables,
          components: animatableComponents,
          bindings: rehydrated.bindings,
          inputsById: new Map(
            rehydrated.standardInputs.map((input) => [input.id, input]),
          ),
          inputBindings: rehydrated.inputBindings,
          inputMetadata: normalizedInputMetadata,
        }).spec;

        const [importedNormalized, rebuiltNormalized] = await Promise.all([
          normalizeGraphSpec(spec),
          normalizeGraphSpec(rebuiltSpec),
        ]);

        const importedSignature = JSON.stringify(importedNormalized);
        const rebuiltSignature = JSON.stringify(rebuiltNormalized);
        debugLog("import comparison", {
          importedFaceId,
          loadedFaceId: faceId,
          importedSignatureHash: importedSignature.length,
          rebuiltSignatureHash: rebuiltSignature.length,
          missingBlueprintPaths,
        });
        const shouldOpenDiscrepancyWizard =
          !options?.skipDiscrepancyCheck &&
          (importedSignature !== rebuiltSignature ||
            missingBlueprintPaths.length > 0);

        const signatureKey = [
          importedSignature.length,
          rebuiltSignature.length,
          importedFaceId ?? "",
          faceId ?? "",
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
          if (pendingReviewRef.current) {
            debugLog("discrepancy review already open – awaiting resolution");
            discrepancyResult = await pendingReviewRef.current;
          } else {
            const mismatchReasons = [
              "Slot aliases, expressions, and defaults are normalised during import.",
              "Identifier sanitisation may regenerate component or input ids.",
              "Auto-generated standard inputs are reconstructed from rig metadata rather than the saved graph structure.",
            ];
            if (missingBlueprintPaths.length > 0) {
              mismatchReasons.push(
                `Auto-generated inputs missing from the imported metadata: ${missingBlueprintPaths
                  .map((path) => `"${path}"`)
                  .join(", ")}.`,
              );
            }
            const diffResult =
              importedSignature === rebuiltSignature
                ? { entries: [], limitReached: false }
                : diffGraphSpecs(importedNormalized, rebuiltNormalized, {
                    limit: 300,
                  });

            pendingReviewRef.current = openDiscrepancyReview({
              faceId,
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
        setSelectedStandardInputRoots([]);
        setSelectedStandardInputSubgroups([]);
        setTimeout(() => {
          skipPersistRef.current = false;
        }, 0);

        const targetFaceId =
          discrepancyResult?.renameFaceId &&
          discrepancyResult.renameFaceId.trim().length > 0
            ? sanitizeFaceId(discrepancyResult.renameFaceId)
            : importedFaceId && importedFaceId !== faceId
              ? importedFaceId
              : null;
        if (targetFaceId) {
          // mark this as a rename so downstream persistence can avoid clearing state
          pendingFaceRenameRef.current = targetFaceId;
          lastLoadedFaceIdRef.current = targetFaceId;
          setFaceId(targetFaceId);
        }

        return {
          faceChanged: faceChangedDuringImport || Boolean(targetFaceId),
          importedFaceId: targetFaceId ?? importedFaceId ?? null,
        };
      } catch (error) {
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
      setSelectedStandardInputRoots,
      setSelectedStandardInputSubgroups,
      setFaceId,
      openDiscrepancyReview,
      alertDialog,
      debugLog,
    ],
  );
}

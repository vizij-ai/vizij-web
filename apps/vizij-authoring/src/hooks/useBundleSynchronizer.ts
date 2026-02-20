import { useEffect, useRef, useState } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfigFile } from "../poseRig/types";
import { waitForNextFrame } from "../utils/frame";
import { prepareSpecForImport } from "../utils/graphImport";
import type { BundleGraphWithIr } from "../types/bundle";
import {
  isImportOutcomeSuccess,
  type GraphImportResult,
} from "../types/importOutcome";
import {
  recordRigImportAttempt,
  recordRigNormalizeCall,
} from "../perf/runtimePerfMetrics";
import { useLatestRef } from "./useLatestRef";

export interface ImportGraphSpecOptions {
  skipDiscrepancyCheck?: boolean;
  normalizedSpec?: GraphSpec;
}

interface UseBundleSynchronizerOptions {
  faceId: string | null;
  rootId: string | null;
  loadedBundle: VizijBundleExtension | null;
  standardInputCount: number;
  skipDiscrepancyCheck: boolean;
  retryToken?: number;
  importGraphSpec: (
    spec: GraphSpec,
    options?: ImportGraphSpecOptions,
  ) => Promise<GraphImportResult>;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  onFailure?: (failure: BundleSyncFailure) => void;
  onSuccess?: () => void;
}

export interface BundleSyncFailure {
  phase: "rig" | "pose";
  message: string;
}

const MAX_FACE_ID_WAIT_ATTEMPTS = 30;

/**
 * Synchronises the loaded Vizij bundle with the authoring state by
 * auto-importing rig graphs and pose libraries whenever the source GLB
 * changes. Consolidating the side-effects keeps `App` readable and easier to test.
 */
export function useBundleSynchronizer({
  faceId,
  rootId,
  loadedBundle,
  standardInputCount,
  skipDiscrepancyCheck,
  retryToken = 0,
  importGraphSpec,
  importPoseConfigFromData,
  onFailure,
  onSuccess,
}: UseBundleSynchronizerOptions) {
  const faceIdRef = useLatestRef(faceId);
  const importGraphSpecRef = useLatestRef(importGraphSpec);
  const importPoseConfigFromDataRef = useLatestRef(importPoseConfigFromData);
  const onFailureRef = useLatestRef(onFailure);
  const onSuccessRef = useLatestRef(onSuccess);
  const skipDiscrepancyCheckRef = useLatestRef(skipDiscrepancyCheck);

  const appliedBundleFingerprintRef = useRef<string | null>(null);
  const activeBundleFingerprintRef = useRef<string | null>(null);
  const inFlightFingerprintRef = useRef<string | null>(null);
  const rigImportedRef = useRef(false);
  const poseImportedRef = useRef(false);
  const [rigImportEpoch, setRigImportEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const waitForFaceIdMatch = async (
      targetFaceId: string,
      shouldCancel: () => boolean,
    ) => {
      for (let attempt = 0; attempt < MAX_FACE_ID_WAIT_ATTEMPTS; attempt += 1) {
        if (shouldCancel()) {
          return;
        }
        if (faceIdRef.current === targetFaceId) {
          return;
        }
        await waitForNextFrame();
      }
    };

    const applyBundleState = async () => {
      let fingerprint: string | null = null;
      let rigImportedThisPass = false;
      try {
        if (!rootId || !loadedBundle) {
          appliedBundleFingerprintRef.current = null;
          activeBundleFingerprintRef.current = null;
          inFlightFingerprintRef.current = null;
          rigImportedRef.current = false;
          poseImportedRef.current = false;
          return;
        }

        const fingerprintPayload = {
          version: loadedBundle.version,
          graphs: loadedBundle.graphs ?? [],
          poses: loadedBundle.poses?.config ?? null,
          retryToken,
        };
        fingerprint = JSON.stringify(fingerprintPayload);
        let hasFailure = false;

        if (
          fingerprint &&
          appliedBundleFingerprintRef.current === fingerprint
        ) {
          return;
        }

        if (fingerprint && inFlightFingerprintRef.current === fingerprint) {
          return;
        }

        if (fingerprint && activeBundleFingerprintRef.current !== fingerprint) {
          activeBundleFingerprintRef.current = fingerprint;
          rigImportedRef.current = false;
          poseImportedRef.current = false;
        }
        inFlightFingerprintRef.current = fingerprint;

        const bundleGraphs = loadedBundle.graphs as
          | BundleGraphWithIr[]
          | undefined;
        const rigEntry =
          bundleGraphs?.find(
            (entry) => entry.kind?.toLowerCase?.() === "rig",
          ) ?? bundleGraphs?.[0];

        let importedFaceIdFromRig: string | null = null;

        if (!rigImportedRef.current && rigEntry?.spec) {
          try {
            recordRigImportAttempt();
            const preparedSpec = prepareSpecForImport(
              rigEntry.spec,
              rigEntry.ir,
            );
            const normalizedSpec = await normalizeGraphSpec(preparedSpec);
            recordRigNormalizeCall();
            const result = await importGraphSpecRef.current(normalizedSpec, {
              skipDiscrepancyCheck: skipDiscrepancyCheckRef.current,
              normalizedSpec,
            });
            importedFaceIdFromRig = result.importedFaceId;
            const importedRigSuccessfully = isImportOutcomeSuccess(
              result.status,
            );
            rigImportedRef.current = importedRigSuccessfully;
            rigImportedThisPass = importedRigSuccessfully;
            if (importedRigSuccessfully) {
              setRigImportEpoch((current) => current + 1);
            }
            if (!importedRigSuccessfully) {
              hasFailure = true;
              onFailureRef.current?.({
                phase: "rig",
                message:
                  result.message ??
                  "Bundle rig import was blocked. Review import diagnostics and retry.",
              });
            }
          } catch (error) {
            hasFailure = true;
            const message =
              error instanceof Error ? error.message : String(error);
            onFailureRef.current?.({
              phase: "rig",
              message: `Bundle rig import failed: ${message}`,
            });
            console.warn(
              "[vizij-authoring] Failed to import rig graph from bundle.",
              error,
            );
          }
          if (cancelled) {
            return;
          }
        }

        // Import poses on the next synchronization pass after a successful rig
        // import so pose normalization runs against fresh standard-input state.
        if (rigImportedThisPass && loadedBundle.poses?.config) {
          return;
        }

        if (loadedBundle.poses?.config && !poseImportedRef.current) {
          if (standardInputCount === 0) {
            if (hasFailure && fingerprint) {
              appliedBundleFingerprintRef.current = fingerprint;
            }
            return;
          }
          try {
            if (importedFaceIdFromRig) {
              await waitForFaceIdMatch(importedFaceIdFromRig, () => cancelled);
              if (cancelled) {
                return;
              }
            }
            importPoseConfigFromDataRef.current(
              loadedBundle.poses.config as unknown as PoseRigConfigFile,
            );
            poseImportedRef.current = true;
          } catch (error) {
            hasFailure = true;
            const message =
              error instanceof Error ? error.message : String(error);
            onFailureRef.current?.({
              phase: "pose",
              message: `Bundle pose import failed: ${message}`,
            });
            console.warn(
              "[vizij-authoring] Failed to import pose rig config from bundle.",
              error,
            );
          }
          if (cancelled) {
            return;
          }
        }

        if (!loadedBundle.poses?.config) {
          poseImportedRef.current = true;
        }

        if (fingerprint) {
          appliedBundleFingerprintRef.current = fingerprint;
        }
        if (!hasFailure) {
          onSuccessRef.current?.();
        }
      } finally {
        if (inFlightFingerprintRef.current === fingerprint) {
          inFlightFingerprintRef.current = null;
        }
      }
    };

    void applyBundleState();

    return () => {
      cancelled = true;
    };
  }, [
    faceIdRef,
    loadedBundle,
    rigImportEpoch,
    rootId,
    retryToken,
    standardInputCount,
  ]);
}

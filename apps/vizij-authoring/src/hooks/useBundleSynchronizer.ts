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
  finalizeRuntimeImportPerfSession,
  recordRigImportAttempt,
  recordRigPrepareSpecCall,
  recordRigNormalizeCall,
  startRuntimeImportPerfSession,
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
  importGraphSpecReady?: boolean;
  retryToken?: number;
  importGraphSpec: (
    spec: GraphSpec,
    options?: ImportGraphSpecOptions,
  ) => Promise<GraphImportResult>;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  onPostPoseImport?: () => void | Promise<void>;
  onFailure?: (failure: BundleSyncFailure) => void;
  onSuccess?: () => void;
}

export interface BundleSyncFailure {
  phase: "rig" | "pose";
  message: string;
}

const MAX_FACE_ID_WAIT_ATTEMPTS = 30;
const MAX_RIG_NORMALIZE_CACHE_ENTRIES = 6;

const rigNormalizeCache = new Map<string, GraphSpec>();
const rigNormalizeInFlightCache = new Map<string, Promise<GraphSpec>>();

export function __resetBundleSynchronizerNormalizeCacheForTests() {
  rigNormalizeCache.clear();
  rigNormalizeInFlightCache.clear();
}

function cacheRigNormalizedSpec(cacheKey: string, spec: GraphSpec) {
  if (rigNormalizeCache.has(cacheKey)) {
    rigNormalizeCache.delete(cacheKey);
  }
  rigNormalizeCache.set(cacheKey, spec);
  while (rigNormalizeCache.size > MAX_RIG_NORMALIZE_CACHE_ENTRIES) {
    const oldestKey = rigNormalizeCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    rigNormalizeCache.delete(oldestKey);
  }
}

function getNowMs() {
  if (
    typeof globalThis !== "undefined" &&
    "performance" in globalThis &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function logImportPerfSummary(
  summary: ReturnType<typeof finalizeRuntimeImportPerfSession>,
) {
  if (
    !summary ||
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "test"
  ) {
    return;
  }
  // eslint-disable-next-line no-console -- import performance diagnostics
  console.info("[vizij-authoring] import perf summary", summary);
}

async function prepareAndNormalizeRigSpec(
  cacheKey: string,
  specPayload: unknown,
  irPayload: unknown,
) {
  const cached = rigNormalizeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = rigNormalizeInFlightCache.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const normalizePromise = (async () => {
    const prepareStartMs = getNowMs();
    const preparedSpec = prepareSpecForImport(specPayload, irPayload);
    recordRigPrepareSpecCall(getNowMs() - prepareStartMs);

    const normalizeStartMs = getNowMs();
    const normalizedSpec = await normalizeGraphSpec(preparedSpec);
    recordRigNormalizeCall(getNowMs() - normalizeStartMs);
    cacheRigNormalizedSpec(cacheKey, normalizedSpec);
    return normalizedSpec;
  })();

  rigNormalizeInFlightCache.set(cacheKey, normalizePromise);
  try {
    return await normalizePromise;
  } finally {
    if (rigNormalizeInFlightCache.get(cacheKey) === normalizePromise) {
      rigNormalizeInFlightCache.delete(cacheKey);
    }
  }
}

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
  importGraphSpecReady = true,
  retryToken = 0,
  importGraphSpec,
  importPoseConfigFromData,
  onPostPoseImport,
  onFailure,
  onSuccess,
}: UseBundleSynchronizerOptions) {
  const faceIdRef = useLatestRef(faceId);
  const importGraphSpecRef = useLatestRef(importGraphSpec);
  const importPoseConfigFromDataRef = useLatestRef(importPoseConfigFromData);
  const onPostPoseImportRef = useLatestRef(onPostPoseImport);
  const onFailureRef = useLatestRef(onFailure);
  const onSuccessRef = useLatestRef(onSuccess);
  const skipDiscrepancyCheckRef = useLatestRef(skipDiscrepancyCheck);

  const appliedBundleFingerprintRef = useRef<string | null>(null);
  const activeBundleFingerprintRef = useRef<string | null>(null);
  const inFlightFingerprintRef = useRef<string | null>(null);
  const rigImportedRef = useRef(false);
  const poseImportedRef = useRef(false);
  const pendingImportedFaceIdRef = useRef<string | null>(null);
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
      let poseImportedThisPass = false;
      try {
        if (!rootId || !loadedBundle) {
          finalizeRuntimeImportPerfSession("cancelled", "main");
          appliedBundleFingerprintRef.current = null;
          activeBundleFingerprintRef.current = null;
          inFlightFingerprintRef.current = null;
          rigImportedRef.current = false;
          poseImportedRef.current = false;
          pendingImportedFaceIdRef.current = null;
          return;
        }

        const fingerprintPayload = {
          version: loadedBundle.version,
          graphs: loadedBundle.graphs ?? [],
          poses: loadedBundle.poses?.config ?? null,
          retryToken,
        };
        const rigNormalizeCacheKey = JSON.stringify({
          version: loadedBundle.version,
          graphs: loadedBundle.graphs ?? [],
        });
        fingerprint = JSON.stringify(fingerprintPayload);
        let hasFailure = false;
        if (!importGraphSpecReady) {
          return;
        }

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
          startRuntimeImportPerfSession({
            fingerprint,
            rootId,
            faceScope: "main",
          });
          activeBundleFingerprintRef.current = fingerprint;
          rigImportedRef.current = false;
          poseImportedRef.current = false;
          pendingImportedFaceIdRef.current = null;
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
            const normalizedSpec = await prepareAndNormalizeRigSpec(
              rigNormalizeCacheKey,
              rigEntry.spec,
              rigEntry.ir,
            );
            const result = await importGraphSpecRef.current(normalizedSpec, {
              skipDiscrepancyCheck: skipDiscrepancyCheckRef.current,
              normalizedSpec,
            });
            importedFaceIdFromRig = result.importedFaceId;
            if (importedFaceIdFromRig) {
              pendingImportedFaceIdRef.current = importedFaceIdFromRig;
            }
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
              logImportPerfSummary(
                finalizeRuntimeImportPerfSession("failure", "main"),
              );
            }
            return;
          }
          try {
            const targetFaceId =
              importedFaceIdFromRig ?? pendingImportedFaceIdRef.current;
            if (targetFaceId) {
              await waitForFaceIdMatch(targetFaceId, () => cancelled);
              if (cancelled) {
                return;
              }
            }
            importPoseConfigFromDataRef.current(
              loadedBundle.poses.config as unknown as PoseRigConfigFile,
            );
            poseImportedRef.current = true;
            poseImportedThisPass = true;
            pendingImportedFaceIdRef.current = null;
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

        if (
          poseImportedThisPass &&
          !hasFailure &&
          onPostPoseImportRef.current
        ) {
          try {
            await onPostPoseImportRef.current?.();
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error);
            console.warn(
              "[vizij-authoring] Post-pose-import nudge failed.",
              detail,
            );
          }
        }

        if (!loadedBundle.poses?.config) {
          poseImportedRef.current = true;
        }

        if (fingerprint) {
          appliedBundleFingerprintRef.current = fingerprint;
        }
        if (hasFailure) {
          logImportPerfSummary(
            finalizeRuntimeImportPerfSession("failure", "main"),
          );
        } else {
          logImportPerfSummary(
            finalizeRuntimeImportPerfSession("success", "main"),
          );
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
    importGraphSpecReady,
    loadedBundle,
    rigImportEpoch,
    rootId,
    retryToken,
    standardInputCount,
  ]);
}

import { useEffect, useRef } from "react";
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
import { useLatestRef } from "./useLatestRef";

export interface ImportGraphSpecOptions {
  skipDiscrepancyCheck?: boolean;
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
  const appliedBundleFingerprintRef = useRef<string | null>(null);
  const rigImportedRef = useRef(false);

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
      if (!rootId || !loadedBundle) {
        appliedBundleFingerprintRef.current = null;
        rigImportedRef.current = false;
        return;
      }

      const fingerprintPayload = {
        version: loadedBundle.version,
        graphs: loadedBundle.graphs ?? [],
        poses: loadedBundle.poses?.config ?? null,
        retryToken,
      };
      const fingerprint = JSON.stringify(fingerprintPayload);
      let hasFailure = false;

      if (fingerprint && appliedBundleFingerprintRef.current === fingerprint) {
        return;
      }

      if (fingerprint && appliedBundleFingerprintRef.current !== fingerprint) {
        rigImportedRef.current = false;
      }

      const bundleGraphs = loadedBundle.graphs as
        | BundleGraphWithIr[]
        | undefined;
      const rigEntry =
        bundleGraphs?.find((entry) => entry.kind?.toLowerCase?.() === "rig") ??
        bundleGraphs?.[0];

      let importedFaceIdFromRig: string | null = null;

      if (!rigImportedRef.current && rigEntry?.spec) {
        try {
          const preparedSpec = prepareSpecForImport(rigEntry.spec, rigEntry.ir);
          const normalisedSpec = await normalizeGraphSpec(preparedSpec);
          const result = await importGraphSpec(normalisedSpec, {
            skipDiscrepancyCheck,
          });
          importedFaceIdFromRig = result.importedFaceId;
          const importedRigSuccessfully = isImportOutcomeSuccess(result.status);
          rigImportedRef.current = importedRigSuccessfully;
          if (!importedRigSuccessfully) {
            hasFailure = true;
            onFailure?.({
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
          onFailure?.({
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

      if (standardInputCount === 0) {
        return;
      }

      if (loadedBundle.poses?.config) {
        try {
          if (importedFaceIdFromRig) {
            await waitForFaceIdMatch(importedFaceIdFromRig, () => cancelled);
            if (cancelled) {
              return;
            }
          }
          importPoseConfigFromData(
            loadedBundle.poses.config as unknown as PoseRigConfigFile,
          );
        } catch (error) {
          hasFailure = true;
          const message =
            error instanceof Error ? error.message : String(error);
          onFailure?.({
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

      if (fingerprint) {
        appliedBundleFingerprintRef.current = fingerprint;
      }
      if (!hasFailure) {
        onSuccess?.();
      }
    };

    void applyBundleState();

    return () => {
      cancelled = true;
    };
  }, [
    faceIdRef,
    importGraphSpec,
    importPoseConfigFromData,
    loadedBundle,
    rootId,
    retryToken,
    skipDiscrepancyCheck,
    standardInputCount,
    onFailure,
    onSuccess,
  ]);
}

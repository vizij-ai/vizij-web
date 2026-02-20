import { useCallback, useState } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfigFile } from "../poseRig/types";
import type { GraphImportResult } from "../types/importOutcome";
import {
  useBundleSynchronizer,
  type BundleSyncFailure,
  type ImportGraphSpecOptions,
} from "./useBundleSynchronizer";

interface UseBundleSyncStateOptions {
  faceId: string | null;
  rootId: string | null;
  loadedBundle: VizijBundleExtension | null;
  standardInputCount: number;
  skipDiscrepancyCheck: boolean;
  importGraphSpecReady?: boolean;
  importGraphSpec: (
    spec: GraphSpec,
    options?: ImportGraphSpecOptions,
  ) => Promise<GraphImportResult>;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
}

/**
 * Owns bundle-sync failure + retry state while delegating sync execution to
 * `useBundleSynchronizer`. This keeps app-level wiring declarative.
 */
export function useBundleSyncState({
  faceId,
  rootId,
  loadedBundle,
  standardInputCount,
  skipDiscrepancyCheck,
  importGraphSpecReady = true,
  importGraphSpec,
  importPoseConfigFromData,
}: UseBundleSyncStateOptions) {
  const [bundleSyncFailure, setBundleSyncFailure] =
    useState<BundleSyncFailure | null>(null);
  const [bundleSyncRetryToken, setBundleSyncRetryToken] = useState(0);

  const clearBundleSyncFailure = useCallback(() => {
    setBundleSyncFailure(null);
  }, []);

  const retryBundleSync = useCallback(() => {
    setBundleSyncFailure(null);
    setBundleSyncRetryToken((current) => current + 1);
  }, []);

  const resetBundleSyncState = useCallback(() => {
    setBundleSyncFailure(null);
    setBundleSyncRetryToken(0);
  }, []);

  useBundleSynchronizer({
    faceId,
    rootId,
    loadedBundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpecReady,
    retryToken: bundleSyncRetryToken,
    importGraphSpec,
    importPoseConfigFromData,
    onFailure: setBundleSyncFailure,
    onSuccess: clearBundleSyncFailure,
  });

  return {
    bundleSyncFailure,
    clearBundleSyncFailure,
    retryBundleSync,
    resetBundleSyncState,
  };
}

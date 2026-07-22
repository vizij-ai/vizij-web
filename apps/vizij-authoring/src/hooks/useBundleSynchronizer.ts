import { useEffect, useRef } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph";
import type { PoseRigConfigFile } from "../poseRig/types";
import type { AnimationClipIR } from "../types/animationClipIr";
import {
  bundleAnimationEntryToClipIr,
  findAuthoredTimelineBundleAnimation,
} from "../utils/animationClipCompiler";
import { waitForNextFrame } from "../utils/frame";
import { sanitizeFaceId } from "../utils/faceId";
import { extractGraphFaceId, prepareSpecForImport } from "../utils/graphImport";
import type { BundleGraphWithIr } from "../types/bundle";
import { useLatestRef } from "./useLatestRef";
import type { FaceLoadPhaseUpdate } from "./useVizijAssetLoader";

export interface ImportGraphSpecOptions {
  skipDiscrepancyCheck?: boolean;
  faceIdHint?: string;
  poseConfigHint?: PoseRigConfigFile | null;
}

interface UseBundleSynchronizerOptions {
  faceId: string | null;
  rootId: string | null;
  loadedBundle: VizijBundleExtension | null;
  standardInputCount: number;
  skipDiscrepancyCheck: boolean;
  importGraphSpec: (
    spec: GraphSpec,
    options?: ImportGraphSpecOptions,
  ) => Promise<{
    faceChanged: boolean;
    importedFaceId: string | null;
  } | void>;
  canImportRigGraph?: boolean;
  adoptFaceId?: (nextFaceId: string) => void;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  resetPoseState?: () => void;
  onPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
}

const MAX_FACE_ID_WAIT_ATTEMPTS = 30;

function asPoseRigConfigFile(value: unknown): PoseRigConfigFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<PoseRigConfigFile>;
  if (candidate.version !== 1 || !Array.isArray(candidate.poses)) {
    return null;
  }
  return candidate as PoseRigConfigFile;
}

function logBundleSyncDebug(
  event: string,
  payload?: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console -- local import/export smoke-test diagnostics
  console.log("[bundle-sync]", { event, ...(payload ?? {}) });
}

function stableJsonFingerprint(value: unknown): string | null {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, currentValue) => {
      if (currentValue === null || typeof currentValue !== "object") {
        return currentValue;
      }
      if (seen.has(currentValue)) {
        return "[Circular]";
      }
      seen.add(currentValue);
      if (Array.isArray(currentValue)) {
        return currentValue;
      }
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(currentValue).sort()) {
        sorted[key] = (currentValue as Record<string, unknown>)[key];
      }
      return sorted;
    });
  } catch {
    return null;
  }
}

interface TimelineHydrationActions {
  importClipIr: (clip: AnimationClipIR) => void;
  reset: () => void;
}

export function hydrateAuthoredTimelineFromBundleAnimations(
  animations: VizijBundleExtension["animations"] | null | undefined,
  actions: TimelineHydrationActions,
): boolean {
  if (!Array.isArray(animations) || animations.length === 0) {
    actions.reset();
    return false;
  }

  const authoredEntry = findAuthoredTimelineBundleAnimation(animations);
  if (!authoredEntry) {
    actions.reset();
    return false;
  }

  const clipIr = bundleAnimationEntryToClipIr(authoredEntry);
  if (!clipIr) {
    actions.reset();
    return false;
  }

  actions.importClipIr(clipIr);
  return true;
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
  importGraphSpec,
  canImportRigGraph,
  adoptFaceId,
  importPoseConfigFromData,
  resetPoseState,
  onPhaseChange,
}: UseBundleSynchronizerOptions) {
  const faceIdRef = useLatestRef(faceId);
  const importGraphSpecRef = useLatestRef(importGraphSpec);
  const importPoseConfigFromDataRef = useLatestRef(importPoseConfigFromData);
  const adoptFaceIdRef = useLatestRef(adoptFaceId);
  const importedRigFingerprintsRef = useRef<Set<string>>(new Set());
  const importedPoseFingerprintsRef = useRef<Set<string>>(new Set());
  const inflightRigFingerprintsRef = useRef<Set<string>>(new Set());
  const inflightPoseFingerprintsRef = useRef<Set<string>>(new Set());
  const poseResetKeysRef = useRef<Set<string>>(new Set());
  const objectIdentityMapRef = useRef<WeakMap<object, number>>(new WeakMap());
  const nextObjectIdentityRef = useRef(1);
  const importedFaceIdByFingerprintRef = useRef<Map<string, string | null>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    const emitPhase = (update: FaceLoadPhaseUpdate) => {
      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      onPhaseChange?.({
        ...update,
        operationId,
      });
    };

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
      if (!rootId) {
        importedRigFingerprintsRef.current.clear();
        importedPoseFingerprintsRef.current.clear();
        inflightRigFingerprintsRef.current.clear();
        inflightPoseFingerprintsRef.current.clear();
        poseResetKeysRef.current.clear();
        importedFaceIdByFingerprintRef.current.clear();
        return;
      }

      if (!loadedBundle) {
        importedRigFingerprintsRef.current.clear();
        importedPoseFingerprintsRef.current.clear();
        inflightRigFingerprintsRef.current.clear();
        inflightPoseFingerprintsRef.current.clear();
        const poseResetKey = `no-bundle::${rootId}`;
        if (resetPoseState && !poseResetKeysRef.current.has(poseResetKey)) {
          poseResetKeysRef.current.add(poseResetKey);
          logBundleSyncDebug("pose-reset", {
            reason: "no-loaded-bundle",
            rootId,
            poseResetKey,
          });
          resetPoseState();
        }
        importedFaceIdByFingerprintRef.current.clear();

        emitPhase({
          stepId: "bundle-sync",
          status: "complete",
          substepId: "normalize-rig-graph",
        });
        emitPhase({
          stepId: "bundle-sync",
          status: "complete",
          substepId: "import-rig-graph",
        });
        emitPhase({
          stepId: "bundle-sync",
          status: "complete",
          substepId: "import-pose-config",
        });
        emitPhase({
          stepId: "bundle-sync",
          status: "complete",
        });
        return;
      }

      await waitForNextFrame();

      const bundleGraphs = loadedBundle.graphs as
        | BundleGraphWithIr[]
        | undefined;
      const rigEntry =
        bundleGraphs?.find((entry) => entry.kind?.toLowerCase?.() === "rig") ??
        bundleGraphs?.[0];
      const getObjectIdentity = (value: unknown): string => {
        if (value === null || value === undefined) {
          return "null";
        }
        const valueType = typeof value;
        if (valueType !== "object" && valueType !== "function") {
          return `${valueType}:${String(value)}`;
        }
        const objectValue = value as object;
        const cached = objectIdentityMapRef.current.get(objectValue);
        if (typeof cached === "number") {
          return `ref:${cached}`;
        }
        const nextId = nextObjectIdentityRef.current;
        nextObjectIdentityRef.current += 1;
        objectIdentityMapRef.current.set(objectValue, nextId);
        return `ref:${nextId}`;
      };
      const graphsSignature = Array.isArray(bundleGraphs)
        ? bundleGraphs
            .map((entry, index) =>
              [
                String(index),
                entry.kind ?? "",
                getObjectIdentity(entry.spec),
                getObjectIdentity(entry.ir),
              ].join(":"),
            )
            .join("|")
        : "none";
      const poseConfigSignature = getObjectIdentity(loadedBundle.poses?.config);
      const animationsSignature =
        loadedBundle.animations === undefined
          ? "__none__"
          : (stableJsonFingerprint(loadedBundle.animations) ??
            getObjectIdentity(loadedBundle.animations));
      const fingerprint = [
        rootId,
        loadedBundle.version ?? "",
        graphsSignature,
        poseConfigSignature,
        animationsSignature,
      ].join("::");

      emitPhase({
        stepId: "bundle-sync",
        status: "active",
      });

      let importedFaceIdFromRig =
        importedFaceIdByFingerprintRef.current.get(fingerprint) ?? null;
      const rigAlreadyImported =
        importedRigFingerprintsRef.current.has(fingerprint);
      const rigInFlight = inflightRigFingerprintsRef.current.has(fingerprint);
      if (!canImportRigGraph) {
        logBundleSyncDebug("rig-import:deferred", {
          reason: "runtime-not-ready",
          rootId,
          fingerprint,
        });
        return;
      }

      if (!rigAlreadyImported && !rigInFlight && rigEntry?.spec) {
        inflightRigFingerprintsRef.current.add(fingerprint);
        try {
          const rigFaceId = extractGraphFaceId(rigEntry.spec);
          const normalizedRigFaceId =
            rigFaceId && rigFaceId.trim().length > 0
              ? sanitizeFaceId(rigFaceId)
              : null;
          if (
            normalizedRigFaceId &&
            faceIdRef.current !== normalizedRigFaceId &&
            adoptFaceIdRef.current
          ) {
            logBundleSyncDebug("rig-import:adopt-face-id:start", {
              currentFaceId: faceIdRef.current,
              nextFaceId: normalizedRigFaceId,
            });
            adoptFaceIdRef.current(normalizedRigFaceId);
            await waitForFaceIdMatch(normalizedRigFaceId, () => cancelled);
            if (cancelled) {
              return;
            }
            logBundleSyncDebug("rig-import:adopt-face-id:complete", {
              currentFaceId: faceIdRef.current,
              nextFaceId: normalizedRigFaceId,
              matched: faceIdRef.current === normalizedRigFaceId,
            });
          }

          emitPhase({
            stepId: "bundle-sync",
            status: "active",
            substepId: "normalize-rig-graph",
          });
          await waitForNextFrame();
          const preparedSpec = prepareSpecForImport(rigEntry.spec, rigEntry.ir);
          const normalisedSpec = await normalizeGraphSpec(preparedSpec);
          await waitForNextFrame();
          emitPhase({
            stepId: "bundle-sync",
            status: "complete",
            substepId: "normalize-rig-graph",
          });
          emitPhase({
            stepId: "bundle-sync",
            status: "active",
            substepId: "import-rig-graph",
          });
          const result = await importGraphSpecRef.current(normalisedSpec, {
            skipDiscrepancyCheck,
            faceIdHint: normalizedRigFaceId ?? undefined,
            poseConfigHint: asPoseRigConfigFile(loadedBundle.poses?.config),
          });
          importedFaceIdFromRig = result?.importedFaceId ?? null;
          importedRigFingerprintsRef.current.add(fingerprint);
          importedFaceIdByFingerprintRef.current.set(
            fingerprint,
            importedFaceIdFromRig,
          );
          emitPhase({
            stepId: "bundle-sync",
            status: "complete",
            substepId: "import-rig-graph",
          });
        } catch (error) {
          emitPhase({
            stepId: "bundle-sync",
            status: "error",
            substepId: "import-rig-graph",
          });
          console.warn(
            "[vizij-authoring] Failed to import rig graph from bundle.",
            error,
          );
        } finally {
          inflightRigFingerprintsRef.current.delete(fingerprint);
        }
        if (cancelled) {
          return;
        }
      }

      if (rigInFlight && !rigAlreadyImported) {
        return;
      }

      const rigComplete =
        !rigEntry || importedRigFingerprintsRef.current.has(fingerprint);
      const poseResetKey = `no-pose-config::${fingerprint}`;
      if (!loadedBundle.poses?.config) {
        if (resetPoseState && !poseResetKeysRef.current.has(poseResetKey)) {
          poseResetKeysRef.current.add(poseResetKey);
          logBundleSyncDebug("pose-reset", {
            reason: "bundle-missing-pose-config",
            rootId,
            fingerprint,
            poseResetKey,
          });
          resetPoseState();
        }
      }

      if (standardInputCount === 0) {
        if (rigComplete) {
          emitPhase({
            stepId: "bundle-sync",
            status: "complete",
          });
        }
        return;
      }

      const poseAlreadyImported =
        importedPoseFingerprintsRef.current.has(fingerprint);
      const poseInFlight = inflightPoseFingerprintsRef.current.has(fingerprint);

      if (loadedBundle.poses?.config && !poseAlreadyImported && !poseInFlight) {
        inflightPoseFingerprintsRef.current.add(fingerprint);
        try {
          logBundleSyncDebug("pose-import:start", {
            rootId,
            fingerprint,
            hasPoseConfig: true,
          });
          emitPhase({
            stepId: "bundle-sync",
            status: "active",
            substepId: "import-pose-config",
          });
          if (importedFaceIdFromRig) {
            await waitForFaceIdMatch(importedFaceIdFromRig, () => cancelled);
            if (cancelled) {
              return;
            }
          }
          importPoseConfigFromDataRef.current(
            loadedBundle.poses.config as unknown as PoseRigConfigFile,
          );
          logBundleSyncDebug("pose-import:complete", {
            rootId,
            fingerprint,
          });
          importedPoseFingerprintsRef.current.add(fingerprint);
          emitPhase({
            stepId: "bundle-sync",
            status: "complete",
            substepId: "import-pose-config",
          });
        } catch (error) {
          emitPhase({
            stepId: "bundle-sync",
            status: "error",
            substepId: "import-pose-config",
          });
          console.warn(
            "[vizij-authoring] Failed to import pose rig config from bundle.",
            error,
          );
        } finally {
          inflightPoseFingerprintsRef.current.delete(fingerprint);
        }
        if (cancelled) {
          return;
        }
      }

      const poseComplete =
        !loadedBundle.poses?.config ||
        importedPoseFingerprintsRef.current.has(fingerprint);

      if (rigComplete && poseComplete) {
        emitPhase({
          stepId: "bundle-sync",
          status: "complete",
        });
      }
    };

    void applyBundleState();

    return () => {
      cancelled = true;
    };
  }, [
    faceIdRef,
    importGraphSpecRef,
    importPoseConfigFromDataRef,
    adoptFaceIdRef,
    canImportRigGraph,
    loadedBundle,
    onPhaseChange,
    resetPoseState,
    rootId,
    skipDiscrepancyCheck,
    standardInputCount,
  ]);
}

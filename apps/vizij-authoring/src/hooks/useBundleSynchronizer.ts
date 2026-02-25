import { useEffect, useRef } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfigFile } from "../poseRig/types";
import { waitForNextFrame } from "../utils/frame";
import { prepareSpecForImport } from "../utils/graphImport";
import type { BundleGraphWithIr } from "../types/bundle";
import { useLatestRef } from "./useLatestRef";
import type { FaceLoadPhaseUpdate } from "./useVizijAssetLoader";

export interface ImportGraphSpecOptions {
  skipDiscrepancyCheck?: boolean;
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
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  onPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
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
  importGraphSpec,
  importPoseConfigFromData,
  onPhaseChange,
}: UseBundleSynchronizerOptions) {
  const faceIdRef = useLatestRef(faceId);
  const importedRigFingerprintsRef = useRef<Set<string>>(new Set());
  const importedPoseFingerprintsRef = useRef<Set<string>>(new Set());
  const inflightRigFingerprintsRef = useRef<Set<string>>(new Set());
  const inflightPoseFingerprintsRef = useRef<Set<string>>(new Set());
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
        importedFaceIdByFingerprintRef.current.clear();
        return;
      }

      if (!loadedBundle) {
        importedRigFingerprintsRef.current.clear();
        importedPoseFingerprintsRef.current.clear();
        inflightRigFingerprintsRef.current.clear();
        inflightPoseFingerprintsRef.current.clear();
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
      const fingerprint = [
        rootId,
        loadedBundle.version ?? "",
        graphsSignature,
        poseConfigSignature,
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

      if (!rigAlreadyImported && !rigInFlight && rigEntry?.spec) {
        inflightRigFingerprintsRef.current.add(fingerprint);
        try {
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
          const result = await importGraphSpec(normalisedSpec, {
            skipDiscrepancyCheck,
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
          importPoseConfigFromData(
            loadedBundle.poses.config as unknown as PoseRigConfigFile,
          );
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
    importGraphSpec,
    importPoseConfigFromData,
    loadedBundle,
    onPhaseChange,
    rootId,
    skipDiscrepancyCheck,
    standardInputCount,
  ]);
}

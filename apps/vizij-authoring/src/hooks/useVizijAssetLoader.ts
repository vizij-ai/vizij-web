import { useCallback, useState } from "react";
import type { LoadedVizijAsset, VizijBundleExtension } from "@vizij/render";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { findRootId } from "../utils/world";
import { waitForNextFrame } from "../utils/frame";

type VizijLoader = () => Promise<LoadedVizijAsset>;
export type FaceLoadStepStatus = "pending" | "active" | "complete" | "error";
export interface FaceLoadPhaseUpdate {
  stepId: string;
  status: FaceLoadStepStatus;
  substepId?: string;
  label?: string;
  substepLabel?: string;
}

export interface FaceLoadSubstep {
  id: string;
  label: string;
  status: FaceLoadStepStatus;
  startedAtMs?: number;
  completedAtMs?: number;
}

export interface FaceLoadStep {
  id: string;
  label: string;
  status: FaceLoadStepStatus;
  substeps: FaceLoadSubstep[];
  startedAtMs?: number;
  completedAtMs?: number;
}

function nowMs(): number {
  return Date.now();
}

function transitionTimedStatus<
  T extends {
    status: FaceLoadStepStatus;
    startedAtMs?: number;
    completedAtMs?: number;
  },
>(item: T, nextStatus: FaceLoadStepStatus, timestampMs: number): T {
  if (item.status === nextStatus) {
    return item;
  }

  const next = { ...item, status: nextStatus };
  if (nextStatus === "active") {
    if (typeof next.startedAtMs !== "number") {
      next.startedAtMs = timestampMs;
    }
    next.completedAtMs = undefined;
  }
  if (nextStatus === "complete" || nextStatus === "error") {
    if (typeof next.startedAtMs !== "number") {
      next.startedAtMs = timestampMs;
    }
    next.completedAtMs = timestampMs;
  }

  return next;
}

function createDefaultFaceLoadSteps(): FaceLoadStep[] {
  return [
    {
      id: "select-import-source",
      label: "Select Import Source",
      status: "pending",
      substeps: [
        {
          id: "trigger-import",
          label: "Open import flow",
          status: "pending",
        },
        {
          id: "choose-file",
          label: "Choose face asset",
          status: "pending",
        },
      ],
    },
    {
      id: "load-asset",
      label: "Load Face Asset",
      status: "pending",
      substeps: [
        { id: "read-source", label: "Read source file", status: "pending" },
        { id: "parse-scene", label: "Parse scene graph", status: "pending" },
        {
          id: "extract-bundle",
          label: "Extract bundle + channels",
          status: "pending",
        },
      ],
    },
    {
      id: "validate-root",
      label: "Validate Root",
      status: "pending",
      substeps: [
        { id: "find-root", label: "Find Vizij root node", status: "pending" },
      ],
    },
    {
      id: "reset-state",
      label: "Reset Session State",
      status: "pending",
      substeps: [
        {
          id: "reset-values",
          label: "Clear staged values + selection",
          status: "pending",
        },
      ],
    },
    {
      id: "mount-runtime",
      label: "Mount Runtime World",
      status: "pending",
      substeps: [
        {
          id: "register-world",
          label: "Register world elements",
          status: "pending",
        },
        {
          id: "register-animatables",
          label: "Register animatable channels",
          status: "pending",
        },
      ],
    },
    {
      id: "finalize-load",
      label: "Finalize Face Session",
      status: "pending",
      substeps: [
        {
          id: "publish-root",
          label: "Publish root + source metadata",
          status: "pending",
        },
        {
          id: "publish-bundle",
          label: "Attach extracted bundle",
          status: "pending",
        },
      ],
    },
    {
      id: "bundle-sync",
      label: "Synchronize Bundle State",
      status: "pending",
      substeps: [
        {
          id: "normalize-rig-graph",
          label: "Normalize imported rig graph",
          status: "pending",
        },
        {
          id: "import-rig-graph",
          label: "Import rig graph",
          status: "pending",
        },
        {
          id: "import-pose-config",
          label: "Import pose config",
          status: "pending",
        },
      ],
    },
    {
      id: "rig-import-normalization",
      label: "Rig Import Normalization",
      status: "pending",
      substeps: [
        {
          id: "rehydrate-rig-data",
          label: "Rehydrate rig data from graph",
          status: "pending",
        },
        {
          id: "compare-signatures",
          label: "Compare imported/rebuilt graph signatures",
          status: "pending",
        },
        {
          id: "apply-normalization",
          label: "Apply normalization + remaps",
          status: "pending",
        },
      ],
    },
    {
      id: "pose-graph-bootstrap",
      label: "Pose Graph Bootstrap",
      status: "pending",
      substeps: [
        {
          id: "normalize-pose-graph",
          label: "Normalize pose graph spec",
          status: "pending",
        },
      ],
    },
    {
      id: "runtime-stabilization",
      label: "Runtime Stabilization",
      status: "pending",
      substeps: [
        {
          id: "wait-runtime-input-bridge",
          label: "Wait for runtime input bridge",
          status: "pending",
        },
        {
          id: "settle-recompiles",
          label: "Settle compile/import cycles",
          status: "pending",
        },
      ],
    },
  ];
}

function updateFaceLoadStatus(
  steps: FaceLoadStep[],
  options: {
    stepId: string;
    stepStatus?: FaceLoadStepStatus;
    substepId?: string;
    substepStatus?: FaceLoadStepStatus;
  },
): FaceLoadStep[] {
  const timestampMs = nowMs();
  const { stepId, stepStatus, substepId, substepStatus } = options;
  return steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }

    const nextSubsteps = step.substeps.map((substep) => {
      if (!substepId || substep.id !== substepId || !substepStatus) {
        return substep;
      }
      return transitionTimedStatus(substep, substepStatus, timestampMs);
    });

    const nextStep = {
      ...step,
      substeps: nextSubsteps,
    };

    if (stepStatus) {
      return transitionTimedStatus(nextStep, stepStatus, timestampMs);
    }

    return nextStep;
  });
}

export function useVizijAssetLoader() {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setStoreState = useVizijStoreSetter();

  const [rootId, setRootId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<VizijBundleExtension | null>(null);
  const [faceLoadProgress, setFaceLoadProgress] = useState(0);
  const [faceLoadSteps, setFaceLoadSteps] = useState<FaceLoadStep[]>(
    createDefaultFaceLoadSteps,
  );
  const [isImportFlowActive, setIsImportFlowActive] = useState(false);
  const [faceLoadSourceLabel, setFaceLoadSourceLabel] = useState<string | null>(
    null,
  );
  const [faceLoadSessionStartedAtMs, setFaceLoadSessionStartedAtMs] = useState<
    number | null
  >(null);
  const [faceLoadSessionCompletedAtMs, setFaceLoadSessionCompletedAtMs] =
    useState<number | null>(null);

  const beginImportFlow = useCallback((sourceLabel: string) => {
    setIsImportFlowActive(true);
    setFaceLoadSourceLabel(sourceLabel);
    setFaceLoadSessionStartedAtMs(nowMs());
    setFaceLoadSessionCompletedAtMs(null);
    setFaceLoadProgress(0.02);
    setFaceLoadSteps(() =>
      updateFaceLoadStatus(
        updateFaceLoadStatus(createDefaultFaceLoadSteps(), {
          stepId: "select-import-source",
          stepStatus: "active",
          substepId: "trigger-import",
          substepStatus: "active",
        }),
        {
          stepId: "select-import-source",
          substepId: "trigger-import",
          substepStatus: "complete",
        },
      ),
    );
  }, []);

  const markImportFileSelected = useCallback(() => {
    setFaceLoadProgress((current) => (current < 0.08 ? 0.08 : current));
    setFaceLoadSteps((previous) =>
      updateFaceLoadStatus(
        updateFaceLoadStatus(previous, {
          stepId: "select-import-source",
          substepId: "choose-file",
          substepStatus: "complete",
        }),
        {
          stepId: "select-import-source",
          stepStatus: "complete",
        },
      ),
    );
  }, []);

  const markImportFlowError = useCallback((failedStepId: string) => {
    setIsImportFlowActive(false);
    setFaceLoadSessionCompletedAtMs(nowMs());
    setFaceLoadSteps((previous) =>
      updateFaceLoadStatus(previous, {
        stepId: failedStepId,
        stepStatus: "error",
      }),
    );
  }, []);

  const cancelImportFlow = useCallback(() => {
    setIsImportFlowActive(false);
    setFaceLoadProgress(0);
    setFaceLoadSteps(createDefaultFaceLoadSteps());
    setFaceLoadSourceLabel(null);
    setFaceLoadSessionStartedAtMs(null);
    setFaceLoadSessionCompletedAtMs(null);
  }, []);

  const completeImportFlow = useCallback(() => {
    setIsImportFlowActive(false);
    setFaceLoadProgress(1);
    setFaceLoadSessionCompletedAtMs(nowMs());
  }, []);

  const updateExternalPhase = useCallback((update: FaceLoadPhaseUpdate) => {
    setFaceLoadSteps((previous) => {
      const hasStep = previous.some((step) => step.id === update.stepId);
      const next = hasStep
        ? previous
        : [
            ...previous,
            {
              id: update.stepId,
              label: update.label ?? update.stepId,
              status: "pending" as FaceLoadStepStatus,
              substeps: update.substepId
                ? [
                    {
                      id: update.substepId,
                      label: update.substepLabel ?? update.substepId,
                      status: "pending" as FaceLoadStepStatus,
                    },
                  ]
                : [],
            } satisfies FaceLoadStep,
          ];

      return updateFaceLoadStatus(next, {
        stepId: update.stepId,
        stepStatus: update.status,
        substepId: update.substepId,
        substepStatus: update.substepId ? update.status : undefined,
      });
    });
  }, []);

  const loadVizij = useCallback(
    async (loader: VizijLoader, label: string) => {
      setIsLoading(true);
      setError(null);
      setRootId(null);
      setFaceLoadProgress((current) => (current < 0.1 ? 0.1 : current));
      setFaceLoadSteps((previous) =>
        updateFaceLoadStatus(previous, {
          stepId: "load-asset",
          stepStatus: "active",
          substepId: "read-source",
          substepStatus: "active",
        }),
      );

      let activeStepId = "load-asset";
      try {
        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(
            updateFaceLoadStatus(previous, {
              stepId: "load-asset",
              substepId: "read-source",
              substepStatus: "complete",
            }),
            {
              stepId: "load-asset",
              substepId: "parse-scene",
              substepStatus: "active",
            },
          ),
        );

        setFaceLoadProgress(0.18);
        await waitForNextFrame();
        const {
          world: worldData,
          animatables,
          bundle: loadedBundle,
        } = await loader();
        await waitForNextFrame();

        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(
            updateFaceLoadStatus(previous, {
              stepId: "load-asset",
              substepId: "parse-scene",
              substepStatus: "complete",
            }),
            {
              stepId: "load-asset",
              substepId: "extract-bundle",
              substepStatus: "complete",
              stepStatus: "complete",
            },
          ),
        );

        activeStepId = "validate-root";
        setFaceLoadProgress(0.4);
        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "validate-root",
            stepStatus: "active",
            substepId: "find-root",
            substepStatus: "active",
          }),
        );

        const nextRootId = findRootId(worldData);
        if (!nextRootId) {
          throw new Error("Unable to find a Vizij root in the provided asset.");
        }
        await waitForNextFrame();

        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "validate-root",
            stepStatus: "complete",
            substepId: "find-root",
            substepStatus: "complete",
          }),
        );

        activeStepId = "reset-state";
        setFaceLoadProgress(0.55);
        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "reset-state",
            stepStatus: "active",
            substepId: "reset-values",
            substepStatus: "active",
          }),
        );

        setStoreState({
          values: new Map(),
          elementSelection: [],
        });
        await waitForNextFrame();

        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "reset-state",
            stepStatus: "complete",
            substepId: "reset-values",
            substepStatus: "complete",
          }),
        );

        activeStepId = "mount-runtime";
        setFaceLoadProgress(0.68);
        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "mount-runtime",
            stepStatus: "active",
            substepId: "register-world",
            substepStatus: "active",
          }),
        );

        addWorldElements(worldData, animatables, true);
        await waitForNextFrame();

        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(
            updateFaceLoadStatus(previous, {
              stepId: "mount-runtime",
              substepId: "register-world",
              substepStatus: "complete",
            }),
            {
              stepId: "mount-runtime",
              stepStatus: "complete",
              substepId: "register-animatables",
              substepStatus: "complete",
            },
          ),
        );

        activeStepId = "finalize-load";
        setFaceLoadProgress(0.82);
        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(previous, {
            stepId: "finalize-load",
            stepStatus: "active",
            substepId: "publish-root",
            substepStatus: "active",
          }),
        );

        setRootId(nextRootId);
        setSourceName(label);
        setBundle(loadedBundle ?? null);
        await waitForNextFrame();

        setFaceLoadSteps((previous) =>
          updateFaceLoadStatus(
            updateFaceLoadStatus(previous, {
              stepId: "finalize-load",
              substepId: "publish-root",
              substepStatus: "complete",
            }),
            {
              stepId: "finalize-load",
              stepStatus: "complete",
              substepId: "publish-bundle",
              substepStatus: "complete",
            },
          ),
        );
        setFaceLoadProgress(0.9);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("demo-vizij-render: failed to load Vizij", err);
        setBundle(null);
        markImportFlowError(activeStepId);
      } finally {
        setIsLoading(false);
      }
    },
    [addWorldElements, markImportFlowError, setStoreState],
  );

  const loadFromFile = useCallback(
    async (file: File, loader: VizijLoader) => {
      await loadVizij(loader, file.name);
    },
    [loadVizij],
  );

  const loadFromUrl = useCallback(
    async (url: string, loader: VizijLoader) => {
      await loadVizij(loader, url);
    },
    [loadVizij],
  );

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setRootId(null);
    setSourceName(null);
    setAssetUrl("");
    setError(null);
    setBundle(null);
    setFaceLoadProgress(0);
    setFaceLoadSteps(createDefaultFaceLoadSteps());
    setIsImportFlowActive(false);
    setFaceLoadSourceLabel(null);
    setFaceLoadSessionStartedAtMs(null);
    setFaceLoadSessionCompletedAtMs(null);
  }, []);

  const updateBundle = useCallback(
    (
      updater:
        | VizijBundleExtension
        | null
        | ((
            previous: VizijBundleExtension | null,
          ) => VizijBundleExtension | null),
    ) => {
      if (typeof updater === "function") {
        setBundle((previous) =>
          (
            updater as (
              value: VizijBundleExtension | null,
            ) => VizijBundleExtension | null
          )(previous),
        );
      } else {
        setBundle(updater);
      }
    },
    [],
  );

  return {
    rootId,
    sourceName,
    assetUrl,
    setAssetUrl,
    isLoading,
    isImportFlowActive,
    faceLoadSourceLabel,
    faceLoadSessionStartedAtMs,
    faceLoadSessionCompletedAtMs,
    faceLoadProgress,
    faceLoadSteps,
    error,
    clearError,
    reset,
    beginImportFlow,
    markImportFileSelected,
    markImportFlowError,
    cancelImportFlow,
    completeImportFlow,
    updateExternalPhase,
    loadVizij,
    loadFromFile,
    loadFromUrl,
    bundle,
    updateBundle,
  };
}

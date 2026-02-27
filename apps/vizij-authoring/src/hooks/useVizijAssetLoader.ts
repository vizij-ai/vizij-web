import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadedVizijAsset, VizijBundleExtension, VizijAnimationClipData } from "@vizij/render";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { findRootId } from "../utils/world";
import { waitForNextFrame } from "../utils/frame";

type VizijLoader = () => Promise<LoadedVizijAsset>;
export type FaceLoadStepStatus = "pending" | "active" | "complete" | "error";
export type FaceLoadMilestoneName =
  | "asset-loaded"
  | "bundle-synced"
  | "graph-ready"
  | "runtime-ready";
export type FaceLoadMilestones = Record<FaceLoadMilestoneName, number | null>;

const FACE_LOAD_MILESTONE_ORDER: FaceLoadMilestoneName[] = [
  "asset-loaded",
  "bundle-synced",
  "graph-ready",
  "runtime-ready",
];
const __DEV__ = process.env.NODE_ENV !== "production";

export interface FaceLoadPhaseUpdate {
  stepId: string;
  status: FaceLoadStepStatus;
  substepId?: string;
  label?: string;
  substepLabel?: string;
  sessionToken?: string | null;
  sequence?: number;
  operationId?: string;
  operationLabel?: string;
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

interface FaceLoadOperationUpdate {
  operationId: string;
  stepId?: string;
  substepId?: string;
  label?: string;
  sessionToken?: string | null;
}

function createDefaultFaceLoadMilestones(): FaceLoadMilestones {
  return {
    "asset-loaded": null,
    "bundle-synced": null,
    "graph-ready": null,
    "runtime-ready": null,
  };
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
        {
          id: "migrate-legacy-bindings",
          label: "Migrate legacy variable bindings",
          status: "pending",
        },
      ],
    },
  ];
}

function createFaceLoadSessionToken(): string {
  return `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFaceLoadStepOrderMap(
  steps: FaceLoadStep[],
): Map<string, number> {
  return new Map(steps.map((step, index) => [step.id, index]));
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
  const setVizij = useVizijStore((state) => state.setVizij);
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const setStoreState = useVizijStoreSetter();

  const [rootId, setRootId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<VizijBundleExtension | null>(null);
  const animations = useVizijStore((state) => state.animations);
  const [exportSceneRoot, setExportSceneRoot] = useState<unknown>(null);
  const [faceLoadProgress, setFaceLoadProgress] = useState(0);
  const [faceLoadSteps, setFaceLoadSteps] = useState<FaceLoadStep[]>(
    createDefaultFaceLoadSteps,
  );
  const [isImportFlowActive, setIsImportFlowActive] = useState(false);
  const [faceLoadSourceLabel, setFaceLoadSourceLabel] = useState<string | null>(
    null,
  );
  const [faceLoadSessionToken, setFaceLoadSessionToken] = useState<
    string | null
  >(null);
  const [faceLoadSessionStartedAtMs, setFaceLoadSessionStartedAtMs] = useState<
    number | null
  >(null);
  const [faceLoadSessionCompletedAtMs, setFaceLoadSessionCompletedAtMs] =
    useState<number | null>(null);
  const [faceLoadMilestones, setFaceLoadMilestones] =
    useState<FaceLoadMilestones>(createDefaultFaceLoadMilestones);
  const [faceLoadInFlightOperationCount, setFaceLoadInFlightOperationCount] =
    useState(0);
  const [faceLoadLastOperationUpdateAtMs, setFaceLoadLastOperationUpdateAtMs] =
    useState<number | null>(null);

  const faceLoadSessionTokenRef = useRef<string | null>(null);
  const faceLoadSessionStartedAtRef = useRef<number | null>(null);
  const faceLoadMilestonesRef = useRef<FaceLoadMilestones>(
    createDefaultFaceLoadMilestones(),
  );
  const previousFaceLoadMilestonesRef = useRef<FaceLoadMilestones>(
    createDefaultFaceLoadMilestones(),
  );
  const faceLoadExternalPhaseSequenceRef = useRef(0);
  const faceLoadExternalPhaseStepOrderRef = useRef<Map<string, number>>(
    createFaceLoadStepOrderMap(createDefaultFaceLoadSteps()),
  );
  const faceLoadOperationsRef = useRef<
    Map<
      string,
      {
        stepId?: string;
        substepId?: string;
        label?: string;
        startedAtMs: number;
      }
    >
  >(new Map());

  const logFaceLoadEvent = useCallback(
    (_event: string, _payload?: Record<string, unknown>) => {
      if (!__DEV__) {
        return;
      }
      // Keep lightweight instrumentation hook for local diagnostics.
      // console.log("[face-load]", {
      //   event,
      //   sessionToken: faceLoadSessionTokenRef.current,
      //   elapsedMs,
      //   ...(payload ?? {}),
      // });
    },
    [],
  );

  const resetExternalPhaseTrackers = useCallback(() => {
    faceLoadExternalPhaseSequenceRef.current = 0;
    faceLoadExternalPhaseStepOrderRef.current = createFaceLoadStepOrderMap(
      createDefaultFaceLoadSteps(),
    );
  }, []);

  const resetFaceLoadMilestones = useCallback(() => {
    const next = createDefaultFaceLoadMilestones();
    faceLoadMilestonesRef.current = next;
    setFaceLoadMilestones(next);
  }, []);

  const clearFaceLoadOperations = useCallback(
    (reason?: string) => {
      const activeCount = faceLoadOperationsRef.current.size;
      if (activeCount > 0) {
        logFaceLoadEvent("ops-cleared", {
          reason: reason ?? "unspecified",
          activeCount,
        });
      }
      faceLoadOperationsRef.current.clear();
      const timestampMs = nowMs();
      setFaceLoadInFlightOperationCount(0);
      setFaceLoadLastOperationUpdateAtMs(timestampMs);
    },
    [logFaceLoadEvent],
  );

  const beginFaceLoadOperation = useCallback(
    ({
      operationId,
      stepId,
      substepId,
      label,
      sessionToken,
    }: FaceLoadOperationUpdate) => {
      const currentSessionToken = faceLoadSessionTokenRef.current;
      if (sessionToken !== undefined && sessionToken !== currentSessionToken) {
        return;
      }
      if (!operationId || faceLoadOperationsRef.current.has(operationId)) {
        return;
      }
      const timestampMs = nowMs();
      faceLoadOperationsRef.current.set(operationId, {
        stepId,
        substepId,
        label,
        startedAtMs: timestampMs,
      });
      setFaceLoadInFlightOperationCount(faceLoadOperationsRef.current.size);
      setFaceLoadLastOperationUpdateAtMs(timestampMs);
      logFaceLoadEvent("op-begin", {
        operationId,
        stepId: stepId ?? null,
        substepId: substepId ?? null,
        label: label ?? null,
      });
    },
    [logFaceLoadEvent],
  );

  const endFaceLoadOperation = useCallback(
    ({
      operationId,
      sessionToken,
      stepId,
      substepId,
      label,
    }: FaceLoadOperationUpdate & { status?: FaceLoadStepStatus }) => {
      const currentSessionToken = faceLoadSessionTokenRef.current;
      if (sessionToken !== undefined && sessionToken !== currentSessionToken) {
        return;
      }
      if (!operationId) {
        return;
      }
      const existing = faceLoadOperationsRef.current.get(operationId);
      if (!existing) {
        return;
      }
      faceLoadOperationsRef.current.delete(operationId);
      const timestampMs = nowMs();
      setFaceLoadInFlightOperationCount(faceLoadOperationsRef.current.size);
      setFaceLoadLastOperationUpdateAtMs(timestampMs);
      logFaceLoadEvent("op-end", {
        operationId,
        stepId: stepId ?? existing.stepId ?? null,
        substepId: substepId ?? existing.substepId ?? null,
        label: label ?? existing.label ?? null,
        durationMs: Math.max(0, timestampMs - existing.startedAtMs),
      });
    },
    [logFaceLoadEvent],
  );

  const markFaceLoadMilestone = useCallback(
    (
      milestone: FaceLoadMilestoneName,
      options?: {
        sessionToken?: string | null;
      },
    ) => {
      const currentSessionToken = faceLoadSessionTokenRef.current;
      if (
        options?.sessionToken !== undefined &&
        options.sessionToken !== currentSessionToken
      ) {
        return;
      }
      setFaceLoadMilestones((previous) => {
        if (previous[milestone] !== null) {
          return previous;
        }
        const milestoneOrder = FACE_LOAD_MILESTONE_ORDER.indexOf(milestone);
        if (milestoneOrder > 0) {
          for (let index = 0; index < milestoneOrder; index += 1) {
            const prerequisite = FACE_LOAD_MILESTONE_ORDER[index];
            if (previous[prerequisite] === null) {
              return previous;
            }
          }
        }
        const next = {
          ...previous,
          [milestone]: nowMs(),
        };
        faceLoadMilestonesRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const previous = previousFaceLoadMilestonesRef.current;
    FACE_LOAD_MILESTONE_ORDER.forEach((milestone) => {
      const nextTimestamp = faceLoadMilestones[milestone];
      if (previous[milestone] !== nextTimestamp && nextTimestamp !== null) {
        logFaceLoadEvent("milestone-marked", {
          milestone,
          markedAtMs: nextTimestamp,
        });
      }
    });
    previousFaceLoadMilestonesRef.current = faceLoadMilestones;
  }, [faceLoadMilestones, logFaceLoadEvent]);

  const beginImportFlow = useCallback(
    (sourceLabel: string) => {
      const sessionToken = createFaceLoadSessionToken();
      const startedAtMs = nowMs();
      faceLoadSessionTokenRef.current = sessionToken;
      faceLoadSessionStartedAtRef.current = startedAtMs;
      setFaceLoadSessionToken(sessionToken);
      resetExternalPhaseTrackers();
      clearFaceLoadOperations("begin-import-flow");
      setIsImportFlowActive(true);
      setFaceLoadSourceLabel(sourceLabel);
      setFaceLoadSessionStartedAtMs(startedAtMs);
      setFaceLoadSessionCompletedAtMs(null);
      resetFaceLoadMilestones();
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
      logFaceLoadEvent("session-begin", { sourceLabel });
    },
    [
      clearFaceLoadOperations,
      logFaceLoadEvent,
      resetExternalPhaseTrackers,
      resetFaceLoadMilestones,
    ],
  );

  const markImportFileSelected = useCallback(() => {
    logFaceLoadEvent("file-selected");
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
  }, [logFaceLoadEvent]);

  const markImportFlowError = useCallback(
    (failedStepId: string) => {
      logFaceLoadEvent("session-error", { failedStepId });
      setIsImportFlowActive(false);
      setFaceLoadSessionCompletedAtMs(nowMs());
      clearFaceLoadOperations("session-error");
      setFaceLoadSteps((previous) =>
        updateFaceLoadStatus(previous, {
          stepId: failedStepId,
          stepStatus: "error",
        }),
      );
    },
    [clearFaceLoadOperations, logFaceLoadEvent],
  );

  const cancelImportFlow = useCallback(() => {
    logFaceLoadEvent("session-cancel");
    faceLoadSessionTokenRef.current = null;
    faceLoadSessionStartedAtRef.current = null;
    setFaceLoadSessionToken(null);
    resetExternalPhaseTrackers();
    clearFaceLoadOperations("session-cancel");
    resetFaceLoadMilestones();
    setIsImportFlowActive(false);
    setFaceLoadProgress(0);
    setFaceLoadSteps(createDefaultFaceLoadSteps());
    setFaceLoadSourceLabel(null);
    setFaceLoadSessionStartedAtMs(null);
    setFaceLoadSessionCompletedAtMs(null);
  }, [
    clearFaceLoadOperations,
    logFaceLoadEvent,
    resetExternalPhaseTrackers,
    resetFaceLoadMilestones,
  ]);

  const completeImportFlow = useCallback(() => {
    logFaceLoadEvent("session-complete-requested", {
      milestones: faceLoadMilestonesRef.current,
    });
    clearFaceLoadOperations("session-complete");
    setIsImportFlowActive(false);
    setFaceLoadProgress(1);
    setFaceLoadSessionCompletedAtMs(nowMs());
  }, [clearFaceLoadOperations, logFaceLoadEvent]);

  const updateExternalPhase = useCallback(
    (update: FaceLoadPhaseUpdate) => {
      const currentSessionToken = faceLoadSessionTokenRef.current;
      if (
        update.sessionToken !== undefined &&
        update.sessionToken !== currentSessionToken
      ) {
        logFaceLoadEvent("phase-drop", {
          reason: "session-mismatch",
          stepId: update.stepId,
          substepId: update.substepId ?? null,
          status: update.status,
          expectedSessionToken: currentSessionToken,
          receivedSessionToken: update.sessionToken,
        });
        return;
      }

      const nextSequence = faceLoadExternalPhaseSequenceRef.current + 1;
      faceLoadExternalPhaseSequenceRef.current = nextSequence;

      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      const operationLabel =
        update.operationLabel ?? update.substepLabel ?? update.label;
      const shouldTrackOperation =
        typeof operationId === "string" && currentSessionToken !== null;

      if (shouldTrackOperation) {
        if (update.status === "active") {
          beginFaceLoadOperation({
            operationId,
            stepId: update.stepId,
            substepId: update.substepId,
            label: operationLabel,
            sessionToken: update.sessionToken,
          });
        } else {
          endFaceLoadOperation({
            operationId,
            stepId: update.stepId,
            substepId: update.substepId,
            label: operationLabel,
            sessionToken: update.sessionToken,
            status: update.status,
          });
        }
      }

      const knownStepOrder = faceLoadExternalPhaseStepOrderRef.current.get(
        update.stepId,
      );
      const stepOrder =
        typeof knownStepOrder === "number"
          ? knownStepOrder
          : faceLoadExternalPhaseStepOrderRef.current.size;
      if (typeof knownStepOrder !== "number") {
        faceLoadExternalPhaseStepOrderRef.current.set(update.stepId, stepOrder);
      }

      logFaceLoadEvent("phase-apply", {
        stepId: update.stepId,
        substepId: update.substepId ?? null,
        status: update.status,
        sequence: nextSequence,
        stepOrder,
      });

      setFaceLoadSteps((previous) => {
        const hasStep = previous.some((step) => step.id === update.stepId);
        if (hasStep) {
          const existingStep = previous.find(
            (step) => step.id === update.stepId,
          );
          if (existingStep) {
            const existingSubstep = update.substepId
              ? existingStep.substeps.find(
                (substep) => substep.id === update.substepId,
              )
              : undefined;
            const stepStatusMatches = existingStep.status === update.status;
            const substepStatusMatches = update.substepId
              ? existingSubstep?.status === update.status
              : true;
            if (stepStatusMatches && substepStatusMatches) {
              return previous;
            }
          }
        }
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
    },
    [beginFaceLoadOperation, endFaceLoadOperation, logFaceLoadEvent],
  );

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
          animations: loadedAnimations,
          scene,
        } = await loader();
        console.log("useVizijAssetLoader: loadedAnimations", loadedAnimations);
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
        setVizij(worldData, animatables, loadedAnimations ?? []);
        setExportSceneRoot(scene ?? null);
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
        markFaceLoadMilestone("asset-loaded");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.error("demo-vizij-render: failed to load Vizij", err);
        setBundle(null);
        setVizij({}, {}, []);
        setExportSceneRoot(null);
        markImportFlowError(activeStepId);
      } finally {
        setIsLoading(false);
      }
    },
    [
      addWorldElements,
      markFaceLoadMilestone,
      markImportFlowError,
      setStoreState,
    ],
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
    logFaceLoadEvent("session-reset");
    faceLoadSessionTokenRef.current = null;
    faceLoadSessionStartedAtRef.current = null;
    setFaceLoadSessionToken(null);
    resetExternalPhaseTrackers();
    clearFaceLoadOperations("session-reset");
    resetFaceLoadMilestones();
    setRootId(null);
    setSourceName(null);
    setAssetUrl("");
    setError(null);
    setBundle(null);
    setVizij({}, {}, []);
    setExportSceneRoot(null);
    setFaceLoadProgress(0);
    setFaceLoadSteps(createDefaultFaceLoadSteps());
    setIsImportFlowActive(false);
    setFaceLoadSourceLabel(null);
    setFaceLoadSessionStartedAtMs(null);
    setFaceLoadSessionCompletedAtMs(null);
  }, [
    clearFaceLoadOperations,
    logFaceLoadEvent,
    resetExternalPhaseTrackers,
    resetFaceLoadMilestones,
  ]);

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
    faceLoadSessionToken,
    faceLoadSessionStartedAtMs,
    faceLoadSessionCompletedAtMs,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    faceLoadMilestones,
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
    beginFaceLoadOperation,
    endFaceLoadOperation,
    markFaceLoadMilestone,
    updateExternalPhase,
    loadVizij,
    loadFromFile,
    loadFromUrl,
    bundle,
    animations,
    exportSceneRoot,
    updateBundle,
  };
}

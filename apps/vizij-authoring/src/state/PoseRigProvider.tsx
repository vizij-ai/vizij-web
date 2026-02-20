import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import {
  createPoseRigStore,
  PoseRigStoreProvider,
  type PoseRigStore,
} from "../poseRig/store";
import {
  usePoseRigAuthoring,
  type UsePoseRigAuthoringResult,
} from "../poseRig/usePoseRigAuthoring";
import {
  buildPoseWeightInputSourceId,
  buildPoseWeightPathMap,
  isPoseWeightInputPath,
  parsePoseWeightInputSourceId,
} from "../poseRig/utils";
import { PoseIrService } from "../poseRig/services/poseIrService";
import { recordPoseNormalizeRun } from "../perf/runtimePerfMetrics";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useGraphRuntimeStoreApi,
  useRigUi,
} from "./RigControllerProvider";
import {
  usePoseRigNeutralSync,
  usePoseRigStoreStateSync,
} from "./usePoseRigStoreSync";

function isPoseInputNamespacePath(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  return normalized.startsWith("/poses/");
}

interface PoseRigProviderProps {
  rootId: string | null;
  children: ReactNode;
}

const NO_PENDING_POSE_SPEC = Symbol("no-pending-pose-spec");
type PendingPoseGraphSpec = GraphSpec | null | typeof NO_PENDING_POSE_SPEC;

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

const PoseRigContext = createContext<UsePoseRigAuthoringResult | null>(null);

export function usePoseRig() {
  const ctx = useContext(PoseRigContext);
  if (!ctx) {
    throw new Error("usePoseRig must be used within PoseRigProvider");
  }
  return ctx;
}

function PoseRigController({
  rootId,
  children,
}: {
  rootId: string | null;
  children: ReactNode;
}) {
  const faceId = useGraphRuntime((state) => state.faceId);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const hiddenInputIds = useRigUi((state) => state.hiddenDriverIds);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleDeleteCustomStandardInput = useBindingAuthoring(
    (state) => state.handleDeleteCustomStandardInput,
  );

  const poseAuthoringStandardInputs = useMemo(
    () => standardInputs.filter((input) => !isPoseWeightInputPath(input.path)),
    [standardInputs],
  );

  const poseRig = usePoseRigAuthoring({
    faceId,
    rootId,
    standardInputs: poseAuthoringStandardInputs,
    inputValues,
    hiddenInputIds,
    onInputValueChange: handleInputValueChange,
    applyInputBatch: applyStandardInputBatch,
  });
  const projectedPoseConfig = useMemo(() => {
    if (!poseRig.poseIrDraft) {
      return poseRig.poseConfigDraft ?? null;
    }
    try {
      return PoseIrService.toConfig(poseRig.poseIrDraft);
    } catch {
      return poseRig.poseConfigDraft ?? null;
    }
  }, [poseRig.poseConfigDraft, poseRig.poseIrDraft]);

  const poseWeightInputs = useMemo(() => {
    const pathMap = buildPoseWeightPathMap(poseRig.poses, faceId);
    return poseRig.poses.map((pose) => {
      const pathInfo = pathMap.get(pose.id);
      const normalizedPath = normalizeStandardRigInputPath(
        pathInfo?.relativePath ?? `/poses/${pose.id}.weight`,
      );
      const label = `Pose Weight - ${pose.name?.trim() || pose.id}`;
      return {
        poseId: pose.id,
        path: normalizedPath,
        label,
        sourceId: buildPoseWeightInputSourceId(pose.id),
      };
    });
  }, [faceId, poseRig.poses]);

  useEffect(() => {
    const retainedInputIds = new Set<string>();
    const trackedEntries = managedStandardInputs.filter(
      (entry) =>
        entry.source === "custom" &&
        (parsePoseWeightInputSourceId(entry.input.sourceId) !== null ||
          isPoseInputNamespacePath(entry.input.path)),
    );
    const trackedByPoseId = new Map<string, typeof trackedEntries>();
    const trackedByPath = new Map<string, typeof trackedEntries>();
    const managedByInputId = new Map(
      managedStandardInputs.map((entry) => [entry.input.id, entry]),
    );

    trackedEntries.forEach((entry) => {
      const poseId = parsePoseWeightInputSourceId(entry.input.sourceId);
      if (poseId) {
        const list = trackedByPoseId.get(poseId) ?? [];
        list.push(entry);
        trackedByPoseId.set(poseId, list);
      }
      const normalizedPath = normalizeStandardRigInputPath(entry.input.path);
      const list = trackedByPath.get(normalizedPath) ?? [];
      list.push(entry);
      trackedByPath.set(normalizedPath, list);
    });

    poseWeightInputs.forEach((target) => {
      const candidateById = (trackedByPoseId.get(target.poseId) ?? []).find(
        (entry) => !retainedInputIds.has(entry.input.id),
      );
      const candidateByPath = (trackedByPath.get(target.path) ?? []).find(
        (entry) => !retainedInputIds.has(entry.input.id),
      );
      const mappedInput = standardInputsByPath.get(target.path);
      const candidateByMappedPath = mappedInput
        ? managedByInputId.get(mappedInput.id)
        : undefined;
      const existing =
        candidateById ??
        candidateByPath ??
        (candidateByMappedPath &&
        !retainedInputIds.has(candidateByMappedPath.input.id)
          ? candidateByMappedPath
          : undefined);
      if (!existing) {
        const created = handleCreateCustomStandardInput(target.path);
        if (!created) {
          return;
        }
        retainedInputIds.add(created.id);
        handleUpdateStandardInput(created.id, {
          path: target.path,
          label: target.label,
          sourceId: target.sourceId,
          defaultValue: 0,
          range: { min: 0, max: 1 },
        });
        return;
      }

      const normalizedPath = normalizeStandardRigInputPath(existing.input.path);
      const needsUpdate =
        normalizedPath !== target.path ||
        existing.input.label !== target.label ||
        (existing.input.sourceId ?? "") !== target.sourceId ||
        existing.input.defaultValue !== 0 ||
        existing.input.range.min !== 0 ||
        existing.input.range.max !== 1;
      if (needsUpdate) {
        handleUpdateStandardInput(existing.input.id, {
          path: target.path,
          label: target.label,
          sourceId: target.sourceId,
          defaultValue: 0,
          range: { min: 0, max: 1 },
        });
      }

      retainedInputIds.add(existing.input.id);
    });

    trackedEntries.forEach((entry) => {
      if (!retainedInputIds.has(entry.input.id)) {
        handleDeleteCustomStandardInput(entry.input.id);
      }
    });
  }, [
    handleCreateCustomStandardInput,
    handleDeleteCustomStandardInput,
    handleUpdateStandardInput,
    managedStandardInputs,
    poseWeightInputs,
    standardInputsByPath,
  ]);

  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const pendingPoseGraphSpecRef =
    useRef<PendingPoseGraphSpec>(NO_PENDING_POSE_SPEC);
  const poseNormalizeInFlightRef = useRef(false);
  const poseNormalizeUnmountedRef = useRef(false);

  useEffect(() => {
    poseNormalizeUnmountedRef.current = false;
    return () => {
      poseNormalizeUnmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    graphRuntimeStore.setState((state) => {
      if (state.poseConfig === projectedPoseConfig) {
        return;
      }
      return {
        poseConfig: projectedPoseConfig,
        poseRuntimeRevision: (state.poseRuntimeRevision ?? 0) + 1,
      };
    });
  }, [graphRuntimeStore, projectedPoseConfig]);

  useEffect(() => {
    pendingPoseGraphSpecRef.current = poseRig.poseGraphSpec ?? null;

    const syncPoseGraph = async () => {
      if (poseNormalizeInFlightRef.current) {
        return;
      }
      poseNormalizeInFlightRef.current = true;

      try {
        while (!poseNormalizeUnmountedRef.current) {
          const nextSpec = pendingPoseGraphSpecRef.current;
          pendingPoseGraphSpecRef.current = NO_PENDING_POSE_SPEC;
          if (nextSpec === NO_PENDING_POSE_SPEC) {
            return;
          }

          if (!nextSpec) {
            graphRuntimeStore.setState((state) => {
              if (!state.poseGraphSpec) {
                return;
              }
              return {
                poseGraphSpec: null,
                poseRuntimeRevision: (state.poseRuntimeRevision ?? 0) + 1,
              };
            });
            continue;
          }

          try {
            const normalizeStartMs = getNowMs();
            const normalized = await normalizeGraphSpec(nextSpec);
            recordPoseNormalizeRun(getNowMs() - normalizeStartMs);
            if (poseNormalizeUnmountedRef.current) {
              return;
            }
            if (pendingPoseGraphSpecRef.current !== NO_PENDING_POSE_SPEC) {
              continue;
            }
            graphRuntimeStore.setState((state) => {
              if (state.poseGraphSpec === normalized) {
                return;
              }
              return {
                poseGraphSpec: normalized,
                poseRuntimeRevision: (state.poseRuntimeRevision ?? 0) + 1,
              };
            });
          } catch (error) {
            console.warn("[poseRig] Failed to normalize pose graph", error);
            if (poseNormalizeUnmountedRef.current) {
              return;
            }
            if (pendingPoseGraphSpecRef.current !== NO_PENDING_POSE_SPEC) {
              continue;
            }
            graphRuntimeStore.setState((state) => {
              if (!state.poseGraphSpec) {
                return;
              }
              return {
                poseGraphSpec: null,
                poseRuntimeRevision: (state.poseRuntimeRevision ?? 0) + 1,
              };
            });
          }
        }
      } finally {
        poseNormalizeInFlightRef.current = false;
        if (
          !poseNormalizeUnmountedRef.current &&
          pendingPoseGraphSpecRef.current !== NO_PENDING_POSE_SPEC
        ) {
          void syncPoseGraph();
        }
      }
    };

    void syncPoseGraph();
  }, [graphRuntimeStore, poseRig.poseGraphSpec]);

  return (
    <PoseRigContext.Provider value={poseRig}>
      {children}
    </PoseRigContext.Provider>
  );
}

export function PoseRigProvider({ rootId, children }: PoseRigProviderProps) {
  const storeRef = useRef<PoseRigStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createPoseRigStore();
  }
  const poseRigStore = storeRef.current;

  // Sync effects to keep store up to date with binding store
  const faceId = useGraphRuntime((state) => state.faceId);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const poseAuthoringStandardInputs = useMemo(
    () => standardInputs.filter((input) => !isPoseWeightInputPath(input.path)),
    [standardInputs],
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const hiddenInputIds = useRigUi((state) => state.hiddenDriverIds);
  const standardInputSchema = useBindingAuthoring(
    (state) => state.standardInputSchema,
  );

  usePoseRigStoreStateSync({
    poseRigStore,
    faceId,
    rootId,
    poseAuthoringStandardInputs,
    inputValues,
    hiddenInputIds,
    standardInputSchema,
  });

  usePoseRigNeutralSync({
    poseRigStore,
    poseAuthoringStandardInputs,
  });

  return (
    <PoseRigStoreProvider store={poseRigStore}>
      <PoseRigController rootId={rootId}>{children}</PoseRigController>
    </PoseRigStoreProvider>
  );
}

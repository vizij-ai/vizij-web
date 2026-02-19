import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
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
import {
  useBindingAuthoring,
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "./RigControllerProvider";

function filterRecordByIds<T extends Record<string, number>>(
  record: T,
  allowed: Set<string>,
): T {
  const next: Record<string, number> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (allowed.has(key)) {
      next[key] = value;
    }
  });
  return next as T;
}

function areStandardInputsEquivalent(
  left: StandardRigInput[],
  right: StandardRigInput[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftInput = left[index];
    const rightInput = right[index];
    if (!leftInput || !rightInput) {
      return false;
    }
    if (
      leftInput.id !== rightInput.id ||
      leftInput.path !== rightInput.path ||
      leftInput.defaultValue !== rightInput.defaultValue ||
      leftInput.range.min !== rightInput.range.min ||
      leftInput.range.max !== rightInput.range.max
    ) {
      return false;
    }
  }
  return true;
}

function areSchemasEquivalent(
  left: { id: string; version: string } | null,
  right: { id: string; version: string } | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.id === right.id && left.version === right.version;
}

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
  const hiddenInputIds = useBindingAuthoring((state) => state.hiddenDriverIds);
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

  useEffect(() => {
    let cancelled = false;

    const syncPoseGraph = async () => {
      if (!poseRig.poseGraphSpec) {
        graphRuntimeStore.setState({
          poseGraphSpec: null,
          poseConfig: projectedPoseConfig,
        });
        return;
      }

      try {
        const normalized = await normalizeGraphSpec(poseRig.poseGraphSpec);
        if (cancelled) return;
        graphRuntimeStore.setState({
          poseGraphSpec: normalized,
          poseConfig: projectedPoseConfig,
        });
      } catch (error) {
        console.warn("[poseRig] Failed to normalize pose graph", error);
        if (cancelled) return;
        graphRuntimeStore.setState({
          poseGraphSpec: null,
          poseConfig: projectedPoseConfig,
        });
      }
    };

    void syncPoseGraph();

    return () => {
      cancelled = true;
    };
  }, [graphRuntimeStore, poseRig.poseGraphSpec, projectedPoseConfig]);

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
  const hiddenInputIds = useBindingAuthoring((state) => state.hiddenDriverIds);
  const standardInputSchema = useBindingAuthoring(
    (state) => state.standardInputSchema,
  );

  useEffect(() => {
    poseRigStore.setState({ faceId });
  }, [poseRigStore, faceId]);

  useEffect(() => {
    const hiddenSet = new Set(hiddenInputIds);
    const visibleInputs = poseAuthoringStandardInputs.filter(
      (input) => !hiddenSet.has(input.id),
    );
    const filteredCurrent = filterRecordByIds(
      inputValues,
      new Set(visibleInputs.map((input) => input.id)),
    );
    poseRigStore.setState((state) => {
      const isReady = Boolean(rootId && visibleInputs.length > 0);
      const patch: {
        currentValues: Record<string, number>;
        hiddenInputIds: string[];
        isReady: boolean;
        standardInputs?: StandardRigInput[];
        standardInputSchema?: { id: string; version: string } | null;
      } = {
        currentValues: filteredCurrent,
        hiddenInputIds: Array.from(hiddenSet),
        isReady,
      };

      if (!areStandardInputsEquivalent(state.standardInputs, visibleInputs)) {
        patch.standardInputs = visibleInputs;
      }
      if (
        !areSchemasEquivalent(state.standardInputSchema, standardInputSchema)
      ) {
        patch.standardInputSchema = standardInputSchema;
      }

      return patch;
    });
  }, [
    hiddenInputIds,
    inputValues,
    poseRigStore,
    rootId,
    standardInputSchema,
    poseAuthoringStandardInputs,
  ]);

  useEffect(() => {
    if (poseAuthoringStandardInputs.length > 0) {
      const allowed = new Set(
        poseAuthoringStandardInputs.map((input) => input.id),
      );
      poseRigStore.setState((state) => {
        const nextNeutral = Object.keys(state.neutralInputs).length
          ? filterRecordByIds(state.neutralInputs, allowed)
          : (() => {
              const neutral: Record<string, number> = {};
              poseAuthoringStandardInputs.forEach((input) => {
                neutral[input.id] = input.defaultValue ?? 0;
              });
              return neutral;
            })();
        const nextCurrent = filterRecordByIds(state.currentValues, allowed);
        return {
          neutralInputs: nextNeutral,
          currentValues: nextCurrent,
        };
      });
    }
  }, [poseAuthoringStandardInputs, poseRigStore]);

  return (
    <PoseRigStoreProvider store={poseRigStore}>
      <PoseRigController rootId={rootId}>{children}</PoseRigController>
    </PoseRigStoreProvider>
  );
}

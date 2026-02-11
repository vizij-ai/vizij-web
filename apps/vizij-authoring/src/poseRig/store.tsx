import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseDefinition,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";
import { PoseConfigService } from "./services/poseConfigService";
import { PoseGraphService } from "./services/poseGraphService";
import { PoseSnapshotService } from "./services/poseSnapshotService";
import { createNeutralInputs } from "./utils";

export interface PoseRigState {
  // Core Data
  faceId: string | null;
  rigName: string;
  rigKind: "generic" | "face-specific";
  neutralInputs: Record<StandardInputId, number>;
  currentValues: Record<StandardInputId, number>;
  standardInputs: StandardRigInput[];
  poses: PoseDefinition[];
  hiddenInputIds: string[];

  // UI State
  selectedPoseId: string | null;
  activePoseId: string | null; // For "preview" mode
  blendMode: "average" | "additive";
  crossGroupBlendMode: "average" | "additive";

  // Graph/Config State
  poseGraphSpec: GraphSpec | null;
  poseGraphSummary: PoseRigGraphSummary | null;
  poseConfigDraft: PoseRigConfigFile | null; // The config being edited
  standardInputSchema: { id: string; version: string } | null;
  lastImportedConfig: PoseRigConfigFile | null; // For diffing/dirty checks

  // Metadata
  filenames: {
    config: string;
    graph: string;
  };
  warnings: string[];
  isReady: boolean;

  // Actions
  setRigName: (name: string) => void;
  setRigKind: (kind: "generic" | "face-specific") => void;
  setNeutralInputs: (inputs: Record<StandardInputId, number>) => void;
  setStandardInputs: (inputs: StandardRigInput[]) => void;
  updateCurrentValues: (values: Record<StandardInputId, number>) => void;
  selectPose: (poseId: string | null) => void;
  createPose: (name?: string, group?: string | null) => void;
  addPose: (pose: PoseDefinition) => void;
  duplicatePose: (poseId: string) => void;
  deletePose: (poseId: string) => void;
  updatePose: (
    poseId: string,
    updater: (pose: PoseDefinition) => PoseDefinition,
  ) => void;
  capturePose: (poseId: string) => void;
  applyPose: (poseId: string) => void;
  captureNeutral: () => void;
  applyNeutral: () => void;
  importConfig: (config: PoseRigConfigFile) => void;
  reset: () => void;
  setFilenames: (filenames: { config?: string; graph?: string }) => void;
  setBlendMode: (mode: "average" | "additive") => void;
  setCrossGroupBlendMode: (mode: "average" | "additive") => void;
  updatePoseName: (poseId: string, name: string) => void;
  updatePoseGroup: (poseId: string, group: string | null) => void;
  updatePoseGroupBatch: (
    poseIds: Iterable<string>,
    group: string | null,
  ) => void;
  clearPose: (poseId: string) => void;
  addPoseInput: (poseId: string, inputId: string) => void;
  removePoseInput: (poseId: string, inputId: string) => void;
}

type PoseRigStoreUpdate =
  | Partial<PoseRigState>
  | ((state: PoseRigState) => Partial<PoseRigState> | void);

export interface PoseRigStore {
  getState: () => PoseRigState;
  setState: (updater: PoseRigStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

export const DEFAULT_RIG_NAME = "pose_rig";
export const NEUTRAL_POSE_ID = "__pose_rig_neutral__";

const defaultState: Omit<
  PoseRigState,
  | "setRigName"
  | "setRigKind"
  | "setNeutralInputs"
  | "setStandardInputs"
  | "updateCurrentValues"
  | "selectPose"
  | "createPose"
  | "deletePose"
  | "updatePose"
  | "capturePose"
  | "applyPose"
  | "captureNeutral"
  | "applyNeutral"
  | "importConfig"
  | "reset"
  | "addPose"
  | "duplicatePose"
  | "setFilenames"
  | "setBlendMode"
  | "setCrossGroupBlendMode"
  | "updatePoseName"
  | "updatePoseGroup"
  | "updatePoseGroupBatch"
  | "clearPose"
  | "addPoseInput"
  | "removePoseInput"
> = {
  faceId: null,
  rigName: DEFAULT_RIG_NAME,
  rigKind: "face-specific",
  neutralInputs: {},
  currentValues: {},
  standardInputs: [],
  poses: [],
  hiddenInputIds: [],
  selectedPoseId: NEUTRAL_POSE_ID,
  activePoseId: null,
  blendMode: "average",
  crossGroupBlendMode: "additive",
  poseGraphSpec: null,
  poseGraphSummary: null,
  poseConfigDraft: null,
  standardInputSchema: null,
  lastImportedConfig: null,
  filenames: {
    config: "",
    graph: "",
  },
  warnings: [],
  isReady: false,
};

export function createPoseRigStore(
  initialState?: Partial<PoseRigState>,
): PoseRigStore {
  let state: PoseRigState;
  const listeners = new Set<() => void>();

  const setState = (updater: PoseRigStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as PoseRigState;

    // Auto-update poseConfigDraft if relevant fields change
    if (
      patch.poses ||
      patch.neutralInputs ||
      patch.rigName ||
      patch.faceId ||
      patch.rigKind ||
      patch.standardInputs ||
      patch.standardInputSchema ||
      patch.blendMode ||
      patch.crossGroupBlendMode
    ) {
      const standardInputSchema =
        nextState.poseConfigDraft?.standardInputSchema ??
        nextState.lastImportedConfig?.standardInputSchema ??
        nextState.standardInputSchema ??
        undefined;
      const basePoseGroups =
        nextState.poseConfigDraft?.poseGroups ??
        nextState.lastImportedConfig?.poseGroups;
      const poseGroups =
        patch.blendMode && basePoseGroups
          ? basePoseGroups.map((group) => ({
              ...group,
              blendMode: nextState.blendMode,
            }))
          : basePoseGroups;

      nextState.poseConfigDraft = PoseConfigService.create(
        nextState.poses,
        nextState.neutralInputs,
        nextState.rigName,
        nextState.faceId,
        nextState.rigKind,
        standardInputSchema,
        {
          poseGroups,
          defaultGroupBlendMode: nextState.blendMode,
          crossGroupBlendMode: nextState.crossGroupBlendMode,
        },
      );

      try {
        const { spec, summary } = PoseGraphService.buildSpec(
          nextState.poseConfigDraft,
          nextState.standardInputs,
          {
            defaultGroupBlendMode: nextState.blendMode,
            crossGroupBlendMode: nextState.crossGroupBlendMode,
          },
        );
        nextState.poseGraphSpec = spec;
        nextState.poseGraphSummary = summary;
      } catch (e) {
        console.error("Failed to build pose graph spec", e);
        // Keep previous spec or set to null?
        // nextState.poseGraphSpec = null;
      }
    }

    if (nextState === state) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const actions: Pick<
    PoseRigState,
    | "setRigName"
    | "setRigKind"
    | "setNeutralInputs"
    | "setStandardInputs"
    | "updateCurrentValues"
    | "selectPose"
    | "createPose"
    | "deletePose"
    | "updatePose"
    | "capturePose"
    | "applyPose"
    | "captureNeutral"
    | "applyNeutral"
    | "importConfig"
    | "reset"
    | "addPose"
    | "duplicatePose"
    | "setFilenames"
    | "setBlendMode"
    | "setCrossGroupBlendMode"
    | "updatePoseName"
    | "updatePoseGroup"
    | "updatePoseGroupBatch"
    | "clearPose"
    | "addPoseInput"
    | "removePoseInput"
  > = {
    setRigName: (name) => {
      setState({ rigName: name });
    },
    setRigKind: (kind) => {
      setState({ rigKind: kind });
    },
    setBlendMode: (mode) => {
      setState({ blendMode: mode });
    },
    setCrossGroupBlendMode: (mode) => {
      setState({ crossGroupBlendMode: mode });
    },
    setFilenames: (filenames) => {
      setState((prev) => ({ filenames: { ...prev.filenames, ...filenames } }));
    },
    setNeutralInputs: (inputs) => {
      setState({ neutralInputs: inputs });
    },
    setStandardInputs: (inputs) => {
      setState({ standardInputs: inputs });
    },
    updateCurrentValues: (values) => {
      setState((prev) => ({
        currentValues: { ...prev.currentValues, ...values },
      }));
    },
    selectPose: (poseId) => {
      setState({ selectedPoseId: poseId });
    },
    createPose: (name, group) => {
      setState((prev) => {
        const newPose = PoseSnapshotService.createPoseDefinition(
          name || `Pose ${prev.poses.length + 1}`,
          group,
        );
        return {
          poses: [...prev.poses, newPose],
          selectedPoseId: newPose.id,
        };
      });
    },
    addPose: (pose) => {
      setState((prev) => ({
        poses: [...prev.poses, pose],
        selectedPoseId: pose.id,
      }));
    },
    duplicatePose: (poseId) => {
      setState((prev) => {
        const original = prev.poses.find((p) => p.id === poseId);
        if (!original) return;
        const duplicate = {
          ...original,
          id: `pose_${Math.random().toString(36).slice(2, 10)}`,
          name: `${original.name} Copy`,
          updatedAt: new Date().toISOString(),
          values: { ...original.values },
        };
        return {
          poses: [...prev.poses, duplicate],
          selectedPoseId: duplicate.id,
        };
      });
    },
    deletePose: (poseId) => {
      setState((prev) => {
        const nextPoses = prev.poses.filter((p) => p.id !== poseId);
        let nextSelected = prev.selectedPoseId;
        if (nextSelected === poseId) {
          nextSelected = nextPoses[0]?.id ?? NEUTRAL_POSE_ID;
        }
        return {
          poses: nextPoses,
          selectedPoseId: nextSelected,
        };
      });
    },
    updatePoseName: (poseId, name) => {
      setState((prev) => ({
        poses: prev.poses.map((p) => (p.id === poseId ? { ...p, name } : p)),
      }));
    },
    updatePoseGroup: (poseId, group) => {
      setState((prev) => ({
        poses: prev.poses.map((p) =>
          p.id === poseId ? { ...p, group, groupId: null } : p,
        ),
      }));
    },
    updatePoseGroupBatch: (poseIds, group) => {
      const ids = new Set(poseIds);
      setState((prev) => ({
        poses: prev.poses.map((p) =>
          ids.has(p.id) ? { ...p, group, groupId: null } : p,
        ),
      }));
    },
    clearPose: (poseId) => {
      setState((prev) => ({
        poses: prev.poses.map((p) =>
          p.id === poseId ? { ...p, values: {} } : p,
        ),
      }));
    },
    addPoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const val =
          prev.currentValues[inputId] ?? prev.neutralInputs[inputId] ?? 0;
        return {
          poses: prev.poses.map((p) =>
            p.id === poseId
              ? { ...p, values: { ...p.values, [inputId]: val } }
              : p,
          ),
        };
      });
    },
    removePoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const nextValues = { ...pose.values };
        delete nextValues[inputId];
        return {
          poses: prev.poses.map((p) =>
            p.id === poseId ? { ...p, values: nextValues } : p,
          ),
        };
      });
    },
    updatePose: (poseId, updater) => {
      setState((prev) => ({
        poses: prev.poses.map((p) => (p.id === poseId ? updater(p) : p)),
      }));
    },
    capturePose: (poseId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const captured = PoseSnapshotService.capture(
          prev.currentValues,
          prev.neutralInputs,
          { name: pose.name, group: pose.group },
        );
        // Preserve ID and other metadata
        const updated = {
          ...pose,
          values: captured.values,
          updatedAt: new Date().toISOString(),
        };
        return {
          poses: prev.poses.map((p) => (p.id === poseId ? updated : p)),
        };
      });
    },
    applyPose: (poseId) => {
      const s = state;
      const pose = s.poses.find((p) => p.id === poseId);
      if (!pose) return;
      const newValues = PoseSnapshotService.apply(pose, s.neutralInputs);
      setState({ currentValues: newValues });
    },
    captureNeutral: () => {
      setState((prev) => {
        return {
          neutralInputs: { ...prev.currentValues },
        };
      });
    },
    applyNeutral: () => {
      setState((prev) => ({
        currentValues: { ...prev.neutralInputs },
        selectedPoseId: NEUTRAL_POSE_ID,
      }));
    },
    importConfig: (config) => {
      const { config: normalized, warnings } = PoseConfigService.normalize(
        config,
        state.standardInputs,
        state.faceId,
      );
      const newNeutralInputs = {
        ...createNeutralInputs(state.standardInputs),
        ...normalized.neutralInputs,
      };
      setState({
        poses: normalized.poses,
        neutralInputs: newNeutralInputs,
        currentValues: { ...newNeutralInputs },
        rigName: normalized.title || DEFAULT_RIG_NAME,
        rigKind: normalized.rigKind ?? "face-specific",
        blendMode:
          normalized.poseGroups?.[0]?.blendMode ?? state.blendMode ?? "average",
        crossGroupBlendMode: normalized.crossGroupBlendMode ?? "additive",
        standardInputSchema: normalized.standardInputSchema ?? null,
        lastImportedConfig: config,
        poseConfigDraft: normalized,
        warnings,
      });
    },
    reset: () => {
      setState({
        ...defaultState,
      });
    },
  };

  state = {
    ...defaultState,
    ...actions,
    ...(initialState ?? {}),
  };

  const getState = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

const PoseRigStoreContext = createContext<PoseRigStore | null>(null);

export function PoseRigStoreProvider({
  store,
  children,
}: {
  store: PoseRigStore;
  children: ReactNode;
}) {
  return (
    <PoseRigStoreContext.Provider value={store}>
      {children}
    </PoseRigStoreContext.Provider>
  );
}

export function usePoseRigStore<T>(selector: (state: PoseRigState) => T): T {
  const store = useContext(PoseRigStoreContext);
  if (!store) {
    throw new Error("Missing PoseRigStoreProvider");
  }
  const subscribe = store.subscribe;
  const getSnapshot = () => selector(store.getState());
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return value;
}

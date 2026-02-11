import { useCallback, useMemo } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  LowLevelRigSummary,
  PoseDefinition,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";
import { usePoseRigStore } from "./store";
import { PoseSnapshotService } from "./services/poseSnapshotService";
import { PoseGraphService } from "./services/poseGraphService";

export interface UsePoseRigAuthoringOptions {
  faceId: string | null;
  rootId: string | null;
  standardInputs: StandardRigInput[];
  inputValues: Record<StandardInputId, number>;
  hiddenInputIds?: Iterable<string>;
  onInputValueChange: (inputId: string, value: number) => void;
  applyInputBatch?: (values: Record<StandardInputId, number>) => void;
  lowLevelSummary?: LowLevelRigSummary | null;
}

export interface PoseLibrarySummary {
  neutral: Record<string, number>;
  poses: Array<{ id: string; name: string }>;
}

export interface UsePoseRigAuthoringResult {
  ready: boolean;
  neutralInputs: Record<StandardInputId, number>;
  savedNeutral: Record<StandardInputId, number>;
  currentValues: Record<StandardInputId, number>;
  rigKind: "generic" | "face-specific";
  setRigKind: (kind: "generic" | "face-specific") => void;
  blendMode: "average" | "additive";
  setBlendMode: (mode: "average" | "additive") => void;
  standardInputs: StandardRigInput[];
  poses: PoseDefinition[];
  selectedPoseId: string | null;
  selectedPose: PoseDefinition | null;
  isNeutralSelected: boolean;
  rigName: string;
  setRigName: (value: string) => void;
  selectNeutral: () => void;
  selectPose: (poseId: string) => void;
  createPose: (name?: string) => void;
  duplicatePose: (poseId: string) => void;
  deletePose: (poseId: string) => void;
  updatePoseName: (poseId: string, name: string) => void;
  updatePoseDescription: (poseId: string, description: string) => void;
  updatePoseGroup: (poseId: string, group: string | null | undefined) => void;
  updatePoseGroupBatch: (
    poseIds: Iterable<string>,
    group: string | null | undefined,
  ) => void;
  createPoseFromSnapshot: (name?: string) => void;
  capturePose: (poseId: string) => void;
  clearPose: (poseId: string) => void;
  updatePoseValue: (poseId: string, inputId: string, value: number) => void;
  addPoseInput: (poseId: string, inputId: string) => void;
  removePoseInput: (poseId: string, inputId: string) => void;
  captureNeutral: () => void;
  applyNeutral: () => void;
  applyPose: (poseId: string) => void;
  updateCurrentValue: (inputId: string, value: number) => void;
  poseGraphSpec: GraphSpec | null;
  poseGraphSummary: PoseRigGraphSummary | null;
  poseGraphFileName: string;
  setPoseGraphFileName: (value: string) => void;
  poseConfigFileName: string;
  setPoseConfigFileName: (value: string) => void;
  poseConfigWarnings: string[];
  poseConfigDraft: PoseRigConfigFile | null;
  importPoseConfig: (file: File) => Promise<void>;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  importPoseGraphSpec: (
    spec: GraphSpec,
    options?: {
      rigName?: string;
      groupName?: string;
      applyNeutral?: boolean;
    },
  ) => string[];
  resetPoseState: () => void;
  poseLibrary: PoseLibrarySummary;
}

export function usePoseRigAuthoring(
  options: UsePoseRigAuthoringOptions,
): UsePoseRigAuthoringResult {
  const {
    standardInputs,
    onInputValueChange,
    applyInputBatch,
    hiddenInputIds,
  } = options;

  const hiddenInputSet = useMemo(
    () => new Set(hiddenInputIds ?? []),
    [hiddenInputIds],
  );
  const visibleStandardInputs = useMemo(
    () => standardInputs.filter((input) => !hiddenInputSet.has(input.id)),
    [hiddenInputSet, standardInputs],
  );

  const store = usePoseRigStore((state) => state);

  // Map store state to result
  const ready = store.isReady;
  const neutralInputs = store.neutralInputs;
  const currentValues = store.currentValues;
  const poses = store.poses;
  const selectedPoseId = store.selectedPoseId;
  const rigName = store.rigName;
  const rigKind = store.rigKind;
  const blendMode = store.blendMode;
  const poseGraphSpec = store.poseGraphSpec;
  const poseGraphSummary = store.poseGraphSummary;
  const poseConfigDraft = store.poseConfigDraft;
  const poseConfigWarnings = store.warnings;
  const poseGraphFileName = store.filenames.graph;
  const poseConfigFileName = store.filenames.config;

  const selectedPose = useMemo(
    () => poses.find((p) => p.id === selectedPoseId) ?? null,
    [poses, selectedPoseId],
  );

  const isNeutralSelected =
    selectedPoseId === "__pose_rig_neutral__" || selectedPoseId === null;

  // Actions
  const setRigName = store.setRigName;
  const selectNeutral = useCallback(
    () => store.selectPose("__pose_rig_neutral__"),
    [store],
  );
  const selectPose = store.selectPose;
  const createPose = useCallback(
    (name?: string) => store.createPose(name, selectedPose?.group),
    [store, selectedPose],
  );
  const deletePose = store.deletePose;
  // ... (lines 101-125)
  const capturePose = store.capturePose;

  const applyPose = useCallback(
    (poseId: string) => {
      store.applyPose(poseId);
      const pose = store.poses.find((p) => p.id === poseId);
      if (pose && applyInputBatch) {
        const newValues = PoseSnapshotService.apply(pose, store.neutralInputs);
        applyInputBatch(newValues);
      }
    },
    [store, applyInputBatch],
  );

  const captureNeutral = store.captureNeutral;

  const applyNeutral = useCallback(() => {
    store.applyNeutral();
    if (applyInputBatch) {
      applyInputBatch(store.neutralInputs);
    }
  }, [store, applyInputBatch]);
  const resetPoseState = store.reset;
  const setBlendMode = store.setBlendMode;
  const setRigKind = store.setRigKind;

  // Derived actions
  const duplicatePose = store.duplicatePose;

  const updatePoseName = useCallback(
    (poseId: string, name: string) => {
      store.updatePose(poseId, (p) => ({ ...p, name }));
    },
    [store],
  );

  const updatePoseDescription = useCallback(
    (poseId: string, description: string) => {
      store.updatePose(poseId, (p) => ({ ...p, description }));
    },
    [store],
  );

  const updatePoseGroup = useCallback(
    (poseId: string, group: string | null | undefined) => {
      store.updatePose(poseId, (p) => ({ ...p, group: group ?? null }));
    },
    [store],
  );

  const updatePoseGroupBatch = useCallback(
    (poseIds: Iterable<string>, group: string | null | undefined) => {
      const ids = new Set(poseIds);
      ids.forEach((id) =>
        store.updatePose(id, (p) => ({ ...p, group: group ?? null })),
      );
    },
    [store],
  );

  const createPoseFromSnapshot = useCallback(
    (name?: string) => {
      const snapshot = PoseSnapshotService.capture(
        currentValues,
        neutralInputs,
        {
          name: name || `Pose ${poses.length + 1}`,
          group: selectedPose?.group,
        },
      );
      store.addPose(snapshot);
    },
    [currentValues, neutralInputs, selectedPose, store, poses.length],
  );

  const clearPose = useCallback(
    (poseId: string) => {
      store.updatePose(poseId, (p) => ({ ...p, values: {} }));
    },
    [store],
  );

  const updatePoseValue = useCallback(
    (poseId: string, inputId: string, value: number) => {
      store.updatePose(poseId, (p) => ({
        ...p,
        values: { ...p.values, [inputId]: value },
      }));
    },
    [store],
  );

  const addPoseInput = useCallback(
    (poseId: string, inputId: string) => {
      const val = currentValues[inputId] ?? neutralInputs[inputId] ?? 0;
      updatePoseValue(poseId, inputId, val);
    },
    [currentValues, neutralInputs, updatePoseValue],
  );

  const removePoseInput = useCallback(
    (poseId: string, inputId: string) => {
      store.updatePose(poseId, (p) => {
        const next = { ...p.values };
        delete next[inputId];
        return { ...p, values: next };
      });
    },
    [store],
  );

  const updateCurrentValue = useCallback(
    (inputId: string, value: number) => {
      onInputValueChange(inputId, value);
      store.updateCurrentValues({ [inputId]: value });
    },
    [onInputValueChange, store],
  );

  const setPoseGraphFileName = useCallback(
    (name: string) => {
      store.setFilenames({ graph: name });
    },
    [store],
  );

  const setPoseConfigFileName = useCallback(
    (name: string) => {
      store.setFilenames({ config: name });
    },
    [store],
  );

  const importPoseConfig = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        store.importConfig(json);
      } catch (e) {
        console.error("Failed to import config", e);
      }
    },
    [store],
  );

  const importPoseConfigFromData = store.importConfig;

  const importPoseGraphSpec = useCallback(
    (
      spec: GraphSpec,
      options?: {
        rigName?: string;
        groupName?: string;
        applyNeutral?: boolean;
      },
    ) => {
      const { groupName, applyNeutral = true } = options ?? {};

      const parsed = PoseGraphService.parse(spec, visibleStandardInputs);

      if (applyNeutral) {
        store.setNeutralInputs(parsed.neutralInputs);
      }

      parsed.poses.forEach((pose) => {
        let uniqueId = pose.id;
        // If rigName is provided, maybe use it to prefix?
        // The test "renames imported poses when ids collide" suggests we just handle collision.
        // But "appends imported poses" implies we keep existing.

        // Simple collision handling
        let counter = 1;
        while (poses.some((p) => p.id === uniqueId)) {
          uniqueId = `${pose.id}_${counter++}`;
        }

        // If we renamed the ID, we might want to update the name too if it helps,
        // but usually name is user facing.

        const newValues = { ...pose.values };
        if (!applyNeutral) {
          // Rebase logic
          for (const inputId of Object.keys(newValues)) {
            const val = newValues[inputId];
            const importedN = parsed.neutralInputs[inputId] ?? 0;
            const currentN = neutralInputs[inputId] ?? 0;
            const rebased = val - importedN + currentN;

            if (Math.abs(rebased - currentN) < 1e-6) {
              delete newValues[inputId];
            } else {
              newValues[inputId] = rebased;
            }
          }
        }

        const newPose: PoseDefinition = {
          ...pose,
          id: uniqueId,
          group: groupName ?? pose.group,
          values: newValues,
        };

        store.addPose(newPose);
      });

      return parsed.warnings;
    },
    [store, visibleStandardInputs, poses, neutralInputs],
  );

  const poseLibrary = useMemo(
    () => ({
      neutral: neutralInputs,
      poses: poses.map((p) => ({ id: p.id, name: p.name })),
    }),
    [neutralInputs, poses],
  );

  return {
    ready,
    neutralInputs,
    savedNeutral: neutralInputs,
    currentValues,
    blendMode,
    setBlendMode,
    rigKind,
    setRigKind,
    standardInputs: visibleStandardInputs,
    poses,
    selectedPoseId,
    selectedPose,
    isNeutralSelected,
    rigName,
    setRigName,
    selectNeutral,
    selectPose,
    createPose,
    duplicatePose,
    deletePose,
    updatePoseName,
    updatePoseDescription,
    updatePoseGroup,
    updatePoseGroupBatch,
    createPoseFromSnapshot,
    capturePose,
    clearPose,
    updatePoseValue,
    addPoseInput,
    removePoseInput,
    captureNeutral,
    applyNeutral,
    applyPose,
    updateCurrentValue,
    poseGraphSpec,
    poseGraphSummary,
    poseGraphFileName,
    setPoseGraphFileName,
    poseConfigFileName,
    setPoseConfigFileName,
    poseConfigWarnings,
    poseConfigDraft,
    importPoseConfig,
    importPoseConfigFromData,
    importPoseGraphSpec,
    resetPoseState,
    poseLibrary,
  };
}

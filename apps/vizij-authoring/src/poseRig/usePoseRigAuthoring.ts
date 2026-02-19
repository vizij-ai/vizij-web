import { useCallback, useMemo } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  LowLevelRigSummary,
  PoseDiagnostic,
  PoseDefinition,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  PoseRigIrFile,
  StandardInputId,
} from "./types";
import { usePoseRigStore } from "./store";
import { PoseSnapshotService } from "./services/poseSnapshotService";
import { PoseGraphService } from "./services/poseGraphService";
import { PoseIrService } from "./services/poseIrService";

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
  crossGroupBlendMode: "average" | "additive";
  setCrossGroupBlendMode: (mode: "average" | "additive") => void;
  createPoseGroup: (groupPath: string) => void;
  renamePoseGroup: (groupId: string, nextPath: string) => void;
  deletePoseGroup: (groupId: string) => void;
  setPoseGroupBlendMode: (
    groupId: string,
    mode: "average" | "additive",
  ) => void;
  addPoseToGroup: (poseId: string, group: string) => void;
  removePoseFromGroup: (poseId: string, group: string) => void;
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
  poseIrFileName: string;
  setPoseIrFileName: (value: string) => void;
  poseConfigWarnings: string[];
  poseDiagnostics: PoseDiagnostic[];
  poseConfigDraft: PoseRigConfigFile | null;
  poseIrDraft: PoseRigIrFile | null;
  importPoseConfig: (file: File) => Promise<void>;
  importPoseConfigFromData: (config: PoseRigConfigFile) => void;
  importPoseIr: (file: File) => Promise<void>;
  importPoseIrFromData: (ir: PoseRigIrFile) => void;
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
  const crossGroupBlendMode = store.crossGroupBlendMode;
  const poseGraphSpec = store.poseGraphSpec;
  const poseGraphSummary = store.poseGraphSummary;
  const poseConfigDraft = store.poseConfigDraft;
  const poseIrDraft = store.poseIrDraft;
  const poseConfigWarnings = store.warnings;
  const poseDiagnostics = store.poseDiagnostics;
  const poseGraphFileName = store.filenames.graph;
  const poseConfigFileName = store.filenames.config;
  const poseIrFileName = store.filenames.ir;

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
  const setCrossGroupBlendMode = store.setCrossGroupBlendMode;
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
      store.updatePoseGroup(poseId, group ?? null);
    },
    [store],
  );

  const updatePoseGroupBatch = useCallback(
    (poseIds: Iterable<string>, group: string | null | undefined) => {
      store.updatePoseGroupBatch(poseIds, group ?? null);
    },
    [store],
  );

  const createPoseGroup = useCallback(
    (groupPath: string) => {
      store.createPoseGroup(groupPath);
    },
    [store],
  );

  const renamePoseGroup = useCallback(
    (groupId: string, nextPath: string) => {
      store.renamePoseGroup(groupId, nextPath);
    },
    [store],
  );

  const deletePoseGroup = useCallback(
    (groupId: string) => {
      store.deletePoseGroup(groupId);
    },
    [store],
  );

  const setPoseGroupBlendMode = useCallback(
    (groupId: string, mode: "average" | "additive") => {
      store.setPoseGroupBlendMode(groupId, mode);
    },
    [store],
  );

  const addPoseToGroup = useCallback(
    (poseId: string, group: string) => {
      store.addPoseToGroup(poseId, group);
    },
    [store],
  );

  const removePoseFromGroup = useCallback(
    (poseId: string, group: string) => {
      store.removePoseFromGroup(poseId, group);
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
      if (!store.standardInputs.some((input) => input.id === inputId)) {
        return;
      }
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

  const setPoseIrFileName = useCallback(
    (name: string) => {
      store.setFilenames({ ir: name });
    },
    [store],
  );

  const importPoseConfig = useCallback(
    async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text);
      store.importConfig(json);
    },
    [store],
  );

  const importPoseConfigFromData = store.importConfig;

  const importPoseIr = useCallback(
    async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text);
      const { ir } = PoseIrService.normalize(json, store.standardInputs);
      store.importIr(ir);
    },
    [store],
  );

  const importPoseIrFromData = store.importIr;

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
          group: groupName ?? pose.group,
          values: newValues,
        };

        store.addPose(newPose);
      });

      return parsed.warnings;
    },
    [store, visibleStandardInputs, neutralInputs],
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
    crossGroupBlendMode,
    setCrossGroupBlendMode,
    rigKind,
    setRigKind,
    standardInputs: visibleStandardInputs,
    poses,
    createPoseGroup,
    renamePoseGroup,
    deletePoseGroup,
    setPoseGroupBlendMode,
    addPoseToGroup,
    removePoseFromGroup,
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
    poseIrFileName,
    setPoseIrFileName,
    poseConfigWarnings,
    poseDiagnostics,
    poseConfigDraft,
    poseIrDraft,
    importPoseConfig,
    importPoseConfigFromData,
    importPoseIr,
    importPoseIrFromData,
    importPoseGraphSpec,
    resetPoseState,
    poseLibrary,
  };
}

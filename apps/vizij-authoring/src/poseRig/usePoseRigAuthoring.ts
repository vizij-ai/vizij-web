import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseGraphSpec } from "./graphBuilder";
import {
  capturePoseSnapshot,
  createNeutralInputs,
  ensureNeutralDefaults,
  duplicatePoseDefinition,
} from "./utils";
import {
  buildPoseRigConfig,
  clonePoseDefinition,
  parsePoseRigConfig,
} from "./persistence";
import type {
  LowLevelRigSummary,
  PoseDefinition,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";

const NEUTRAL_POSE_ID = "__pose_rig_neutral__";
const DEFAULT_RIG_NAME = "pose_rig";
const EPSILON = 1e-8;
const ADD_INPUT_OFFSET = 1e-8;
const SLIDER_MIN_OFFSET = 1e-8;

function createPoseDefinition(name: string): PoseDefinition {
  const now = new Date().toISOString();
  return {
    id: `pose_${Math.random().toString(36).slice(2, 10)}`,
    name,
    description: "",
    values: {},
    createdAt: now,
    updatedAt: now,
  };
}

function updatePoseDefinition(
  pose: PoseDefinition,
  updates: Partial<PoseDefinition>,
): PoseDefinition {
  return {
    ...pose,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

function slugify(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function normalizePoseSnapshot(
  neutral: Record<string, number>,
  snapshot: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  Object.entries(snapshot).forEach(([inputId, value]) => {
    const neutralValue = neutral[inputId];
    if (neutralValue === undefined) {
      next[inputId] = value;
      return;
    }
    if (Math.abs(value - neutralValue) >= EPSILON) {
      next[inputId] = value;
    }
  });
  return next;
}

function clampToInputRange(
  input: StandardRigInput | undefined,
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return input?.defaultValue ?? 0;
  }
  if (!input) {
    return value;
  }
  const { min, max } = input.range;
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function sanitizePoseValues(options: {
  pose: PoseDefinition;
  standardInputsById: Map<string, StandardRigInput>;
  neutral: Record<string, number>;
}): PoseDefinition {
  const { pose, standardInputsById, neutral } = options;
  const sanitizedValues: Record<string, number> = {};
  Object.entries(pose.values).forEach(([inputId, value]) => {
    const input = standardInputsById.get(inputId);
    if (!input) {
      return;
    }
    const clamped = clampToInputRange(input, value);
    const neutralValue =
      neutral[inputId] ?? input.defaultValue ?? clampToInputRange(input, 0);
    if (Math.abs(clamped - neutralValue) < EPSILON) {
      return;
    }
    sanitizedValues[inputId] = clamped;
  });
  const originalEntries = Object.entries(pose.values).filter(([key]) =>
    standardInputsById.has(key),
  );
  const hasSameSize =
    originalEntries.length === Object.keys(sanitizedValues).length;
  const isUnchanged =
    hasSameSize &&
    originalEntries.every(([key, value]) => sanitizedValues[key] === value);
  if (isUnchanged) {
    return pose;
  }
  return updatePoseDefinition(clonePoseDefinition(pose), {
    values: sanitizedValues,
  });
}

export interface UsePoseRigAuthoringOptions {
  faceId: string | null;
  rootId: string | null;
  standardInputs: StandardRigInput[];
  inputValues: Record<StandardInputId, number>;
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
  resetPoseState: () => void;
  poseLibrary: PoseLibrarySummary;
}

export function usePoseRigAuthoring(
  options: UsePoseRigAuthoringOptions,
): UsePoseRigAuthoringResult {
  const {
    faceId,
    rootId,
    standardInputs,
    inputValues,
    onInputValueChange,
    applyInputBatch,
    lowLevelSummary,
  } = options;

  const ready = Boolean(rootId && standardInputs.length > 0);

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const [savedNeutral, setSavedNeutral] = useState<
    Record<StandardInputId, number>
  >(() => createNeutralInputs(standardInputs));
  const [poses, setPoses] = useState<PoseDefinition[]>([]);
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(
    NEUTRAL_POSE_ID,
  );
  const [rigName, setRigName] = useState<string>(DEFAULT_RIG_NAME);
  const [poseConfigWarnings, setPoseConfigWarnings] = useState<string[]>([]);
  const [lastImportedConfig, setLastImportedConfig] =
    useState<PoseRigConfigFile | null>(null);
  const [poseGraphFileName, setPoseGraphFileName] = useState<string>("");
  const [poseConfigFileName, setPoseConfigFileName] = useState<string>("");

  const neutralDefaultsRef = useRef<Record<StandardInputId, number>>(
    createNeutralInputs(standardInputs),
  );
  const rootRef = useRef<string | null>(rootId);
  const faceRef = useRef<string | null>(faceId);

  const poseGraphNameTouchedRef = useRef(false);
  const poseConfigNameTouchedRef = useRef(false);

  useEffect(() => {
    neutralDefaultsRef.current = createNeutralInputs(standardInputs);
  }, [standardInputs]);

  useEffect(() => {
    setSavedNeutral((prev) => {
      const next = ensureNeutralDefaults(prev, standardInputs);
      if (next !== prev) {
        console.warn("[poseRig] ensureNeutralDefaults applied", {
          inputCount: Object.keys(next).length,
          nonZero: Object.values(next).filter((v) => Math.abs(v) > 1e-6).length,
        });
      }
      return next;
    });
  }, [standardInputs]);

  useEffect(() => {
    const validIds = new Set(standardInputs.map((input) => input.id));
    if (validIds.size === 0) {
      console.warn(
        "[poseRig] standard inputs cleared temporarily, preserving neutral cache",
      );
      return;
    }
    setSavedNeutral((prev) => {
      const next: Record<StandardInputId, number> = {};
      let changed = false;
      Object.entries(prev).forEach(([inputId, value]) => {
        if (!validIds.has(inputId)) {
          changed = true;
          return;
        }
        next[inputId] = value;
      });
      return changed ? next : prev;
    });
    setPoses((prev) =>
      prev.map((pose) =>
        sanitizePoseValues({
          pose,
          standardInputsById,
          neutral: neutralDefaultsRef.current,
        }),
      ),
    );
  }, [standardInputs, standardInputsById]);

  const resetPoseState = useCallback(() => {
    setSavedNeutral(createNeutralInputs(standardInputs));
    console.warn("[poseRig] resetPoseState invoked", {
      inputCount: standardInputs.length,
    });
    setPoses([]);
    setSelectedPoseId(NEUTRAL_POSE_ID);
    setRigName(DEFAULT_RIG_NAME);
    setPoseConfigWarnings([]);
    setLastImportedConfig(null);
    poseGraphNameTouchedRef.current = false;
    poseConfigNameTouchedRef.current = false;
  }, [standardInputs]);

  useEffect(() => {
    const previousRootId = rootRef.current;
    const previousFaceId = faceRef.current;
    const faceChanged = previousFaceId !== faceId;
    const rootChanged = previousRootId !== rootId;
    if (faceChanged || rootChanged) {
      resetPoseState();
      rootRef.current = rootId;
      faceRef.current = faceId;
    }
  }, [faceId, rootId, resetPoseState]);

  useEffect(() => {
    if (poseGraphNameTouchedRef.current && poseConfigNameTouchedRef.current) {
      return;
    }
    const faceSlug = slugify(faceId, "face");
    const rigSlug = slugify(rigName, DEFAULT_RIG_NAME);
    const baseName = `${faceSlug}-${rigSlug}`;
    if (!poseGraphNameTouchedRef.current) {
      setPoseGraphFileName(`${baseName}.pose.graph.json`);
    }
    if (!poseConfigNameTouchedRef.current) {
      setPoseConfigFileName(`${baseName}.pose.config.json`);
    }
  }, [faceId, rigName]);

  const applyBatch = useCallback(
    (batch: Record<StandardInputId, number>) => {
      if (!batch || Object.keys(batch).length === 0) {
        return;
      }
      const filtered: Record<StandardInputId, number> = {};
      Object.entries(batch).forEach(([inputId, value]) => {
        if (standardInputsById.has(inputId)) {
          filtered[inputId] = value;
        }
      });
      if (Object.keys(filtered).length === 0) {
        return;
      }
      if (applyInputBatch) {
        applyInputBatch(filtered);
        return;
      }
      Object.entries(filtered).forEach(([inputId, value]) => {
        onInputValueChange(inputId, value);
      });
    },
    [applyInputBatch, onInputValueChange, standardInputsById],
  );

  const neutralBaseline = useMemo(() => {
    const defaults = neutralDefaultsRef.current;
    const merged: Record<StandardInputId, number> = { ...defaults };
    Object.entries(savedNeutral).forEach(([inputId, value]) => {
      if (standardInputsById.has(inputId)) {
        merged[inputId] = value;
      }
    });
    return merged;
  }, [savedNeutral, standardInputsById]);

  const selectedPose = useMemo(() => {
    if (!selectedPoseId || selectedPoseId === NEUTRAL_POSE_ID) {
      return null;
    }
    return poses.find((pose) => pose.id === selectedPoseId) ?? null;
  }, [poses, selectedPoseId]);

  const handleSetRigName = useCallback((value: string) => {
    setRigName(value.trim().length > 0 ? value : DEFAULT_RIG_NAME);
  }, []);

  const selectNeutral = useCallback(() => {
    setSelectedPoseId(NEUTRAL_POSE_ID);
  }, []);

  const selectPose = useCallback((poseId: string) => {
    setSelectedPoseId(poseId);
  }, []);

  const createPose = useCallback((name?: string) => {
    setPoses((prev) => {
      const trimmed = name?.trim();
      const label =
        trimmed && trimmed.length > 0 ? trimmed : `Pose ${prev.length + 1}`;
      const nextPose = createPoseDefinition(label);
      const next = [...prev, nextPose];
      setSelectedPoseId(nextPose.id);
      return next;
    });
  }, []);

  const createPoseFromSnapshot = useCallback(
    (name?: string) => {
      if (!ready) {
        return;
      }
      const snapshot = capturePoseSnapshot({
        inputs: standardInputs,
        currentValues: inputValues,
      });
      const normalized = normalizePoseSnapshot(neutralBaseline, snapshot);
      setPoses((prev) => {
        const trimmed = name?.trim();
        const poseName =
          trimmed && trimmed.length > 0 ? trimmed : `Pose ${prev.length + 1}`;
        const base = createPoseDefinition(poseName);
        const nextPose = updatePoseDefinition(base, { values: normalized });
        const next = [...prev, nextPose];
        setSelectedPoseId(nextPose.id);
        return next;
      });
    },
    [inputValues, neutralBaseline, ready, standardInputs],
  );

  const duplicatePose = useCallback(
    (poseId: string) => {
      const original = poses.find((pose) => pose.id === poseId);
      if (!original) {
        return;
      }
      const duplicate = duplicatePoseDefinition(original);
      setPoses((prev) => {
        const next = [...prev, duplicate];
        setSelectedPoseId(duplicate.id);
        return next;
      });
    },
    [poses],
  );

  const deletePose = useCallback((poseId: string) => {
    setPoses((prev) => {
      const next = prev.filter((pose) => pose.id !== poseId);
      setSelectedPoseId((current) => {
        if (current === poseId) {
          return next[0]?.id ?? NEUTRAL_POSE_ID;
        }
        return current;
      });
      return next;
    });
  }, []);

  const updatePoseById = useCallback(
    (
      poseId: string,
      updater: (pose: PoseDefinition) => PoseDefinition | null,
    ) => {
      setPoses((prev) =>
        prev.map((pose) => {
          if (pose.id !== poseId) {
            return pose;
          }
          const next = updater(pose);
          return next ?? pose;
        }),
      );
    },
    [],
  );

  const updatePoseName = useCallback(
    (poseId: string, name: string) => {
      updatePoseById(poseId, (pose) =>
        updatePoseDefinition(pose, { name: name.trim() || pose.name }),
      );
    },
    [updatePoseById],
  );

  const updatePoseDescription = useCallback(
    (poseId: string, description: string) => {
      updatePoseById(poseId, (pose) =>
        updatePoseDefinition(pose, { description }),
      );
    },
    [updatePoseById],
  );

  const capturePose = useCallback(
    (poseId: string) => {
      if (!ready) {
        return;
      }
      const snapshot = capturePoseSnapshot({
        inputs: standardInputs,
        currentValues: inputValues,
      });
      const normalized = normalizePoseSnapshot(neutralBaseline, snapshot);
      updatePoseById(poseId, (pose) =>
        updatePoseDefinition(pose, { values: normalized }),
      );
    },
    [inputValues, neutralBaseline, ready, standardInputs, updatePoseById],
  );

  const clearPose = useCallback(
    (poseId: string) => {
      updatePoseById(poseId, (pose) =>
        Object.keys(pose.values).length === 0
          ? pose
          : updatePoseDefinition(pose, { values: {} }),
      );
    },
    [updatePoseById],
  );

  const updatePoseValue = useCallback(
    (poseId: string, inputId: string, value: number) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        return;
      }
      const neutralValue = neutralBaseline[inputId] ?? input.defaultValue ?? 0;
      const clamped = clampToInputRange(input, value);
      const ensureOffset = (): number => {
        if (Math.abs(clamped - neutralValue) >= EPSILON) {
          return clamped;
        }
        const max = Number.isFinite(input.range.max)
          ? input.range.max
          : Number.POSITIVE_INFINITY;
        const min = Number.isFinite(input.range.min)
          ? input.range.min
          : Number.NEGATIVE_INFINITY;
        if (neutralValue + SLIDER_MIN_OFFSET <= max) {
          return clampToInputRange(input, neutralValue + SLIDER_MIN_OFFSET);
        }
        if (neutralValue - SLIDER_MIN_OFFSET >= min) {
          return clampToInputRange(input, neutralValue - SLIDER_MIN_OFFSET);
        }
        return clamped;
      };
      const adjusted = ensureOffset();
      updatePoseById(poseId, (pose) => {
        const nextValues = { ...pose.values };
        if (nextValues[inputId] === adjusted) {
          return pose;
        }
        nextValues[inputId] = adjusted;
        return updatePoseDefinition(pose, { values: nextValues });
      });
    },
    [neutralBaseline, standardInputsById, updatePoseById],
  );

  const addPoseInput = useCallback(
    (poseId: string, inputId: string) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        return;
      }
      const neutralValue = neutralBaseline[inputId] ?? input.defaultValue ?? 0;
      const currentValue =
        inputValues[inputId] ?? neutralBaseline[inputId] ?? neutralValue;
      const max = Number.isFinite(input.range.max)
        ? input.range.max
        : Number.POSITIVE_INFINITY;
      const min = Number.isFinite(input.range.min)
        ? input.range.min
        : Number.NEGATIVE_INFINITY;

      let target = currentValue;
      if (Math.abs(target - neutralValue) < EPSILON) {
        if (neutralValue + ADD_INPUT_OFFSET <= max) {
          target = neutralValue + ADD_INPUT_OFFSET;
        } else if (neutralValue - ADD_INPUT_OFFSET >= min) {
          target = neutralValue - ADD_INPUT_OFFSET;
        }
      }
      updatePoseValue(poseId, inputId, target);
    },
    [inputValues, neutralBaseline, standardInputsById, updatePoseValue],
  );

  const removePoseInput = useCallback(
    (poseId: string, inputId: string) => {
      updatePoseById(poseId, (pose) => {
        if (!(inputId in pose.values)) {
          return pose;
        }
        const nextValues = { ...pose.values };
        delete nextValues[inputId];
        return updatePoseDefinition(pose, { values: nextValues });
      });
    },
    [updatePoseById],
  );

  const captureNeutral = useCallback(() => {
    if (!ready) {
      return;
    }
    const snapshot = capturePoseSnapshot({
      inputs: standardInputs,
      currentValues: inputValues,
    });
    const next: Record<StandardInputId, number> = {};
    standardInputs.forEach((input) => {
      const value = snapshot[input.id];
      next[input.id] =
        clampToInputRange(
          input,
          value ?? input.defaultValue ?? neutralBaseline[input.id] ?? 0,
        ) ?? 0;
    });
    neutralDefaultsRef.current = { ...neutralDefaultsRef.current, ...next };
    setSavedNeutral(next);
  }, [inputValues, neutralBaseline, ready, standardInputs]);

  const applyNeutral = useCallback(() => {
    if (!ready) {
      return;
    }
    const batch: Record<StandardInputId, number> = {};
    standardInputs.forEach((input) => {
      batch[input.id] = neutralBaseline[input.id] ?? input.defaultValue ?? 0;
    });
    applyBatch(batch);
    setSelectedPoseId(NEUTRAL_POSE_ID);
  }, [applyBatch, neutralBaseline, ready, standardInputs]);

  const applyPose = useCallback(
    (poseId: string) => {
      if (!ready) {
        return;
      }
      const pose = poses.find((entry) => entry.id === poseId);
      if (!pose) {
        return;
      }
      const batch: Record<StandardInputId, number> = {};
      standardInputs.forEach((input) => {
        const value =
          pose.values[input.id] ??
          neutralBaseline[input.id] ??
          input.defaultValue ??
          0;
        batch[input.id] = value;
      });
      applyBatch(batch);
      setSelectedPoseId(poseId);
    },
    [applyBatch, neutralBaseline, poses, ready, standardInputs],
  );

  const updateCurrentValue = useCallback(
    (inputId: string, value: number) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        return;
      }
      const clamped = clampToInputRange(input, value);
      onInputValueChange(inputId, clamped);
    },
    [onInputValueChange, standardInputsById],
  );

  const poseGraphBuild = useMemo(() => {
    if (!ready) {
      return null;
    }
    const { spec, summary } = buildPoseGraphSpec({
      faceId,
      neutralInputs: neutralBaseline,
      poses,
      standardInputs,
    });
    return { spec, summary };
  }, [faceId, neutralBaseline, poses, ready, standardInputs]);

  const poseGraphSpec = poseGraphBuild?.spec ?? null;
  const poseGraphSummary = poseGraphBuild?.summary ?? null;

  const poseLibrary = useMemo<PoseLibrarySummary>(() => {
    const neutral: Record<string, number> = {};
    standardInputs.forEach((input) => {
      neutral[input.id] = neutralBaseline[input.id] ?? input.defaultValue ?? 0;
    });
    const poseEntries = poses.map((pose) => ({
      id: pose.id,
      name: pose.name || pose.id,
    }));
    return { neutral, poses: poseEntries };
  }, [neutralBaseline, poses, standardInputs]);

  const poseConfigDraft = useMemo(() => {
    if (!ready) {
      return null;
    }
    const sanitizedPoses = poses.map((pose) =>
      sanitizePoseValues({
        pose,
        standardInputsById,
        neutral: neutralBaseline,
      }),
    );
    return buildPoseRigConfig({
      faceId,
      neutralInputs: neutralBaseline,
      poses: sanitizedPoses,
      lowLevel: lowLevelSummary ?? null,
      previous: lastImportedConfig,
      title: rigName,
    });
  }, [
    faceId,
    lastImportedConfig,
    lowLevelSummary,
    neutralBaseline,
    poses,
    ready,
    rigName,
    standardInputsById,
  ]);

  const applyParsedPoseConfig = useCallback(
    (parsed: PoseRigConfigFile) => {
      const warnings: string[] = [];

      if (parsed.faceId && faceId && parsed.faceId !== faceId) {
        warnings.push(
          `Imported pose rig targets face "${parsed.faceId}", current face "${faceId}".`,
        );
      }

      const sanitizedNeutral = createNeutralInputs(standardInputs);
      Object.entries(parsed.neutralInputs).forEach(([inputId, value]) => {
        const input = standardInputsById.get(inputId);
        if (!input) {
          warnings.push(
            `Neutral value for missing input "${inputId}" was ignored.`,
          );
          return;
        }
        sanitizedNeutral[inputId] = clampToInputRange(input, value);
      });

      const sanitizedPoses = parsed.poses.map((pose) => {
        const nextValues: Record<string, number> = {};
        Object.entries(pose.values).forEach(([inputId, rawValue]) => {
          const input = standardInputsById.get(inputId);
          if (!input) {
            warnings.push(
              `Pose "${pose.name ?? pose.id}" references missing input "${inputId}" and was pruned.`,
            );
            return;
          }
          const numeric = clampToInputRange(input, rawValue);
          const neutralValue =
            sanitizedNeutral[inputId] ??
            input.defaultValue ??
            neutralDefaultsRef.current[inputId] ??
            0;
          if (Math.abs(numeric - neutralValue) < EPSILON) {
            return;
          }
          nextValues[inputId] = numeric;
        });
        return updatePoseDefinition(clonePoseDefinition(pose), {
          values: nextValues,
        });
      });

      neutralDefaultsRef.current = {
        ...neutralDefaultsRef.current,
        ...sanitizedNeutral,
      };
      setSavedNeutral(sanitizedNeutral);
      setPoses(sanitizedPoses);
      setSelectedPoseId(sanitizedPoses[0]?.id ?? NEUTRAL_POSE_ID);
      setRigName(parsed.title ?? DEFAULT_RIG_NAME);
      setPoseConfigWarnings(warnings);
      setLastImportedConfig(parsed);
      poseGraphNameTouchedRef.current = false;
      poseConfigNameTouchedRef.current = false;

      const batch: Record<StandardInputId, number> = {};
      standardInputs.forEach((input) => {
        batch[input.id] =
          sanitizedNeutral[input.id] ??
          input.defaultValue ??
          neutralDefaultsRef.current[input.id] ??
          0;
      });
      applyBatch(batch);

      if (warnings.length > 0) {
        console.warn("[vizij-authoring] Pose rig import warnings:", warnings);
      }
    },
    [
      applyBatch,
      faceId,
      setPoseConfigWarnings,
      setPoses,
      setRigName,
      setSavedNeutral,
      setSelectedPoseId,
      setLastImportedConfig,
      standardInputs,
      standardInputsById,
    ],
  );

  const importPoseConfig = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = parsePoseRigConfig(JSON.parse(text));
      applyParsedPoseConfig(parsed);
    },
    [applyParsedPoseConfig],
  );

  const importPoseConfigFromData = useCallback(
    (config: PoseRigConfigFile) => {
      const parsed = parsePoseRigConfig(config);
      applyParsedPoseConfig(parsed);
    },
    [applyParsedPoseConfig],
  );

  const readyState: UsePoseRigAuthoringResult = {
    ready,
    neutralInputs: neutralBaseline,
    savedNeutral,
    currentValues: inputValues,
    standardInputs,
    poses,
    selectedPoseId,
    selectedPose,
    isNeutralSelected: !selectedPoseId || selectedPoseId === NEUTRAL_POSE_ID,
    rigName,
    setRigName: handleSetRigName,
    selectNeutral,
    selectPose,
    createPose,
    createPoseFromSnapshot,
    duplicatePose,
    deletePose,
    updatePoseName,
    updatePoseDescription,
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
    setPoseGraphFileName: (value: string) => {
      poseGraphNameTouchedRef.current = true;
      setPoseGraphFileName(value);
    },
    poseConfigFileName,
    setPoseConfigFileName: (value: string) => {
      poseConfigNameTouchedRef.current = true;
      setPoseConfigFileName(value);
    },
    poseConfigWarnings,
    poseConfigDraft,
    importPoseConfig,
    importPoseConfigFromData,
    resetPoseState,
    poseLibrary,
  };

  return readyState;
}

export { NEUTRAL_POSE_ID, DEFAULT_RIG_NAME };

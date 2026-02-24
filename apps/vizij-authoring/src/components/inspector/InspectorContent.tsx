import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Trash2,
  Plus,
  Copy,
  Info,
  ChevronRight,
  Sliders,
  Palette,
  Box,
  Play,
  RotateCcw,
  Save,
} from "lucide-react";
import { normalizeStandardRigInputPath, SELF_BINDING_ID } from "@vizij/utils";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useSharedVariableSyncContext } from "../../state/SharedVariableSyncContext";
import { useSceneComposer } from "../../scene/useSceneComposer";
import type {
  SceneFeatureComponent,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { cn } from "../../utils/cn";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import { cleanLabel } from "../../utils/labels";
import { parsePoseWeightInputSourceId } from "../../poseRig/utils";
import { BindingEditor } from "../binding";
import { EmptyState } from "../ui/EmptyState";
import { resolveRigMetadataInputId } from "../../utils/rigElementInputs";
import { RiggingPropertyRow } from "./RiggingPropertyRow";
import { VariableSelector, type VariableSelection } from "./VariableSelector";
import { InspectorHeader } from "./InspectorHeader";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { FeatureList } from "./FeatureList";
import {
  RiggingMaterialSection,
  RiggingScalarRow,
  RiggingColorRow,
} from "./RiggingMaterialSection";
import {
  collectDirectDownstreamRigInputs,
  collectDirectRigDependents,
  collectRigDependents,
  type PoseRigSourceKind,
} from "./rigConnections";
import { resolveSelectionTargetIds } from "./bindingSelection";
import {
  classifyPoseParentBindingEmptyState,
  hasParentBindingInput,
  resolveRigDrivenSelection,
} from "./inspectorActions";
import { resolveControllableInputId } from "./bindingSlotResolution";
import {
  computePoseContributionSemantics,
  formatContributionStrength,
} from "./poseContributionSemantics";
import { resolvePosePropertySelectionInputIds } from "./poseTargetSelection";
import {
  appendOrRevisitInspectorChainPath,
  type InspectorChainNode,
} from "./inspectorChainPath";
import { resolveRigMetadataReactivity } from "./rigMetadataReactivity";

type PoseVariableItem = {
  varId: string;
  poseVal: number;
  drivenPropertyCount: number;
  drivenVariableCount: number;
};

type PoseVariableGroup = {
  key: string;
  label: string;
  items: PoseVariableItem[];
};

type PoseVariableBaseDefinition = {
  rawLabel: string;
  min: number;
  max: number;
  neutralVal: number;
  directDefaultValue: number;
  canInspectVariable: boolean;
  poseComposeMode: "add" | "average";
};

type PoseVariableRenderItem = PoseVariableItem & {
  label: string;
  min: number;
  max: number;
  directVal: number;
  poseDrivenVal: number;
  contributionStrength: number | null;
  contributionLabel: string;
  poseComposeMode: "add" | "average";
  canInspectVariable: boolean;
  chainSummary: string | null;
  directDefaultValue: number;
  poseDrivenPercent: number;
};

type PoseVariableRenderGroup = {
  key: string;
  label: string;
  items: PoseVariableRenderItem[];
};

type RigTraversalSummary = {
  downstreamConnections: ReturnType<typeof collectDirectDownstreamRigInputs>;
  downstreamInputs: ReturnType<typeof collectDirectDownstreamRigInputs>;
  downstreamAutorigInputs: ReturnType<typeof collectDirectDownstreamRigInputs>;
  directDependents: ReturnType<typeof collectDirectRigDependents>;
  dependents: ReturnType<typeof collectRigDependents>;
};

type RigLifecycleMessage = {
  tone: "error" | "info";
  text: string;
};

const EMPTY_RIG_TRAVERSAL_SUMMARY: RigTraversalSummary = {
  downstreamConnections: [],
  downstreamInputs: [],
  downstreamAutorigInputs: [],
  directDependents: [],
  dependents: [],
};

const POSE_VALUE_PRECISION_FORMAT = {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
} as const;

function extractComponentIdFromInputSourceId(
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) {
    return null;
  }
  const parts = sourceId.split(":");
  if (parts[0] !== "component" || parts.length < 5) {
    return null;
  }
  try {
    return decodeURIComponent(parts[4]);
  } catch {
    return parts[4] ?? null;
  }
}

function isCanonicalAutorigInputPath(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path).replace(
    /^\/rig\/[^/]+\//,
    "/",
  );
  return normalized.startsWith("/autorig/");
}

function collectBindingInputIds(
  binding:
    | { inputId?: string | null; slots?: Array<{ inputId?: string | null }> }
    | null
    | undefined,
): string[] {
  if (!binding) {
    return [];
  }
  const ids = new Set<string>();
  if (
    binding.inputId &&
    binding.inputId !== SELF_BINDING_ID &&
    binding.inputId.trim().length > 0
  ) {
    ids.add(binding.inputId);
  }
  (binding.slots ?? []).forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      ids.add(slot.inputId);
    }
  });
  return Array.from(ids);
}

function formatDraftNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return value;
  }
  if (max <= min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizePoseMembershipPath(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function InspectorContent() {
  const [showSelector, setShowSelector] = useState(false);
  const [showRigDriversModal, setShowRigDriversModal] = useState(false);
  const [blendAmount, setBlendAmount] = useState(0);
  const [sceneInspectorView, setSceneInspectorView] = useState<
    "quick" | "bindings"
  >("quick");

  const [rigInspectorView, setRigInspectorView] = useState<
    "quick" | "bindings"
  >("quick");
  const [showAutorigInternals, setShowAutorigInternals] = useState(false);
  const scrubValuesRef = useRef<Record<string, number>>({});
  const pendingSceneInspectorViewRef = useRef<"quick" | "bindings" | null>(
    null,
  );

  const pendingRigInspectorViewRef = useRef<"quick" | "bindings" | null>(null);
  const pendingChainNavigationRef = useRef<InspectorChainNode | null>(null);
  const [inspectorChainPath, setInspectorChainPath] = useState<
    InspectorChainNode[]
  >([]);
  const [focusedSceneBindingTargetId, setFocusedSceneBindingTargetId] =
    useState<string | null>(null);
  const [poseBindingEditorInputId, setPoseBindingEditorInputId] = useState<
    string | null
  >(null);
  const [rigDefaultDraft, setRigDefaultDraft] = useState("0");
  const [rigRangeMinDraft, setRigRangeMinDraft] = useState("-1");
  const [rigRangeMaxDraft, setRigRangeMaxDraft] = useState("1");
  const [rigLifecycleMessage, setRigLifecycleMessage] =
    useState<RigLifecycleMessage | null>(null);

  // Hooks
  const {
    selectedId,
    selectedPoseId,
    selectedRigId,
    selectedMaterialId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    inspectorMode,
  } = useUnifiedSelection();

  const {
    getNode,
    objects,
    materials,
    updateMaterialLabel,
    setAnimatableValue,
    updateAnimatableDescriptor,
    setStaticFeatureValue,
  } = useSceneComposer();

  const {
    poses,
    neutralInputs,
    duplicatePose,
    addPoseInput,
    updatePoseValue,
    removePoseInput,
    setPoseInputComposeMode,
    updatePoseName,
    updatePoseGroup,
    addPoseToGroup,
    removePoseFromGroup,
    poseConfigDraft,
    poseDiagnostics,
    poseGraphSpec,
  } = usePoseRig();

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const bindings = useBindingAuthoring((state) => state.bindings);
  const bindingIssues = useBindingAuthoring((state) => state.bindingIssues);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleDeleteCustomStandardInput = useBindingAuthoring(
    (state) => state.handleDeleteCustomStandardInput,
  );
  const handleRenameShape = useBindingAuthoring(
    (state) => state.handleRenameShape,
  );
  const handleBindingInputChange = useBindingAuthoring(
    (state) => state.handleBindingInputChange,
  );
  const handleEnsureParentBinding = useBindingAuthoring(
    (state) => state.handleEnsureParentBinding,
  );
  const handleParentBindingInputChange = useBindingAuthoring(
    (state) => state.handleParentBindingInputChange,
  );
  const handleParentAddBindingSlot = useBindingAuthoring(
    (state) => state.handleParentAddBindingSlot,
  );
  const handleParentRemoveBindingSlot = useBindingAuthoring(
    (state) => state.handleParentRemoveBindingSlot,
  );
  const handleParentBindingExpressionChange = useBindingAuthoring(
    (state) => state.handleParentBindingExpressionChange,
  );
  const handleParentBindingSlotAliasChange = useBindingAuthoring(
    (state) => state.handleParentBindingSlotAliasChange,
  );
  const handleParentBindingSlotValueTypeChange = useBindingAuthoring(
    (state) => state.handleParentBindingSlotValueTypeChange,
  );
  const handleParentResetBinding = useBindingAuthoring(
    (state) => state.handleParentResetBinding,
  );
  const handleEnableParentLocalControl = useBindingAuthoring(
    (state) => state.handleEnableParentLocalControl,
  );
  const handleCreateParentDriverBinding = useBindingAuthoring(
    (state) => state.handleCreateParentDriverBinding,
  );
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const resolvedSelectedRigId = useMemo(() => {
    if (!selectedRigId) {
      return null;
    }
    return resolveRigMetadataInputId(selectedRigId, standardInputsById);
  }, [selectedRigId, standardInputsById]);
  const selectedManagedRigEntry = useMemo(() => {
    if (!resolvedSelectedRigId) {
      return null;
    }
    return (
      managedStandardInputs.find(
        (entry) => entry.input.id === resolvedSelectedRigId,
      ) ?? null
    );
  }, [managedStandardInputs, resolvedSelectedRigId]);
  const autorigInputIdByComponentId = useMemo(() => {
    type Candidate = {
      inputId: string;
      resolvedInputId: string;
      canonicalAutorig: boolean;
      autoSource: boolean;
    };

    const sourceByInputId = new Map<string, "auto" | "custom">();
    const candidatesByComponent = new Map<string, Candidate[]>();
    managedStandardInputs.forEach((entry) => {
      const resolvedInputId = resolveRigMetadataInputId(
        entry.input.id,
        standardInputsById,
      );
      sourceByInputId.set(entry.input.id, entry.source);
      if (!sourceByInputId.has(resolvedInputId) || entry.source === "auto") {
        sourceByInputId.set(resolvedInputId, entry.source);
      }
      const componentId =
        entry.metadata?.componentId ??
        extractComponentIdFromInputSourceId(entry.input.sourceId);
      if (!componentId) {
        return;
      }
      const resolvedInput =
        standardInputsById.get(resolvedInputId) ?? entry.input;
      const candidate: Candidate = {
        inputId: entry.input.id,
        resolvedInputId,
        canonicalAutorig: isCanonicalAutorigInputPath(resolvedInput.path),
        autoSource: entry.source === "auto",
      };
      const existing = candidatesByComponent.get(componentId);
      if (existing) {
        existing.push(candidate);
      } else {
        candidatesByComponent.set(componentId, [candidate]);
      }
    });

    const rankCandidate = (candidate: Candidate): number => {
      let rank = 0;
      if (candidate.canonicalAutorig) {
        rank += 10;
      }
      if (candidate.autoSource) {
        rank += 1;
      }
      return rank;
    };

    const candidateFromInputId = (inputId: string): Candidate | null => {
      const resolvedInputId = resolveRigMetadataInputId(
        inputId,
        standardInputsById,
      );
      const resolvedInput =
        standardInputsById.get(resolvedInputId) ??
        standardInputsById.get(inputId);
      if (!resolvedInput) {
        return null;
      }
      const source =
        sourceByInputId.get(inputId) ?? sourceByInputId.get(resolvedInputId);
      return {
        inputId,
        resolvedInputId,
        canonicalAutorig: isCanonicalAutorigInputPath(resolvedInput.path),
        autoSource: source === "auto",
      };
    };

    const selected = new Map<string, string>();
    const componentIds = new Set<string>([
      ...candidatesByComponent.keys(),
      ...Object.keys(bindings),
    ]);

    componentIds.forEach((componentId) => {
      const candidates = candidatesByComponent.get(componentId) ?? [];
      const componentBinding = bindings[componentId];
      const activeBindingInputIds = collectBindingInputIds(componentBinding);
      const activeBindingInputIdSet = new Set(activeBindingInputIds);
      const activeResolvedInputIdSet = new Set(
        activeBindingInputIds.map((id) =>
          resolveRigMetadataInputId(id, standardInputsById),
        ),
      );

      const directActiveAutorigCandidate = activeBindingInputIds
        .map((id) => candidateFromInputId(id))
        .find((candidate) => candidate?.canonicalAutorig);
      if (directActiveAutorigCandidate) {
        selected.set(componentId, directActiveAutorigCandidate.resolvedInputId);
        return;
      }

      const exactActiveCandidate = candidates.find(
        (candidate) =>
          activeBindingInputIdSet.has(candidate.inputId) ||
          activeBindingInputIdSet.has(candidate.resolvedInputId),
      );
      if (exactActiveCandidate) {
        selected.set(componentId, exactActiveCandidate.resolvedInputId);
        return;
      }
      const activeCandidate = candidates.find((candidate) =>
        activeResolvedInputIdSet.has(candidate.resolvedInputId),
      );
      if (activeCandidate) {
        selected.set(componentId, activeCandidate.resolvedInputId);
        return;
      }

      const preferred = [...candidates].sort(
        (left, right) =>
          rankCandidate(right) - rankCandidate(left) ||
          left.resolvedInputId.localeCompare(right.resolvedInputId),
      )[0];
      if (preferred) {
        selected.set(componentId, preferred.resolvedInputId);
      }
    });

    return selected;
  }, [bindings, managedStandardInputs, standardInputsById]);
  const referenceFace = useReferenceFace();
  const {
    policy: sharedSyncPolicy,
    linksByMainInputId,
    conflictsByPath: sharedSyncConflictsByPath,
    resolveConflict: resolveSharedSyncConflict,
    dismissConflict: dismissSharedSyncConflict,
  } = useSharedVariableSyncContext();

  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const graphError = useGraphRuntime((state) => state.graphError);
  const graphWarning = useGraphRuntime((state) => state.graphWarning);
  const bindingIssueCount = useMemo(
    () =>
      Array.from(bindingIssues.values()).reduce(
        (count, issues) => count + issues.length,
        0,
      ),
    [bindingIssues],
  );

  const poseWeightInputIdByPoseId = useMemo(() => {
    const map = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const poseId = parsePoseWeightInputSourceId(entry.input.sourceId);
      if (!poseId || map.has(poseId)) {
        return;
      }
      map.set(poseId, entry.input.id);
    });
    return map;
  }, [managedStandardInputs]);

  const selectedPoseWeightInputId =
    selectedPoseId && poseWeightInputIdByPoseId.has(selectedPoseId)
      ? (poseWeightInputIdByPoseId.get(selectedPoseId) ?? null)
      : null;

  const selectedPoseWeightValue = useMemo(() => {
    if (!selectedPoseWeightInputId) {
      return 0;
    }
    const stored = inputValues[selectedPoseWeightInputId];
    if (typeof stored !== "number" || !Number.isFinite(stored)) {
      return 0;
    }
    return Math.max(0, Math.min(1, stored));
  }, [inputValues, selectedPoseWeightInputId]);

  const usePoseWeightPreview = Boolean(
    poseGraphSpec && selectedPoseWeightInputId,
  );

  // Reset blend amount when selected pose changes
  useEffect(() => {
    if (inspectorMode !== "pose" || !selectedPoseId) {
      setBlendAmount(0);
      return;
    }
    if (usePoseWeightPreview) {
      setBlendAmount(selectedPoseWeightValue);
      return;
    }
    setBlendAmount(0);
  }, [
    inspectorMode,
    selectedPoseId,
    selectedPoseWeightValue,
    usePoseWeightPreview,
  ]);

  useEffect(() => {
    if (inspectorMode !== "scene") {
      return;
    }
    const nextView = pendingSceneInspectorViewRef.current;
    if (nextView) {
      setSceneInspectorView(nextView);
      pendingSceneInspectorViewRef.current = null;
      return;
    }
    setSceneInspectorView("quick");
  }, [inspectorMode, selectedId, selectedMaterialId]);

  useEffect(() => {
    if (inspectorMode !== "rig" || !resolvedSelectedRigId) {
      setShowRigDriversModal(false);
      return;
    }
    const nextView = pendingRigInspectorViewRef.current;
    if (nextView) {
      setRigInspectorView(nextView);
      setShowRigDriversModal(nextView === "bindings");
      pendingRigInspectorViewRef.current = null;
      return;
    }
    setRigInspectorView("quick");
    setShowRigDriversModal(false);
  }, [inspectorMode, resolvedSelectedRigId]);

  useEffect(() => {
    if (inspectorMode !== "pose" || !selectedPoseId) {
      setPoseBindingEditorInputId(null);
    }
  }, [inspectorMode, selectedPoseId]);

  useEffect(() => {
    if (inspectorMode !== "rig" || !selectedManagedRigEntry) {
      setRigLifecycleMessage(null);
      return;
    }
    const { input } = selectedManagedRigEntry;
    setRigDefaultDraft(formatDraftNumber(input.defaultValue ?? 0));
    setRigRangeMinDraft(formatDraftNumber(input.range.min ?? -1));
    setRigRangeMaxDraft(formatDraftNumber(input.range.max ?? 1));
    setRigLifecycleMessage(null);
  }, [inspectorMode, selectedManagedRigEntry]);

  const targetOwnerById = useMemo(() => {
    const targetOwners = new Map<string, string>();
    objects.forEach((objectNode) => {
      objectNode.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) {
            return;
          }
          targetOwners.set(component.targetId, objectNode.id);
        });
      });
    });
    return targetOwners;
  }, [objects]);
  const animatableTargetIdSet = useMemo(
    () => new Set(targetOwnerById.keys()),
    [targetOwnerById],
  );
  const componentIdByInputId = useMemo(() => {
    const mapping = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const componentId =
        entry.metadata?.componentId ??
        extractComponentIdFromInputSourceId(entry.input.sourceId);
      if (!componentId) {
        return;
      }
      mapping.set(entry.input.id, componentId);
      const resolvedInputId = resolveRigMetadataInputId(
        entry.input.id,
        standardInputsById,
      );
      mapping.set(resolvedInputId, componentId);
    });
    return mapping;
  }, [managedStandardInputs, standardInputsById]);
  const resolveAnimatablePropertyTargetIds = (
    targetIds: readonly string[],
  ): string[] => {
    const canonical = new Set<string>();
    targetIds.forEach((targetId) => {
      if (!targetId) {
        return;
      }
      const resolvedTargetId = componentIdByInputId.get(targetId) ?? targetId;
      if (animatableTargetIdSet.has(resolvedTargetId)) {
        canonical.add(resolvedTargetId);
      }
    });
    return Array.from(canonical);
  };
  const matchesRigInputId = (
    candidateId: string | null | undefined,
    rigInputId: string,
  ): boolean => {
    if (!candidateId) {
      return false;
    }
    if (candidateId === rigInputId) {
      return true;
    }
    return (
      resolveRigMetadataInputId(candidateId, standardInputsById) ===
      resolveRigMetadataInputId(rigInputId, standardInputsById)
    );
  };

  const scopedPoseDiagnostics = useMemo(() => {
    if (poseDiagnostics.length === 0) {
      return [];
    }
    if (inspectorMode === "pose" && selectedPoseId) {
      return poseDiagnostics.filter((diagnostic) => {
        const poseId = diagnostic.location?.poseId;
        return !poseId || poseId === selectedPoseId;
      });
    }
    if (inspectorMode === "rig" && resolvedSelectedRigId) {
      return poseDiagnostics.filter((diagnostic) => {
        const inputId = diagnostic.location?.inputId;
        if (!inputId) {
          return true;
        }
        return (
          resolveRigMetadataInputId(inputId, standardInputsById) ===
          resolveRigMetadataInputId(resolvedSelectedRigId, standardInputsById)
        );
      });
    }
    return poseDiagnostics;
  }, [
    poseDiagnostics,
    inspectorMode,
    selectedPoseId,
    resolvedSelectedRigId,
    standardInputsById,
  ]);

  const scopedPoseDiagnosticSummary = useMemo(() => {
    const errors = scopedPoseDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    const warnings = scopedPoseDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    );
    const info = scopedPoseDiagnostics.filter(
      (diagnostic) => diagnostic.severity === "info",
    );
    return {
      errors,
      warnings,
      info,
    };
  }, [scopedPoseDiagnostics]);

  const targetLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    objects.forEach((objectNode) => {
      objectNode.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) {
            return;
          }
          const componentLabel =
            component.label?.trim() || component.componentKey || "Value";
          labels.set(
            component.targetId,
            `${objectNode.name} · ${feature.label} ${componentLabel}`,
          );
        });
      });
    });
    return labels;
  }, [objects]);

  const sceneNodeById = useMemo(
    () => new Map(objects.map((objectNode) => [objectNode.id, objectNode])),
    [objects],
  );

  const rigInputById = useMemo(
    () =>
      new Map(
        managedStandardInputs.map((entry) => [entry.input.id, entry.input]),
      ),
    [managedStandardInputs],
  );

  const poseById = useMemo(
    () => new Map(poses.map((pose) => [pose.id, pose])),
    [poses],
  );
  const selectedPose = useMemo(() => {
    if (!selectedPoseId) {
      return null;
    }
    return poseById.get(selectedPoseId) ?? null;
  }, [poseById, selectedPoseId]);
  const standardInputList = useMemo(
    () => managedStandardInputs.map((entry) => entry.input),
    [managedStandardInputs],
  );
  const poseBindingTargetByInputId = useMemo(() => {
    const mapping = new Map<
      string,
      {
        objectId: string;
        objectName: string;
      }
    >();
    if (inspectorMode !== "pose") {
      return mapping;
    }
    Object.entries(bindings).forEach(([targetId, binding]) => {
      const objectId = targetOwnerById.get(targetId);
      if (!objectId) {
        return;
      }
      const objectName = sceneNodeById.get(objectId)?.name || objectId;
      const inputIds = new Set<string>();
      if (binding.inputId) {
        inputIds.add(binding.inputId);
      }
      (binding.slots ?? []).forEach((slot) => {
        if (slot.inputId) {
          inputIds.add(slot.inputId);
        }
      });
      inputIds.forEach((inputId) => {
        if (!mapping.has(inputId)) {
          mapping.set(inputId, { objectId, objectName });
        }
      });
    });
    return mapping;
  }, [bindings, inspectorMode, sceneNodeById, targetOwnerById]);
  const poseConnectionCountsByInputId = useMemo(() => {
    const counts = new Map<
      string,
      { drivenPropertyCount: number; drivenVariableCount: number }
    >();
    if (inspectorMode !== "pose" || !selectedPose) {
      return counts;
    }
    const inputIds = new Set<string>(Object.keys(selectedPose.values));
    if (poseBindingEditorInputId) {
      inputIds.add(poseBindingEditorInputId);
    }
    inputIds.forEach((inputId) => {
      counts.set(inputId, {
        drivenPropertyCount: collectRigDependents({
          selectedRigId: inputId,
          bindings,
          inputBindings,
          objects,
          standardInputsById,
        }).length,
        drivenVariableCount: collectDirectDownstreamRigInputs({
          selectedRigId: inputId,
          inputBindings,
          standardInputsById,
        }).length,
      });
    });
    return counts;
  }, [
    bindings,
    inputBindings,
    inspectorMode,
    objects,
    poseBindingEditorInputId,
    selectedPose,
    standardInputsById,
  ]);
  const groupedPoseVariables = useMemo<PoseVariableGroup[]>(() => {
    if (inspectorMode !== "pose" || !selectedPose) {
      return [];
    }
    const groups = new Map<string, PoseVariableGroup>();
    Object.entries(selectedPose.values).forEach(([varId, poseVal]) => {
      const inputDef = rigInputById.get(varId);
      const featureInfo = poseBindingTargetByInputId.get(varId) ?? null;
      let groupKey = "Unassigned";
      let groupLabel = "Unassigned";

      if (featureInfo) {
        groupKey = `obj:${featureInfo.objectId} `;
        groupLabel = featureInfo.objectName;
      } else if (inputDef?.group) {
        groupKey = `group:${inputDef.group} `;
        groupLabel = inputDef.group;
      }

      const connectionCounts = poseConnectionCountsByInputId.get(varId);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          items: [],
        });
      }
      groups.get(groupKey)!.items.push({
        varId,
        poseVal,
        drivenPropertyCount: connectionCounts?.drivenPropertyCount ?? 0,
        drivenVariableCount: connectionCounts?.drivenVariableCount ?? 0,
      });
    });
    return Array.from(groups.values()).sort((left, right) => {
      if (left.label === "Unassigned") {
        return 1;
      }
      if (right.label === "Unassigned") {
        return -1;
      }
      return left.label.localeCompare(right.label);
    });
  }, [
    inspectorMode,
    poseBindingTargetByInputId,
    poseConnectionCountsByInputId,
    rigInputById,
    selectedPose,
  ]);
  const poseVariableBaseById = useMemo(() => {
    const baseById = new Map<string, PoseVariableBaseDefinition>();
    if (inspectorMode !== "pose" || !selectedPose) {
      return baseById;
    }
    Object.keys(selectedPose.values).forEach((varId) => {
      const inputDef = rigInputById.get(varId);
      const min = inputDef?.range?.min ?? -1;
      const max = inputDef?.range?.max ?? 1;
      const fallbackDefault = standardInputsById.get(varId)?.defaultValue;
      const neutralVal =
        typeof neutralInputs[varId] === "number" &&
        Number.isFinite(neutralInputs[varId])
          ? neutralInputs[varId]
          : typeof fallbackDefault === "number" &&
              Number.isFinite(fallbackDefault)
            ? fallbackDefault
            : 0;
      const directDefaultValue = Number.isFinite(inputDef?.defaultValue)
        ? (inputDef?.defaultValue ?? neutralVal)
        : neutralVal;
      baseById.set(varId, {
        rawLabel: inputDef?.label || varId,
        min,
        max,
        neutralVal,
        directDefaultValue,
        canInspectVariable: standardInputsById.has(varId),
        poseComposeMode: selectedPose.composeModes?.[varId] ?? "add",
      });
    });
    return baseById;
  }, [
    inspectorMode,
    neutralInputs,
    rigInputById,
    selectedPose,
    standardInputsById,
  ]);
  const poseVariableRenderGroups = useMemo<PoseVariableRenderGroup[]>(() => {
    if (inspectorMode !== "pose" || !selectedPose) {
      return [];
    }
    const activePoseWeight = usePoseWeightPreview
      ? selectedPoseWeightValue
      : blendAmount;
    return groupedPoseVariables.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.map((item) => {
        const base = poseVariableBaseById.get(item.varId) ?? {
          rawLabel: item.varId,
          min: -1,
          max: 1,
          neutralVal: 0,
          directDefaultValue: 0,
          canInspectVariable: standardInputsById.has(item.varId),
          poseComposeMode: "add" as const,
        };
        const staged = inputValues[item.varId];
        const directVal =
          typeof staged === "number" && Number.isFinite(staged)
            ? staged
            : base.neutralVal;
        const interpolated =
          base.neutralVal +
          (item.poseVal - base.neutralVal) * clamp01(activePoseWeight);
        const poseDrivenVal = clampToRange(interpolated, base.min, base.max);
        const contributionStrength = computePoseContributionSemantics({
          targetValue: item.poseVal,
          appliedValue: poseDrivenVal,
          neutralValue: base.neutralVal,
        }).contributionStrength;
        return {
          ...item,
          label: cleanLabel(base.rawLabel, group.label),
          min: base.min,
          max: base.max,
          directVal,
          poseDrivenVal,
          contributionStrength,
          contributionLabel: formatContributionStrength(contributionStrength),
          poseComposeMode: base.poseComposeMode,
          canInspectVariable: base.canInspectVariable,
          chainSummary:
            item.drivenVariableCount > 0 || item.drivenPropertyCount > 0
              ? `${item.drivenVariableCount} vars · ${item.drivenPropertyCount} props`
              : null,
          directDefaultValue: base.directDefaultValue,
          poseDrivenPercent:
            base.max > base.min
              ? clamp01((poseDrivenVal - base.min) / (base.max - base.min)) *
                100
              : 0,
        };
      }),
    }));
  }, [
    blendAmount,
    groupedPoseVariables,
    inputValues,
    inspectorMode,
    poseVariableBaseById,
    selectedPose,
    selectedPoseWeightValue,
    standardInputsById,
    usePoseWeightPreview,
  ]);
  const selectedRigTraversal = useMemo<RigTraversalSummary>(() => {
    if (inspectorMode !== "rig" || !resolvedSelectedRigId) {
      return EMPTY_RIG_TRAVERSAL_SUMMARY;
    }
    const downstreamConnections = collectDirectDownstreamRigInputs({
      selectedRigId: resolvedSelectedRigId,
      inputBindings,
      standardInputsById,
      includeAutorig: true,
    });
    return {
      downstreamConnections,
      downstreamInputs: downstreamConnections.filter(
        (entry) => entry.layer === "rig",
      ),
      downstreamAutorigInputs: downstreamConnections.filter(
        (entry) => entry.layer === "autorig",
      ),
      directDependents: collectDirectRigDependents({
        selectedRigId: resolvedSelectedRigId,
        bindings,
        objects,
        standardInputsById,
      }),
      dependents: collectRigDependents({
        selectedRigId: resolvedSelectedRigId,
        bindings,
        inputBindings,
        objects,
        standardInputsById,
      }),
    };
  }, [
    bindings,
    inspectorMode,
    inputBindings,
    objects,
    resolvedSelectedRigId,
    standardInputsById,
  ]);

  const currentInspectorChainNode = useMemo(() => {
    if (inspectorMode === "scene" && selectedId) {
      const sceneNode = sceneNodeById.get(selectedId);
      return {
        mode: "scene" as const,
        id: selectedId,
        label: sceneNode?.name || selectedId,
        view: sceneInspectorView,
      };
    }
    if (inspectorMode === "rig" && resolvedSelectedRigId) {
      const rig = rigInputById.get(resolvedSelectedRigId);
      return {
        mode: "rig" as const,
        id: resolvedSelectedRigId,
        label: rig?.label || resolvedSelectedRigId,
        view: rigInspectorView,
      };
    }
    if (inspectorMode === "pose" && selectedPoseId) {
      const pose = poseById.get(selectedPoseId);
      return {
        mode: "pose" as const,
        id: selectedPoseId,
        label: pose?.name || selectedPoseId,
      };
    }
    return null;
  }, [
    inspectorMode,
    poseById,
    rigInputById,
    rigInspectorView,
    sceneInspectorView,
    sceneNodeById,
    selectedId,
    selectedPoseId,
    resolvedSelectedRigId,
  ]);

  useEffect(() => {
    if (!currentInspectorChainNode) {
      pendingChainNavigationRef.current = null;
      setInspectorChainPath([]);
      return;
    }
    const pending = pendingChainNavigationRef.current;
    if (
      pending &&
      pending.mode === currentInspectorChainNode.mode &&
      pending.id === currentInspectorChainNode.id
    ) {
      setInspectorChainPath((current) => {
        return appendOrRevisitInspectorChainPath(
          current,
          currentInspectorChainNode,
        );
      });
      pendingChainNavigationRef.current = null;
      return;
    }
    pendingChainNavigationRef.current = null;
    setInspectorChainPath((current) => {
      if (current.length === 0) {
        return [currentInspectorChainNode];
      }
      const lastEntry = current[current.length - 1];
      if (
        lastEntry.mode === currentInspectorChainNode.mode &&
        lastEntry.id === currentInspectorChainNode.id
      ) {
        const next = [...current];
        next[next.length - 1] = currentInspectorChainNode;
        return next;
      }
      return [currentInspectorChainNode];
    });
  }, [currentInspectorChainNode]);

  useEffect(() => {
    if (inspectorMode !== "scene" || sceneInspectorView !== "bindings") {
      setFocusedSceneBindingTargetId(null);
      return;
    }
    if (!selectedId || !focusedSceneBindingTargetId) {
      return;
    }
    const selectedNode = sceneNodeById.get(selectedId);
    const hasTarget =
      selectedNode?.features.some((feature: SceneObjectFeature) =>
        feature.components.some(
          (component: SceneFeatureComponent) =>
            component.targetId === focusedSceneBindingTargetId,
        ),
      ) ?? false;
    if (!hasTarget) {
      setFocusedSceneBindingTargetId(null);
    }
  }, [
    focusedSceneBindingTargetId,
    inspectorMode,
    sceneInspectorView,
    sceneNodeById,
    selectedId,
  ]);

  const navigateWithChain = (
    node: InspectorChainNode,
    navigate: () => void,
  ) => {
    pendingChainNavigationRef.current = node;
    navigate();
  };

  const renderChainPath = () => {
    if (inspectorChainPath.length <= 1) {
      return null;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap px-1 py-0.5 mb-1">
        <span className="text-[9px] uppercase tracking-wider font-bold text-text-muted">
          Chain
        </span>
        {inspectorChainPath.map((entry, index) => {
          const isLast = index === inspectorChainPath.length - 1;
          return (
            <React.Fragment key={`${entry.mode}:${entry.id}:${index}`}>
              <button
                type="button"
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                  isLast
                    ? "border-accent/40 text-accent bg-accent/10 cursor-default"
                    : "border-border-default/40 text-text-secondary hover:text-text-primary hover:border-border-default",
                )}
                disabled={isLast}
                onClick={() => {
                  setInspectorChainPath((current) =>
                    current.slice(0, index + 1),
                  );
                  pendingChainNavigationRef.current = entry;
                  if (entry.mode === "scene") {
                    pendingSceneInspectorViewRef.current =
                      entry.view === "bindings" ? "bindings" : "quick";

                    setFocusedSceneBindingTargetId(entry.targetId ?? null);
                    handleSelectObject(entry.id);
                    return;
                  }
                  if (entry.mode === "rig") {
                    pendingRigInspectorViewRef.current =
                      entry.view === "bindings" ? "bindings" : "quick";
                    handleSelectRig(entry.id);
                    return;
                  }
                  handleSelectPose(entry.id);
                }}
              >
                {entry.label}
              </button>
              {!isLast && (
                <ChevronRight size={10} className="text-text-muted/70" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderAuthoringStatus = () => {
    const statusTone =
      graphStatus === "ready"
        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
        : graphStatus === "loading"
          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
          : graphStatus === "error"
            ? "text-red-300 border-red-500/40 bg-red-500/10"
            : "text-text-muted border-border-default/50 bg-bg-panel/30";
    return (
      <div className="flex items-center gap-1.5 flex-wrap px-1 py-0.5 mb-1">
        <span
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
            statusTone,
          )}
        >
          Compile {graphStatus}
        </span>
        {graphWarning ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 truncate max-w-[260px]">
            {graphWarning}
          </span>
        ) : null}
        {graphError ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-200 truncate max-w-[260px]">
            {graphError}
          </span>
        ) : null}
        {scopedPoseDiagnosticSummary.errors.length > 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-200">
            Pose diagnostics errors {scopedPoseDiagnosticSummary.errors.length}
          </span>
        ) : null}
        {scopedPoseDiagnosticSummary.warnings.length > 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200">
            Pose diagnostics warnings{" "}
            {scopedPoseDiagnosticSummary.warnings.length}
          </span>
        ) : null}
        {scopedPoseDiagnostics.length > 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-border-default/50 bg-bg-panel/30 text-text-muted truncate max-w-[340px]">
            [{scopedPoseDiagnostics[0]?.code}]{" "}
            {scopedPoseDiagnostics[0]?.message}
          </span>
        ) : null}
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-border-default/50 bg-bg-panel/30 text-text-muted">
          Binding issues {bindingIssueCount}
        </span>
      </div>
    );
  };

  const openSceneBindingInspector = (targetId: string) => {
    const objectId = targetOwnerById.get(targetId);
    if (!objectId) {
      return;
    }
    const objectNode = sceneNodeById.get(objectId);
    setFocusedSceneBindingTargetId(targetId);
    pendingSceneInspectorViewRef.current = "bindings";
    navigateWithChain(
      {
        mode: "scene",
        id: objectId,
        label: objectNode?.name || objectId,
        view: "bindings",
        targetId,
      },
      () => handleSelectObject(objectId),
    );
  };

  const openPoseInspector = (poseId: string) => {
    const pose = poseById.get(poseId);
    navigateWithChain(
      {
        mode: "pose",
        id: poseId,
        label: pose?.name || poseId,
      },
      () => handleSelectPose(poseId),
    );
  };

  const openRigInspector = (
    rigId: string,
    view: "quick" | "bindings" = "quick",
  ) => {
    const rig = rigInputById.get(rigId);
    pendingRigInspectorViewRef.current = view;
    navigateWithChain(
      {
        mode: "rig",
        id: rigId,
        label: rig?.label || rigId,
        view,
      },
      () => handleSelectRig(rigId),
    );
  };

  const openRigFromChainSource = (
    rigId: string,
    sourceKind?: PoseRigSourceKind,
  ) => {
    const view: "quick" | "bindings" =
      sourceKind === "pose-group-output" ||
      sourceKind === "pose-aggregate-output"
        ? "bindings"
        : "quick";
    openRigInspector(rigId, view);
  };

  const handleRequestCreateStandardInput = (suggestedPath?: string) => {
    const response = promptDialog(
      "Enter the rig path for the new standard input (e.g., /eyes/blink)",
      suggestedPath ?? "/",
    );
    if (response === null) {
      return null;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      alertDialog("Path cannot be empty.");
      return null;
    }
    return handleCreateCustomStandardInput(trimmed);
  };

  // 1. Scene Object Mode
  if (inspectorMode === "scene" && selectedId) {
    const node = getNode(selectedId);
    if (node) {
      return (
        <div className="flex flex-col gap-1 p-1">
          <InspectorHeader
            name={node.name || node.id}
            typeLabel={node.type}
            id={node.id}
            onNameChange={(name) => handleRenameShape(node.id, name)}
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          <div className="flex items-center gap-1 px-1 py-1">
            <Button
              variant={sceneInspectorView === "quick" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSceneInspectorView("quick")}
            >
              Quick
            </Button>

            <Button
              variant={
                sceneInspectorView === "bindings" ? "secondary" : "ghost"
              }
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSceneInspectorView("bindings")}
            >
              My Drivers
            </Button>
          </div>
          {sceneInspectorView === "quick" ? (
            <>
              <RiggingTransformSection node={node} />

              <RiggingMorphTargetsSection node={node} />
              <RiggingMaterialSection node={node} />
              <BindingConnections
                node={node}
                onSelectPose={openPoseInspector}
                onSelectRig={openRigFromChainSource}
                onSelectTarget={openSceneBindingInspector}
              />
            </>
          ) : (
            <FeatureList
              node={node}
              mode="bindings"
              focusedTargetId={focusedSceneBindingTargetId}
            />
          )}
        </div>
      );
    }
  }

  // 2. Pose Mode
  if (inspectorMode === "pose" && selectedPose) {
    const pose = selectedPose;
    const configuredPoseGroups = (poseConfigDraft?.poseGroups ?? [])
      .map((group, index) => {
        const path = normalizePoseMembershipPath(
          group.path ?? group.name ?? group.id,
        );
        if (!path) {
          return null;
        }
        return {
          id: group.id,
          path,
          index,
        };
      })
      .filter((group): group is { id: string; path: string; index: number } =>
        Boolean(group),
      );
    const configuredPathOrder = new Map(
      configuredPoseGroups.map((group) => [group.path, group.index]),
    );
    const configuredPathById = new Map(
      configuredPoseGroups.map((group) => [group.id, group.path]),
    );
    const sortGroupPaths = (left: string, right: string) => {
      const leftOrder = configuredPathOrder.get(left);
      const rightOrder = configuredPathOrder.get(right);
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.localeCompare(right);
    };
    const membershipPaths = (() => {
      const paths = new Set<string>();
      const addPath = (rawPath: string | null | undefined) => {
        const normalized = normalizePoseMembershipPath(rawPath);
        if (!normalized) {
          return;
        }
        paths.add(normalized);
      };
      const addById = (groupId: string | null | undefined) => {
        const trimmed = groupId?.trim();
        if (!trimmed) {
          return;
        }
        const configuredPath = configuredPathById.get(trimmed);
        if (configuredPath) {
          paths.add(configuredPath);
          return;
        }
        addPath(trimmed);
      };

      pose.groupIds?.forEach((groupId) => {
        addById(groupId);
      });
      addById(pose.groupId);
      addPath(pose.group);
      return Array.from(paths).sort(sortGroupPaths);
    })();

    const handlePromptAddPoseGroupMembership = () => {
      const response = promptDialog("Add pose to group", "");
      if (response === null) {
        return;
      }
      const normalized = normalizePoseMembershipPath(response);
      if (!normalized) {
        alertDialog("Group path cannot be empty.");
        return;
      }
      if (membershipPaths.includes(normalized)) {
        alertDialog(`Pose already belongs to "${normalized}".`);
        return;
      }
      addPoseToGroup(pose.id, normalized);
    };

    const handleAddVariable = (selection: VariableSelection) => {
      setShowSelector(false);
      if (selection.type === "variable") {
        addPoseInput(pose.id, selection.id);
        return;
      }
      if (selection.type !== "property") {
        return;
      }

      const targetIds = resolveAnimatablePropertyTargetIds(
        resolveSelectionTargetIds(selection, objects),
      );
      const resolvedInputIds = resolvePosePropertySelectionInputIds({
        selection,
        standardInputsById,
        fallbackTargetIds: targetIds,
        autorigInputIdByComponentId,
      });

      if (resolvedInputIds.length === 0) {
        alertDialog(
          "Selected properties are not currently mapped to existing rig variables.",
        );
        return;
      }

      resolvedInputIds.forEach((inputId) => addPoseInput(pose.id, inputId));
    };

    const poseSemanticTooltips = {
      target:
        "Target Value: authored pose value for this rig input when the pose contributes at 100%.",
      direct:
        "Direct Input: canonical rig input value edited directly (matches Inputs pane for this variable).",
      poseDriven:
        "Pose Driven: this pose's computed channel value at the current pose weight, before direct+pose compose.",
      contribution:
        "Contribution Strength: (Pose Driven - Neutral) / (Target - Neutral) for this pose channel.",
    };

    const handleBlend = (amount: number) => {
      const clampedAmount = clamp01(amount);
      setBlendAmount(clampedAmount);
      if (usePoseWeightPreview && selectedPoseWeightInputId) {
        handleInputValueChange(selectedPoseWeightInputId, clampedAmount);
      }
    };
    const poseBindingEditorInput = poseBindingEditorInputId
      ? (rigInputById.get(poseBindingEditorInputId) ?? null)
      : null;

    return (
      <div className="flex flex-col gap-2 p-2 min-h-0 flex-1">
        <InspectorHeader
          name={pose.name}
          path={pose.group || ""}
          typeLabel="Pose"
          id={pose.id}
          onNameChange={(name) => updatePoseName(pose.id, name)}
          onPathChange={(group) => updatePoseGroup(pose.id, group)}
        />
        <div className="flex flex-col gap-2 px-1 py-2 rounded border border-border-default/60 bg-bg-panel/30">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-text-secondary">
              Pose Groups
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => duplicatePose(pose.id)}
                title="Duplicate this pose"
              >
                <Copy size={11} />
                Duplicate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={handlePromptAddPoseGroupMembership}
              >
                <Plus size={11} />
                Add Group
              </Button>
            </div>
          </div>
          {membershipPaths.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {membershipPaths.map((groupPath) => (
                <span
                  key={groupPath}
                  className="inline-flex items-center gap-1 text-[10px] font-mono border border-border-default/60 rounded px-1.5 py-0.5 text-text-muted"
                >
                  {groupPath}
                  <button
                    type="button"
                    className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-bg-hover hover:text-text-primary"
                    title={`Remove pose from "${groupPath}"`}
                    onClick={() => removePoseFromGroup(pose.id, groupPath)}
                  >
                    <Trash2 size={9} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-text-muted font-mono">
              Unassigned
            </div>
          )}
          {configuredPoseGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {configuredPoseGroups.map((group) => {
                const isAssigned = membershipPaths.includes(group.path);
                return (
                  <Button
                    key={group.path}
                    variant={isAssigned ? "subtle" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={isAssigned}
                    onClick={() => addPoseToGroup(pose.id, group.path)}
                    title={
                      isAssigned
                        ? `Already assigned to "${group.path}"`
                        : `Assign to "${group.path}"`
                    }
                  >
                    {group.path}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        {renderChainPath()}
        {renderAuthoringStatus()}
        <RiggingPropertyRow
          label="Contribution Strength"
          onScrub={(_, totalDelta) => {
            // Blend based on delta (assuming 100px = 100% blend)
            const newAmount = Math.max(
              0,
              Math.min(1, blendAmount + totalDelta / 100),
            );
            handleBlend(newAmount);
          }}
          renderMainInput={() => (
            <div className="flex flex-wrap items-center gap-2 flex-1 group/row inspector-row-hit-target">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={blendAmount}
                className="flex-1"
                onChange={(val) => handleBlend(val as number)}
              />
              <span
                className="text-[9px] uppercase tracking-wide font-bold text-text-muted whitespace-nowrap"
                title={poseSemanticTooltips.contribution}
              >
                Contrib
              </span>
              <div className="inspector-numeric-control flex-shrink-0">
                <Input
                  size="sm"
                  type="text"
                  value={(blendAmount * 100).toFixed(0) + "%"}
                  className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-muted"
                  readOnly
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-text-muted hover:text-text-primary"
                title="Play Pose (100%)"
                onClick={() => {
                  handleBlend(1);
                }}
              >
                <Play size={12} fill="currentColor" />
              </Button>
            </div>
          )}
        />
        <div className="flex items-start gap-2 px-1 py-1 rounded border border-border-default/50 bg-bg-panel/30">
          <Info size={11} className="mt-0.5 text-text-secondary shrink-0" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider font-bold text-text-secondary">
              Legend
            </span>
            <span
              className="text-[9px] font-mono text-text-muted border border-border-default/60 rounded px-1 py-0.5"
              title={poseSemanticTooltips.target}
            >
              Target Value
            </span>
            <span
              className="text-[9px] font-mono text-text-muted border border-border-default/60 rounded px-1 py-0.5"
              title={poseSemanticTooltips.direct}
            >
              Direct Input
            </span>
            <span
              className="text-[9px] font-mono text-text-muted border border-border-default/60 rounded px-1 py-0.5"
              title={poseSemanticTooltips.poseDriven}
            >
              Pose Driven
            </span>
            <span
              className="text-[9px] font-mono text-text-muted border border-border-default/60 rounded px-1 py-0.5"
              title={poseSemanticTooltips.contribution}
            >
              Contribution Strength
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="h-px bg-border-default flex-1" />
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider whitespace-nowrap">
            What I Drive · {Object.keys(pose.values).length} Variables
          </span>
          <div className="h-px bg-border-default flex-1" />
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 min-h-[100px] pr-1">
          {poseVariableRenderGroups.length === 0 && (
            <EmptyState
              icon={Sliders}
              iconSize={18}
              title="No Connected Variables"
              description="This pose has no variable targets yet. Connect one or more rig variables to define the pose output."
              className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
            />
          )}
          {poseVariableRenderGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1 py-1 border-b border-border-default/50">
                <Box size={10} className="text-text-secondary" />
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 px-0.5">
                {group.items.map((item) => {
                  const varId = item.varId;
                  const poseVal = item.poseVal;
                  const {
                    label,
                    min,
                    max,
                    directVal,
                    poseDrivenVal,
                    contributionStrength,
                    contributionLabel,
                    poseComposeMode,
                    canInspectVariable,
                    chainSummary,
                    directDefaultValue,
                    poseDrivenPercent,
                  } = item;
                  const handleDirectInputChange = (nextDirect: number) => {
                    handleInputValueChange(
                      varId,
                      clampToRange(nextDirect, min, max),
                    );
                  };
                  const handleDirectReset = () => {
                    handleInputValueChange(
                      varId,
                      clampToRange(directDefaultValue, min, max),
                    );
                  };
                  const handleTargetValueChange = (nextTarget: number) => {
                    updatePoseValue(
                      pose.id,
                      varId,
                      clampToRange(nextTarget, min, max),
                    );
                  };

                  return (
                    <div
                      key={varId}
                      className="flex flex-col gap-2 rounded border border-border-default/50 bg-bg-panel/30 p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">
                          {label}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-mono whitespace-nowrap rounded border px-1 py-0.5",
                            contributionStrength === null
                              ? "text-text-muted border-border-default/50"
                              : "text-accent border-accent/40 bg-accent/10",
                          )}
                          title={poseSemanticTooltips.contribution}
                        >
                          Contrib {contributionLabel}
                        </span>
                        <label className="inline-flex items-center gap-1 rounded border border-border-default/60 px-1 py-0.5 text-[9px] text-text-muted">
                          <span className="uppercase tracking-wide font-bold">
                            Compose
                          </span>
                          <select
                            className="rounded border border-border-default/50 bg-bg-panel/40 px-1 py-0.5 text-[9px] text-text-primary"
                            value={poseComposeMode}
                            title="Compose direct/current value with this pose target for this channel."
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              setPoseInputComposeMode(
                                pose.id,
                                varId,
                                event.target.value === "average"
                                  ? "average"
                                  : "add",
                              );
                            }}
                          >
                            <option value="add">Add</option>
                            <option value="average">Average</option>
                          </select>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] font-mono text-text-muted hover:text-text-primary"
                          title={`Inspect variable ${varId}`}
                          disabled={!canInspectVariable}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (canInspectVariable) {
                              openRigInspector(varId, "bindings");
                            }
                          }}
                        >
                          {varId}
                          <ChevronRight size={11} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-text-secondary hover:text-red-400"
                          title="Remove from Pose"
                          onClick={(event) => {
                            event.stopPropagation();
                            removePoseInput(pose.id, varId);
                          }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 inspector-row-hit-target">
                        <span
                          className="text-[9px] uppercase tracking-wide font-bold text-text-muted whitespace-nowrap"
                          title={poseSemanticTooltips.direct}
                        >
                          Direct Input
                        </span>
                        <Slider
                          min={min}
                          max={max}
                          step={0.0001}
                          value={directVal}
                          className="flex-1 min-w-[120px]"
                          onChange={(val) =>
                            handleDirectInputChange(val as number)
                          }
                        />
                        <div
                          className="inspector-numeric-control flex-shrink-0"
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <NumberField
                            size="sm"
                            min={min}
                            max={max}
                            step={0.0001}
                            format={POSE_VALUE_PRECISION_FORMAT}
                            value={directVal}
                            className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
                            onChange={handleDirectInputChange}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          title="Reset direct input to default"
                          onClick={handleDirectReset}
                        >
                          <RotateCcw size={11} />
                          Reset
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          title="Use direct input value as the new pose target"
                          onClick={() =>
                            updatePoseValue(pose.id, varId, directVal)
                          }
                        >
                          <Save size={11} />
                          Set Target
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 inspector-row-hit-target">
                        <span
                          className="text-[9px] uppercase tracking-wide font-bold text-text-muted whitespace-nowrap"
                          title={poseSemanticTooltips.target}
                        >
                          Target Value (100%)
                        </span>
                        <div className="relative flex-1 min-w-[120px]">
                          <Slider
                            min={min}
                            max={max}
                            step={0.0001}
                            value={poseVal}
                            className="w-full"
                            onChange={(val) =>
                              handleTargetValueChange(val as number)
                            }
                          />
                          <span
                            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-400 shadow"
                            style={{ left: `${poseDrivenPercent}%` }}
                            title={poseSemanticTooltips.poseDriven}
                          />
                        </div>
                        <div
                          className="inspector-numeric-control flex-shrink-0"
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <NumberField
                            size="sm"
                            min={min}
                            max={max}
                            step={0.0001}
                            format={POSE_VALUE_PRECISION_FORMAT}
                            value={poseVal}
                            className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
                            onChange={handleTargetValueChange}
                          />
                        </div>
                        <span
                          className="text-[9px] font-mono whitespace-nowrap rounded border border-amber-300/60 bg-amber-500/10 px-1 py-0.5 text-amber-200"
                          title={poseSemanticTooltips.poseDriven}
                        >
                          Pose {poseDrivenVal.toFixed(4)}
                        </span>
                        <span className="text-[9px] font-mono whitespace-nowrap rounded border border-border-default/60 px-1 py-0.5 text-text-muted">
                          Min {min.toFixed(4)}
                        </span>
                        <span className="text-[9px] font-mono whitespace-nowrap rounded border border-border-default/60 px-1 py-0.5 text-text-muted">
                          Max {max.toFixed(4)}
                        </span>
                      </div>
                      {chainSummary && (
                        <div className="text-[9px] text-text-muted font-mono">
                          {chainSummary}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 gap-2 border border-dashed border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover hover:bg-bg-hover transition-all group"
          onClick={() => setShowSelector(true)}
        >
          <Plus
            size={14}
            className="group-hover:text-accent transition-colors"
          />
          <span className="font-normal text-xs">Connect Variable to Pose</span>
        </Button>
        <Modal
          open={showSelector}
          onClose={() => setShowSelector(false)}
          title="Connect Variable to Pose"
          maxWidth="md"
        >
          <VariableSelector
            onSelect={handleAddVariable}
            onCancel={() => setShowSelector(false)}
            defaultTab="variables"
          />
        </Modal>
        <Modal
          open={poseBindingEditorInputId !== null}
          onClose={() => setPoseBindingEditorInputId(null)}
          title={
            poseBindingEditorInputId
              ? `Edit My Drivers · ${
                  poseBindingEditorInput?.label ?? poseBindingEditorInputId
                }`
              : "Edit My Drivers"
          }
          maxWidth="lg"
        >
          {poseBindingEditorInput ? (
            (() => {
              const inputToEdit = poseBindingEditorInput;
              const bindingToEdit = inputBindings[inputToEdit.id] ?? null;
              if (!bindingToEdit) {
                const connectionCounts = poseConnectionCountsByInputId.get(
                  inputToEdit.id,
                );
                const drivenVariableCount =
                  connectionCounts?.drivenVariableCount ?? 0;
                const drivenPropertyCount =
                  connectionCounts?.drivenPropertyCount ?? 0;
                const emptyStateKind = classifyPoseParentBindingEmptyState(
                  drivenVariableCount,
                  drivenPropertyCount,
                );
                return (
                  <EmptyState
                    icon={Sliders}
                    iconSize={20}
                    title={
                      emptyStateKind === "root"
                        ? "Root Variable (No Parent Drivers)"
                        : "No Parent Drivers (Currently Unlinked)"
                    }
                    description={
                      emptyStateKind === "root"
                        ? "This pose-driven variable is currently a root input. Create a parent binding only if you want it remapped from upstream rig variables."
                        : "This pose-driven variable has no parent drivers and no downstream outputs yet. Add downstream targets or create a parent binding to connect it."
                    }
                    className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                    action={
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] text-text-muted font-mono">
                          Downstream: {drivenVariableCount} vars ·{" "}
                          {drivenPropertyCount} props
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleEnsureParentBinding(inputToEdit.id)
                          }
                        >
                          Create Parent Binding
                        </Button>
                      </div>
                    }
                  />
                );
              }
              return (
                <BindingEditor
                  binding={bindingToEdit}
                  targetId={inputToEdit.id}
                  issues={bindingIssues.get(inputToEdit.id)}
                  label={inputToEdit.label || inputToEdit.id}
                  standardInputs={standardInputList}
                  standardInputLookup={standardInputsById}
                  onBindingInputChange={handleParentBindingInputChange}
                  onAddBindingSlot={handleParentAddBindingSlot}
                  onRemoveBindingSlot={handleParentRemoveBindingSlot}
                  onBindingExpressionChange={
                    handleParentBindingExpressionChange
                  }
                  onBindingSlotAliasChange={handleParentBindingSlotAliasChange}
                  onBindingSlotValueTypeChange={
                    handleParentBindingSlotValueTypeChange
                  }
                  onRequestCreateStandardInput={
                    handleRequestCreateStandardInput
                  }
                  onResetBinding={handleParentResetBinding}
                  expandable={false}
                  defaultExpanded={true}
                  currentValues={inputValues}
                  onInputValueChange={handleInputValueChange}
                  featureFlags={{
                    vectorAuthoringBeta: true,
                    conditionalAuthoringBeta: true,
                  }}
                />
              );
            })()
          ) : (
            <p className="text-xs text-text-muted">No variable selected.</p>
          )}
        </Modal>
      </div>
    );
  }

  // 3. Rig Mode
  if (inspectorMode === "rig" && resolvedSelectedRigId) {
    const rigInput = selectedManagedRigEntry;
    if (rigInput) {
      const input = rigInput.input;
      const value = inputValues[input.id] ?? input.defaultValue ?? 0;
      const parentBinding = inputBindings[input.id];
      const isRemovableCustomInput = rigInput.source === "custom";
      const deleteGuardrailMessage = isRemovableCustomInput
        ? null
        : "This variable is system-managed and cannot be deleted from the inspector.";
      const controllableResolution = resolveControllableInputId(
        input.id,
        inputBindings,
      );
      const isDirectRigControlAvailable =
        !controllableResolution.blockedReason &&
        (controllableResolution.inputId === null ||
          controllableResolution.inputId === input.id);
      const directRigControlReason = controllableResolution.blockedReason
        ? controllableResolution.blockedReason
        : controllableResolution.inputId &&
            controllableResolution.inputId !== input.id
          ? `This variable is derived from "${controllableResolution.inputId}" without a local self slot. Edit My Drivers to add local control or adjust "${controllableResolution.inputId}".`
          : null;
      const {
        downstreamInputs,
        downstreamAutorigInputs,
        directDependents,
        dependents,
      } = selectedRigTraversal;
      const parentRigInputRefs = collectBindingInputIds(parentBinding)
        .filter((candidateId) => candidateId !== input.id)
        .map((candidateId) => {
          const parentEntry = standardInputsById.get(candidateId);
          return {
            id: candidateId,
            label: parentEntry?.label || parentEntry?.path || candidateId,
            isAutorig: isCanonicalAutorigInputPath(parentEntry?.path),
          };
        });
      const sharedLink = linksByMainInputId.get(input.id) ?? null;
      const sharedConflict = sharedLink
        ? (sharedSyncConflictsByPath.get(sharedLink.path) ?? null)
        : null;
      const linkedPoseCount = poses.reduce((count, poseEntry) => {
        return Object.prototype.hasOwnProperty.call(poseEntry.values, input.id)
          ? count + 1
          : count;
      }, 0);
      let hiddenAutorigDriverCount = 0;
      let hiddenAutorigDrivenCount = 0;
      const totalAutorigDriverCount = parentRigInputRefs.filter(
        (entry) => entry.isAutorig,
      ).length;
      const totalAutorigDrivenCount = downstreamAutorigInputs.length;

      const parseDraftNumber = (valueText: string, label: string) => {
        const trimmed = valueText.trim();
        if (!trimmed) {
          setRigLifecycleMessage({
            tone: "error",
            text: `${label} is required.`,
          });
          return null;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
          setRigLifecycleMessage({
            tone: "error",
            text: `${label} must be a valid number.`,
          });
          return null;
        }
        return parsed;
      };

      const handleApplyRigMetadataDraft = () => {
        const parsedMin = parseDraftNumber(rigRangeMinDraft, "Minimum value");
        if (parsedMin === null) {
          return;
        }
        const parsedMax = parseDraftNumber(rigRangeMaxDraft, "Maximum value");
        if (parsedMax === null) {
          return;
        }
        const parsedDefault = parseDraftNumber(
          rigDefaultDraft,
          "Default value",
        );
        if (parsedDefault === null) {
          return;
        }
        if (parsedMin > parsedMax) {
          setRigLifecycleMessage({
            tone: "error",
            text: "Minimum value cannot be greater than maximum value.",
          });
          return;
        }
        if (parsedDefault < parsedMin || parsedDefault > parsedMax) {
          setRigLifecycleMessage({
            tone: "error",
            text: "Default value must stay within the configured min/max range.",
          });
          return;
        }
        if (
          parsedDefault === input.defaultValue &&
          parsedMin === input.range.min &&
          parsedMax === input.range.max
        ) {
          setRigLifecycleMessage({
            tone: "info",
            text: "No metadata changes to apply.",
          });
          return;
        }
        const reactivity = resolveRigMetadataReactivity({
          currentValue: value,
          nextDefaultValue: parsedDefault,
          nextRange: {
            min: parsedMin,
            max: parsedMax,
          },
        });
        handleUpdateStandardInput(input.id, {
          defaultValue: reactivity.defaultValue,
          range: reactivity.range,
        });
        if (reactivity.value !== value) {
          handleInputValueChange(input.id, reactivity.value);
        }
        setRigDefaultDraft(formatDraftNumber(reactivity.defaultValue));
        setRigRangeMinDraft(formatDraftNumber(reactivity.range.min));
        setRigRangeMaxDraft(formatDraftNumber(reactivity.range.max));
        setRigLifecycleMessage({
          tone: "info",
          text: "Variable metadata updated.",
        });
      };

      const handleRigPathChange = (nextPath: string) => {
        const trimmedPath = nextPath.trim();
        if (!trimmedPath) {
          setRigLifecycleMessage({
            tone: "error",
            text: "Path cannot be empty.",
          });
          return;
        }
        const normalizedPath = normalizeStandardRigInputPath(trimmedPath);
        const duplicatePath = managedStandardInputs.some(
          (entry) =>
            entry.input.id !== input.id &&
            normalizeStandardRigInputPath(entry.input.path) === normalizedPath,
        );
        if (duplicatePath) {
          setRigLifecycleMessage({
            tone: "error",
            text: `Another variable already uses "${normalizedPath}".`,
          });
          return;
        }
        handleUpdateStandardInput(input.id, { path: normalizedPath });
        setRigLifecycleMessage(null);
      };

      const handleDeleteSelectedRigInput = () => {
        if (!isRemovableCustomInput) {
          setRigLifecycleMessage({
            tone: "error",
            text: deleteGuardrailMessage!,
          });
          return;
        }
        const label = input.label || input.path || input.id;
        const impactNotes: string[] = [];
        if (linkedPoseCount > 0) {
          impactNotes.push(`${linkedPoseCount} pose target(s)`);
        }
        if (downstreamInputs.length > 0) {
          impactNotes.push(`${downstreamInputs.length} downstream variable(s)`);
        }
        if (downstreamAutorigInputs.length > 0) {
          impactNotes.push(
            `${downstreamAutorigInputs.length} downstream autorig variable(s)`,
          );
        }
        if (dependents.length > 0) {
          impactNotes.push(
            `${dependents.length} driven propert${dependents.length === 1 ? "y" : "ies"}`,
          );
        }
        const impactSummary =
          impactNotes.length > 0
            ? `\n\nThis also removes links from ${impactNotes.join(", ")}.`
            : "";
        const shouldDelete = window.confirm(
          `Delete custom variable "${label}"?${impactSummary}`,
        );
        if (!shouldDelete) {
          return;
        }
        handleDeleteCustomStandardInput(input.id);
        handleSelectRig(null);
      };

      const handleAddRigDrivenVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        const resolvedSelection = resolveRigDrivenSelection(
          selection,
          resolvedSelectedRigId,
          objects,
        );

        if (resolvedSelection.kind === "self-variable") {
          alertDialog("A variable cannot directly drive itself.");
          return;
        }

        if (resolvedSelection.kind === "variable") {
          const existingBinding = inputBindings[resolvedSelection.childInputId];
          const alreadyLinked = hasParentBindingInput(
            existingBinding,
            resolvedSelectedRigId,
          );
          if (alreadyLinked) {
            alertDialog(
              "This variable is already driven by the selected rig variable.",
            );
            openRigInspector(resolvedSelection.childInputId, "bindings");
            return;
          }
          handleCreateParentDriverBinding(
            resolvedSelection.childInputId,
            resolvedSelectedRigId,
          );
          openRigInspector(resolvedSelection.childInputId, "bindings");
          return;
        }

        if (resolvedSelection.kind === "empty-property") {
          return;
        }

        if (resolvedSelection.kind === "property") {
          const componentTargetIds = resolveAnimatablePropertyTargetIds(
            resolvedSelection.targetIds,
          );
          if (componentTargetIds.length === 0) {
            alertDialog(
              "Selected properties are not currently mapped to animatable targets.",
            );
            return;
          }
          const missingTargetIds: string[] = [];
          const autorigInputIds = new Set<string>();
          componentTargetIds.forEach((targetId) => {
            const componentBinding = bindings[targetId];
            if (componentBinding) {
              const slotIdsToClear = new Set<string>();
              componentBinding.slots.forEach((slot) => {
                if (matchesRigInputId(slot.inputId, resolvedSelectedRigId)) {
                  slotIdsToClear.add(slot.id);
                }
              });
              if (
                slotIdsToClear.size === 0 &&
                matchesRigInputId(
                  componentBinding.inputId,
                  resolvedSelectedRigId,
                )
              ) {
                const primarySlotId = componentBinding.slots[0]?.id;
                if (primarySlotId) {
                  slotIdsToClear.add(primarySlotId);
                }
              }
              slotIdsToClear.forEach((slotId) => {
                handleBindingInputChange(targetId, null, slotId);
              });
            }

            const autorigInputId = autorigInputIdByComponentId.get(targetId);
            if (!autorigInputId) {
              missingTargetIds.push(targetId);
              return;
            }
            autorigInputIds.add(autorigInputId);
          });
          const resolvedAutorigInputIds = Array.from(autorigInputIds);
          if (resolvedAutorigInputIds.length === 0) {
            alertDialog(
              "Some selected properties are not currently mapped to autorig inputs.",
            );
            return;
          }
          const selectionLabel =
            selection.type === "property" ? selection.label : "selection";
          const shouldApplyBulk =
            resolvedAutorigInputIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Bind all ${resolvedAutorigInputIds.length} components for "${selectionLabel}" to this rig input?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          let linkedCount = 0;
          resolvedAutorigInputIds.forEach((autorigInputId) => {
            const existingInputBinding = inputBindings[autorigInputId];
            const alreadyLinked = hasParentBindingInput(
              existingInputBinding,
              resolvedSelectedRigId,
            );
            if (alreadyLinked) {
              return;
            }
            handleCreateParentDriverBinding(
              autorigInputId,
              resolvedSelectedRigId,
            );
            linkedCount += 1;
          });
          if (missingTargetIds.length > 0 && linkedCount === 0) {
            alertDialog(
              "Some selected properties are not currently mapped to autorig inputs.",
            );
          }
          return;
        }
      };
      const parentRigChainItems: Array<{
        key: string;
        label: string;
        kind: "variable" | "property" | "autorig";
        onClick: () => void;
      }> = [];
      parentRigInputRefs.forEach((entry) => {
        if (!entry.isAutorig) {
          parentRigChainItems.push({
            key: `variable:${entry.id}`,
            label: entry.label,
            kind: "variable",
            onClick: () => openRigInspector(entry.id),
          });
          return;
        }
        const mappedTargetId = componentIdByInputId.get(entry.id) ?? null;
        if (mappedTargetId && !showAutorigInternals) {
          parentRigChainItems.push({
            key: `property:${mappedTargetId}`,
            label: targetLabelById.get(mappedTargetId) ?? entry.label,
            kind: "property",
            onClick: () => openSceneBindingInspector(mappedTargetId),
          });
          return;
        }
        if (!showAutorigInternals) {
          hiddenAutorigDriverCount += 1;
          return;
        }
        parentRigChainItems.push({
          key: `autorig:${entry.id}`,
          label: entry.label,
          kind: "autorig",
          onClick: () => openRigInspector(entry.id),
        });
      });

      const drivenChainItems: Array<{
        key: string;
        label: string;
        kind: "variable" | "property" | "autorig";
        drivenInputId?: string;
        onClick: () => void;
      }> = [];
      const seenDrivenKeys = new Set<string>();
      const removeDrivenVariableLink = (drivenInputId: string) => {
        const drivenBinding = inputBindings[drivenInputId];
        if (!drivenBinding) {
          return;
        }
        const slotsToClear = new Set<string>();
        drivenBinding.slots.forEach((slot) => {
          if (matchesRigInputId(slot.inputId, resolvedSelectedRigId)) {
            slotsToClear.add(slot.id);
          }
        });
        if (
          slotsToClear.size === 0 &&
          matchesRigInputId(drivenBinding.inputId, resolvedSelectedRigId)
        ) {
          const primarySlotId = drivenBinding.slots[0]?.id;
          if (primarySlotId) {
            slotsToClear.add(primarySlotId);
          }
        }
        slotsToClear.forEach((slotId) => {
          handleParentBindingInputChange(drivenInputId, null, slotId);
        });
      };
      downstreamInputs.forEach((entry) => {
        const key = `variable:${entry.id}`;
        if (seenDrivenKeys.has(key)) {
          return;
        }
        seenDrivenKeys.add(key);
        drivenChainItems.push({
          key,
          label: entry.label,
          kind: "variable",
          drivenInputId: entry.id,
          onClick: () => openRigInspector(entry.id),
        });
      });
      downstreamAutorigInputs.forEach((entry) => {
        const mappedTargetId = componentIdByInputId.get(entry.id) ?? null;
        if (mappedTargetId) {
          const key = `property:${mappedTargetId}`;
          if (seenDrivenKeys.has(key)) {
            return;
          }
          seenDrivenKeys.add(key);
          drivenChainItems.push({
            key,
            label: targetLabelById.get(mappedTargetId) ?? entry.label,
            kind: "property",
            drivenInputId: entry.id,
            onClick: () => openSceneBindingInspector(mappedTargetId),
          });
          return;
        }
        if (!showAutorigInternals) {
          hiddenAutorigDrivenCount += 1;
          return;
        }
        const key = `autorig:${entry.id}`;
        if (seenDrivenKeys.has(key)) {
          return;
        }
        seenDrivenKeys.add(key);
        drivenChainItems.push({
          key,
          label: entry.label,
          kind: "autorig",
          drivenInputId: entry.id,
          onClick: () => openRigInspector(entry.id),
        });
      });
      directDependents.forEach((dependent) => {
        const key = `property:${dependent.targetId}`;
        if (seenDrivenKeys.has(key)) {
          return;
        }
        seenDrivenKeys.add(key);
        drivenChainItems.push({
          key,
          label: dependent.name,
          kind: "property",
          onClick: () => openSceneBindingInspector(dependent.targetId),
        });
      });

      const hiddenAutorigCount =
        hiddenAutorigDriverCount + hiddenAutorigDrivenCount;
      const hasAutorigInternals =
        totalAutorigDriverCount + totalAutorigDrivenCount > 0;

      return (
        <div className="p-2 flex flex-col gap-4 min-h-0 flex-1">
          <InspectorHeader
            name={input.label || input.id}
            path={input.path || ""}
            typeLabel="Rig"
            id={input.id}
            onNameChange={(name) => {
              handleUpdateStandardInput(input.id, { label: name });
              setRigLifecycleMessage(null);
            }}
            onPathChange={handleRigPathChange}
            actions={
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-6 p-0",
                  isRemovableCustomInput
                    ? "text-text-secondary hover:text-red-400"
                    : "text-text-muted hover:text-amber-300",
                )}
                title={
                  isRemovableCustomInput
                    ? "Delete custom variable"
                    : (deleteGuardrailMessage ?? undefined)
                }
                onClick={handleDeleteSelectedRigInput}
              >
                <Trash2 size={12} />
              </Button>
            }
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          {sharedLink && (
            <div className="rounded border border-border-default/60 bg-bg-panel/40 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Shared Variable Link
                </span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                    sharedLink.inSync
                      ? "border-emerald-500/40 text-emerald-200 bg-emerald-500/10"
                      : "border-amber-500/40 text-amber-200 bg-amber-500/10",
                  )}
                >
                  {sharedLink.inSync
                    ? "in sync"
                    : `drift ${sharedLink.delta.toFixed(3)}`}
                </span>
              </div>
              <div className="text-[10px] font-mono text-text-muted truncate">
                {sharedLink.path}
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-text-secondary">
                  Main:{" "}
                  <span className="font-mono text-text-primary">
                    {sharedLink.mainValue.toFixed(3)}
                  </span>
                </span>
                <span className="text-text-secondary">
                  Ref:{" "}
                  <span className="font-mono text-text-primary">
                    {sharedLink.referenceValue.toFixed(3)}
                  </span>
                </span>
                <span className="text-text-muted ml-auto">
                  Policy:{" "}
                  <span className="font-mono text-text-secondary">
                    {sharedSyncPolicy}
                  </span>
                </span>
              </div>
              {sharedConflict && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 flex items-center gap-1">
                  <span className="text-[10px] text-amber-100 flex-1">
                    Conflict: {sharedConflict.firstSource} →{" "}
                    {sharedConflict.secondSource}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      resolveSharedSyncConflict(sharedConflict.path, "main")
                    }
                  >
                    Keep Main
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      resolveSharedSyncConflict(
                        sharedConflict.path,
                        "reference",
                      )
                    }
                  >
                    Keep Ref
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      dismissSharedSyncConflict(sharedConflict.path)
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              )}
              {!referenceFace.file && (
                <span className="text-[10px] text-text-muted">
                  Load a reference face to activate shared sync.
                </span>
              )}
            </div>
          )}
          <div className="rounded border border-border-default/60 bg-bg-panel/40 px-2 py-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Variable Metadata
              </span>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                  isRemovableCustomInput
                    ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
                    : "border-sky-500/40 text-sky-200 bg-sky-500/10",
                )}
              >
                {isRemovableCustomInput ? "custom" : "system"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">
                  Default
                </span>
                <Input
                  size="sm"
                  type="number"
                  step="0.01"
                  value={rigDefaultDraft}
                  onChange={(event) => setRigDefaultDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigDefaultDraft(
                        formatDraftNumber(input.defaultValue ?? 0),
                      );
                      setRigLifecycleMessage(null);
                    }
                  }}
                  className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">
                  Min
                </span>
                <Input
                  size="sm"
                  type="number"
                  step="0.01"
                  value={rigRangeMinDraft}
                  onChange={(event) => setRigRangeMinDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigRangeMinDraft(
                        formatDraftNumber(input.range.min ?? -1),
                      );
                      setRigLifecycleMessage(null);
                    }
                  }}
                  className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">
                  Max
                </span>
                <Input
                  size="sm"
                  type="number"
                  step="0.01"
                  value={rigRangeMaxDraft}
                  onChange={(event) => setRigRangeMaxDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigRangeMaxDraft(
                        formatDraftNumber(input.range.max ?? 1),
                      );
                      setRigLifecycleMessage(null);
                    }
                  }}
                  className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[10px]"
                onClick={handleApplyRigMetadataDraft}
              >
                Apply Metadata
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => {
                  setRigDefaultDraft(formatDraftNumber(input.defaultValue));
                  setRigRangeMinDraft(formatDraftNumber(input.range.min));
                  setRigRangeMaxDraft(formatDraftNumber(input.range.max));
                  setRigLifecycleMessage(null);
                }}
              >
                Reset Draft
              </Button>
              {!isRemovableCustomInput && (
                <span className="text-[10px] text-amber-200/90">
                  Deletion is disabled for system-managed variables.
                </span>
              )}
            </div>
            {rigLifecycleMessage && (
              <p
                className={cn(
                  "text-[10px]",
                  rigLifecycleMessage.tone === "error"
                    ? "text-red-300"
                    : "text-emerald-300",
                )}
              >
                {rigLifecycleMessage.text}
              </p>
            )}
          </div>
          <RiggingPropertyRow
            label="Current Value"
            onScrubStart={() => {
              scrubValuesRef.current[input.id] = value;
            }}
            onScrub={(_, totalDelta) => {
              if (!isDirectRigControlAvailable) {
                return;
              }
              const step = (input.range.max - input.range.min) / 100;
              const startVal = scrubValuesRef.current[input.id] ?? 0;
              handleInputValueChange(input.id, startVal + totalDelta * step);
            }}
            renderMainInput={() => (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 flex-1 inspector-row-hit-target",
                  !isDirectRigControlAvailable && "opacity-70",
                )}
                title={directRigControlReason ?? undefined}
              >
                <Slider
                  min={input.range.min ?? -1}
                  max={input.range.max ?? 1}
                  step={0.01}
                  value={value}
                  className="flex-1"
                  onChange={(val) => {
                    if (!isDirectRigControlAvailable) {
                      return;
                    }
                    handleInputValueChange(input.id, val as number);
                  }}
                />
                <div className="inspector-numeric-control flex-shrink-0">
                  <NumberField
                    size="sm"
                    value={value}
                    className="w-full bg-slate-950/50 border-slate-800/50 text-right font-mono text-xs text-slate-300"
                    onChange={(val) => {
                      if (!isDirectRigControlAvailable) {
                        return;
                      }
                      handleInputValueChange(input.id, val);
                    }}
                  />
                </div>
              </div>
            )}
          />
          {!isDirectRigControlAvailable && directRigControlReason && (
            <div className="flex items-center justify-between gap-2 px-1 -mt-2">
              <p className="text-[10px] text-amber-300/90">
                {directRigControlReason}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[10px] whitespace-nowrap"
                onClick={() => handleEnableParentLocalControl(input.id)}
              >
                Enable Local Control
              </Button>
            </div>
          )}
          <div className="rounded border border-border-default/60 bg-bg-panel/40 p-2 flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <Sliders size={12} className="text-slate-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Chain · {parentRigChainItems.length} drivers ·{" "}
                {drivenChainItems.length} driven
              </span>
              {hasAutorigInternals ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 ml-auto text-[10px] px-2"
                  onClick={() =>
                    setShowAutorigInternals((previous) => !previous)
                  }
                >
                  {showAutorigInternals
                    ? "Hide Autorig Internals"
                    : `Show Autorig Internals${hiddenAutorigCount > 0 ? ` (${hiddenAutorigCount})` : ""}`}
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] gap-2 items-start">
              <div className="rounded border border-border-default/50 bg-bg-panel/30 p-2 flex flex-col gap-2">
                <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">
                  Driven By
                </div>
                {parentRigChainItems.length > 0 ? (
                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {parentRigChainItems.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 text-left"
                        onClick={entry.onClick}
                        title={`Inspect ${entry.label}`}
                      >
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            entry.kind === "variable" && "bg-violet-500/60",
                            entry.kind === "property" && "bg-blue-500/60",
                            entry.kind === "autorig" && "bg-cyan-500/60",
                          )}
                        />
                        <span className="flex-1 truncate">{entry.label}</span>
                        <span className="text-[9px] uppercase text-text-muted border border-border-default/60 rounded px-1 py-0.5">
                          {entry.kind === "variable"
                            ? "variable"
                            : entry.kind === "property"
                              ? "property"
                              : "autorig"}
                        </span>
                        <ChevronRight size={10} className="text-text-muted" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted">
                    No drivers. This variable is currently root/local.
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-[10px] border border-dashed border-border-default/70"
                  onClick={() => setShowRigDriversModal(true)}
                >
                  Edit My Drivers
                </Button>
              </div>

              <div className="rounded border border-border-default/50 bg-bg-panel/50 p-2 flex flex-col gap-1">
                <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">
                  Current Variable
                </div>
                <button
                  type="button"
                  className="text-left rounded border border-border-default/60 bg-bg-input/60 px-2 py-1.5 hover:border-border-hover transition-colors"
                  onClick={() => openRigInspector(input.id)}
                >
                  <div className="text-xs text-text-primary font-semibold truncate">
                    {input.label || input.id}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono truncate">
                    {input.path}
                  </div>
                </button>
                <div className="text-[10px] text-text-secondary font-mono">
                  value {value.toFixed(3)}
                </div>
              </div>

              <div className="rounded border border-border-default/50 bg-bg-panel/30 p-2 flex flex-col gap-2">
                <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">
                  What This Drives
                </div>
                {drivenChainItems.length > 0 ? (
                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {drivenChainItems.map((entry) => (
                      <div
                        key={entry.key}
                        className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 text-left"
                      >
                        <button
                          type="button"
                          className="flex flex-1 items-center gap-2 min-w-0 text-left"
                          onClick={entry.onClick}
                          title={`Inspect ${entry.label}`}
                        >
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              entry.kind === "variable" && "bg-emerald-500/60",
                              entry.kind === "property" && "bg-blue-500/60",
                              entry.kind === "autorig" && "bg-cyan-500/60",
                            )}
                          />
                          <span className="flex-1 truncate">{entry.label}</span>
                          <span className="text-[9px] uppercase text-text-muted border border-border-default/60 rounded px-1 py-0.5">
                            {entry.kind === "variable"
                              ? "variable"
                              : entry.kind === "property"
                                ? "property"
                                : "autorig"}
                          </span>
                          <ChevronRight size={10} className="text-text-muted" />
                        </button>
                        {entry.drivenInputId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 text-slate-500 hover:text-red-400"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeDrivenVariableLink(entry.drivenInputId!);
                            }}
                            title={
                              entry.kind === "autorig"
                                ? "Remove driven autorig variable link"
                                : "Remove driven variable link"
                            }
                          >
                            <Trash2 size={10} />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted">
                    No downstream variables or properties are linked.
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-[10px] border border-dashed border-border-default/70"
                  onClick={() => setShowSelector(true)}
                >
                  Add Driven Variable
                </Button>
              </div>
            </div>
          </div>
          <Modal
            open={showRigDriversModal}
            onClose={() => setShowRigDriversModal(false)}
            title="Edit My Drivers"
            maxWidth="lg"
          >
            {parentBinding ? (
              <div className="rounded-lg border border-border-default/60 bg-bg-panel/30 p-2 overflow-y-auto custom-scrollbar">
                <BindingEditor
                  binding={parentBinding}
                  targetId={input.id}
                  issues={bindingIssues.get(input.id)}
                  label={input.label || input.id}
                  standardInputs={standardInputList}
                  standardInputLookup={standardInputsById}
                  onBindingInputChange={handleParentBindingInputChange}
                  onAddBindingSlot={handleParentAddBindingSlot}
                  onRemoveBindingSlot={handleParentRemoveBindingSlot}
                  onBindingExpressionChange={
                    handleParentBindingExpressionChange
                  }
                  onBindingSlotAliasChange={handleParentBindingSlotAliasChange}
                  onBindingSlotValueTypeChange={
                    handleParentBindingSlotValueTypeChange
                  }
                  onRequestCreateStandardInput={
                    handleRequestCreateStandardInput
                  }
                  onResetBinding={handleParentResetBinding}
                  expandable={false}
                  defaultExpanded={true}
                  currentValues={inputValues}
                  onInputValueChange={handleInputValueChange}
                  featureFlags={{
                    vectorAuthoringBeta: true,
                    conditionalAuthoringBeta: true,
                  }}
                />
              </div>
            ) : (
              <EmptyState
                icon={Sliders}
                iconSize={20}
                title="No Parent Binding"
                description="This variable has no input binding yet. Create one to map it from upstream rig inputs."
                className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEnsureParentBinding(input.id)}
                  >
                    Create Binding
                  </Button>
                }
              />
            )}
          </Modal>
          <Modal
            open={showSelector}
            onClose={() => setShowSelector(false)}
            title="Select Variable or Property to Drive"
            maxWidth="md"
          >
            <VariableSelector
              onSelect={handleAddRigDrivenVariable}
              onCancel={() => setShowSelector(false)}
              defaultTab="variables"
            />
          </Modal>
        </div>
      );
    }
  }

  if (inspectorMode === "material" && selectedMaterialId) {
    const material = materials.find((m) => m.id === selectedMaterialId);
    if (material) {
      const affectedShapes = objects.filter((obj) =>
        material.memberShapeIds.includes(obj.id),
      );

      // We create a "dummy" node object that maps the material features to this UI
      // so we can reuse RiggingColorRow and RiggingScalarRow
      // But wait, RiggingColorRow needs a real node feature.
      // Looking at RiggingMaterialSection, it expects a SceneObjectFeature.
      // We can construct these from the material descriptor.

      const colorFeature =
        material.animated.color || material.staticValues.color !== undefined
          ? ({
              id: `mat-color-${material.id}`,
              key: "color",
              label: "Color",
              animated: !!material.animated.color,
              value: material.animated.color || "",
              staticValue: material.staticValues.color,
              components: [
                {
                  label: "R",
                  targetId: material.animated.color
                    ? `${material.animated.color}:r`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.r,
                },
                {
                  label: "G",
                  targetId: material.animated.color
                    ? `${material.animated.color}:g`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.g,
                },
                {
                  label: "B",
                  targetId: material.animated.color
                    ? `${material.animated.color}:b`
                    : undefined,
                  staticValue: (material.staticValues.color as any)?.b,
                },
              ],
            } as any)
          : null;

      const opacityFeature =
        material.animated.opacity || material.staticValues.opacity !== undefined
          ? ({
              id: `mat-opacity-${material.id}`,
              key: "opacity",
              label: "Opacity",
              animated: !!material.animated.opacity,
              value: material.animated.opacity || "",
              staticValue: material.staticValues.opacity,
              components: [
                {
                  label: "Opacity",
                  targetId: material.animated.opacity || undefined,
                  staticValue: material.staticValues.opacity,
                },
              ],
            } as any)
          : null;

      const handleStaticValueChange = (
        targetId: string,
        value: number,
        channel?: string,
      ) => {
        setAnimatableValue(targetId, value, { channel, saveToDefault: true });
      };

      return (
        <div className="flex flex-col h-full bg-bg-app animate-in fade-in duration-300">
          <InspectorHeader
            name={material.label}
            typeLabel="Material"
            id={material.id}
            icon={Palette}
            onNameChange={(newName) =>
              updateMaterialLabel(material.id, newName)
            }
          />
          {renderChainPath()}
          {renderAuthoringStatus()}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50">
              <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-0.5 px-0.5">
                Properties
              </div>
              {colorFeature && (
                <RiggingColorRow
                  label="Color"
                  feature={colorFeature}
                  bindings={bindings}
                  standardInputs={standardInputs}
                  standardInputsById={standardInputsById}
                  inputBindings={inputBindings}
                  inputValues={inputValues}
                  onValueChange={handleInputValueChange}
                  onDefaultChange={(id, val) =>
                    handleUpdateStandardInput(id, { defaultValue: val })
                  }
                  onStaticValueChange={handleStaticValueChange}
                  onConstraintChange={updateAnimatableDescriptor}
                  onUpdateStandardInput={handleUpdateStandardInput}
                  setStaticFeatureValue={setStaticFeatureValue}
                />
              )}
              {opacityFeature && (
                <RiggingScalarRow
                  label="Opacity"
                  feature={opacityFeature}
                  bindings={bindings}
                  standardInputs={standardInputs}
                  standardInputsById={standardInputsById}
                  inputBindings={inputBindings}
                  inputValues={inputValues}
                  onValueChange={handleInputValueChange}
                  onDefaultChange={(id, val) =>
                    handleUpdateStandardInput(id, { defaultValue: val })
                  }
                  onStaticValueChange={handleStaticValueChange}
                  onConstraintChange={updateAnimatableDescriptor}
                  onUpdateStandardInput={handleUpdateStandardInput}
                  setStaticFeatureValue={setStaticFeatureValue}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Affected Face Elements
                </h3>
                <span className="text-[10px] font-mono text-text-muted bg-bg-panel/60 px-1.5 py-0.5 rounded border border-border-default/30">
                  {affectedShapes.length}
                </span>
              </div>

              {affectedShapes.length === 0 ? (
                <EmptyState
                  icon={Box}
                  iconSize={20}
                  title="No Elements"
                  description="This material is not assigned to any face elements."
                  className="border border-dashed border-border-default/50 rounded-lg bg-bg-secondary/20 py-6"
                />
              ) : (
                <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar bg-bg-panel/40 rounded p-1 border border-border-default/50 max-h-[300px]">
                  {affectedShapes.map((shape) => (
                    <div
                      key={shape.id}
                      className="text-xs text-slate-300 p-1.5 hover:bg-slate-800/50 rounded flex items-center gap-2 group cursor-pointer"
                      onClick={() => handleSelectObject(shape.id)}
                    >
                      <Box size={10} className="text-accent/60" />
                      <span className="flex-1 truncate">
                        {shape.name || shape.id}
                      </span>
                      <ChevronRight
                        size={10}
                        className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Default: Empty State
  return (
    <EmptyState
      icon={Info}
      iconSize={20}
      title="No selection"
      description="Select an object, pose, or rig to see its properties here."
      className="h-full min-h-[300px]"
    />
  );
}

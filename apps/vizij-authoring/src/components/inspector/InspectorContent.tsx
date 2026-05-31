import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import {
  Trash2,
  Plus,
  Copy,
  Info,
  Activity,
  ChevronDown,
  ChevronRight,
  Sliders,
  Palette,
  Box,
  Play,
  RotateCcw,
  Lock,
  LockOpen,
} from "lucide-react";
import {
  bindingTargetFromInput,
  createDefaultParentBinding,
} from "@vizij/node-graph-authoring";
import {
  buildRigPipelineV1LinkId,
  buildRigPipelineV1OverrideEnabledPath,
  buildRigPipelineV1OverrideValuePath,
  formatStandardRigInputDisplayPath,
  normalizeStandardRigInputPath,
  resolveRigPipelineV1FormulaVariable,
  resolveRigPipelineV1InputConfig,
  type RigPipelineV1Metadata,
  type RigPipelineV1ParentContributionSource,
  SELF_BINDING_ID,
} from "@vizij/utils";
import {
  assessLegacyBindingMigration,
  buildCompiledPipelineEquation,
  buildDefaultParentContributionFormula,
  buildDefaultParentVariableFormula,
  computePipelineDiagnostics,
  computePoseContribution,
  isAutoParentBlendExpression,
  mergePipelineMetadata,
  planLegacyBindingPipelineMigration,
  resolveAuthoringParentExpressionVariable,
  resolveParentBlendExpressionUpdate,
  resolvePipelineStageSettings,
} from "@vizij/studio-support";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { CollapsibleGroup } from "../ui";
import { useAuthoringUiState } from "../../state/AuthoringUiProvider";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useBindingAuthoringStoreApi,
} from "../../state/RigControllerProvider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useSharedVariableSyncContext } from "../../state/SharedVariableSyncContext";
import { resolveVisibleAuthoringCompileState } from "../../state/graphRuntimeStore";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { cn } from "../../utils/cn";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import { cleanLabel } from "../../utils/labels";
import {
  fromRotationDisplayValue,
  shouldDisplayRotationInDegrees,
  toRotationDisplayValue,
} from "../../utils/rotationDisplay";
import {
  buildPoseWeightRelativePath,
  parsePoseWeightInputSourceId,
} from "../../poseRig/utils";
import { EmptyState } from "../ui/EmptyState";
import { resolveRigMetadataInputId } from "../../utils/rigElementInputs";
import { RiggingPropertyRow } from "./RiggingPropertyRow";
import { VariableSelector, type VariableSelection } from "./VariableSelector";
import { InspectorHeader } from "./InspectorHeader";
import { RiggingTransformSection } from "./RiggingTransformSection";
import { BindingConnections } from "./BindingConnections";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";
import { VariablePipelineStages } from "./VariablePipelineStages";
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
  hasParentBindingInput,
  resolveRigDrivenSelection,
} from "./inspectorActions";
import { resolveControllableInputId } from "./bindingSlotResolution";
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
  path: string | null;
  min: number;
  max: number;
  neutralVal: number;
  directDefaultValue: number;
  canInspectVariable: boolean;
  poseComposeMode: "add" | "average";
};

type PoseVariableRenderItem = PoseVariableItem & {
  label: string;
  path: string | null;
  min: number;
  max: number;
  neutralVal: number;
  poseDrivenVal: number;
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

type PoseSemanticTooltips = {
  target: string;
  poseDriven: string;
  contribution: string;
};

type RigTraversalSummary = {
  downstreamConnections: ReturnType<typeof collectDirectDownstreamRigInputs>;
  downstreamInputs: ReturnType<typeof collectDirectDownstreamRigInputs>;
  downstreamPropsRigInputs: ReturnType<typeof collectDirectDownstreamRigInputs>;
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
  downstreamPropsRigInputs: [],
  directDependents: [],
  dependents: [],
};
const EMPTY_INPUT_VALUES: Readonly<Record<string, number>> = Object.freeze({});

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

function isCanonicalPropsRigInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path).replace(
    /^\/rig\/[^/]+\//,
    "/",
  );
  return normalized.startsWith("/propsrig/");
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

function collectLockableTargetIdsForNode(
  node: {
    features?: Array<{
      components?: Array<{ targetId?: string | null }>;
    }>;
  } | null,
): string[] {
  if (!node) {
    return [];
  }
  const ids = new Set<string>();
  (node.features ?? []).forEach((feature) => {
    (feature.components ?? []).forEach((component) => {
      const targetId = component.targetId?.trim();
      if (!targetId) {
        return;
      }
      ids.add(targetId);
    });
  });
  return Array.from(ids);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readParentBlendExpressionFromPipelineMetadata(
  pipelineMetadataV1: Record<string, unknown> | null | undefined,
  inputId: string,
): string | null {
  const byInputContainer = asObject(pipelineMetadataV1?.byInputId);
  const entry = asObject(byInputContainer?.[inputId]);
  const parentBlend = asObject(entry?.parentBlend);
  const expression = parentBlend?.expression;
  return typeof expression === "string" && expression.trim().length > 0
    ? expression.trim()
    : null;
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

const SYNC_VALUE_EPSILON = 1e-4;

function normalizePoseLookupToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
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

interface PoseVariableExpandedControlsProps {
  poseId: string;
  item: PoseVariableRenderItem;
  poseSemanticTooltips: PoseSemanticTooltips;
  onInputValueChange: (inputId: string, value: number) => void;
  onUpdatePoseValue: (poseId: string, inputId: string, value: number) => void;
}

function PoseVariableExpandedControls({
  poseId,
  item,
  poseSemanticTooltips,
  onInputValueChange: _onInputValueChange,
  onUpdatePoseValue,
}: PoseVariableExpandedControlsProps) {
  const { rotationDisplayMode } = useAuthoringUiState();
  const useDegreeDisplay = shouldDisplayRotationInDegrees(
    item.path,
    rotationDisplayMode,
  );
  const displayMin = useDegreeDisplay
    ? toRotationDisplayValue(item.min, rotationDisplayMode)
    : item.min;
  const displayMax = useDegreeDisplay
    ? toRotationDisplayValue(item.max, rotationDisplayMode)
    : item.max;
  const displayPoseValue = useDegreeDisplay
    ? toRotationDisplayValue(item.poseVal, rotationDisplayMode)
    : item.poseVal;
  const displayPoseDrivenValue = useDegreeDisplay
    ? toRotationDisplayValue(item.poseDrivenVal, rotationDisplayMode)
    : item.poseDrivenVal;
  const displayStep = useDegreeDisplay ? 0.5 : 0.0001;
  const sliderRange = item.max - item.min;
  const targetPercent =
    sliderRange > 0
      ? clamp01((item.poseVal - item.min) / sliderRange) * 100
      : 0;
  const poseDrivenPercent = item.poseDrivenPercent;
  const targetToCurrentRangeStart = Math.min(targetPercent, poseDrivenPercent);
  const targetToCurrentRangeWidth = Math.max(
    0,
    Math.abs(targetPercent - poseDrivenPercent),
  );

  const handleTargetValueChange = useCallback(
    (nextTarget: number) => {
      onUpdatePoseValue(
        poseId,
        item.varId,
        clampToRange(
          useDegreeDisplay
            ? fromRotationDisplayValue(nextTarget, rotationDisplayMode)
            : nextTarget,
          item.min,
          item.max,
        ),
      );
    },
    [
      item.max,
      item.min,
      item.varId,
      onUpdatePoseValue,
      poseId,
      rotationDisplayMode,
      useDegreeDisplay,
    ],
  );

  return (
    <div className="grid grid-cols-1 gap-2 inspector-row-hit-target sm:grid-cols-[104px_minmax(0,1fr)_94px_138px] sm:items-center">
      <span
        className="text-[9px] uppercase tracking-wide font-bold text-text-muted whitespace-nowrap"
        title={poseSemanticTooltips.target}
      >
        Control Target
      </span>
      <div className="relative min-w-0">
        <Slider
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayPoseValue}
          fillMode="none"
          className="w-full"
          onChange={(val) => handleTargetValueChange(val as number)}
        />
        {targetToCurrentRangeWidth > 0 ? (
          <span
            className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
            style={{
              left: `${targetToCurrentRangeStart}%`,
              width: `${targetToCurrentRangeWidth}%`,
            }}
          />
        ) : null}
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border border-amber-200/90 bg-amber-400 shadow-[0_0_0_1px_rgba(120,53,15,0.45)]"
          style={{ left: `${targetPercent}%` }}
          title={poseSemanticTooltips.target}
        />
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border border-white/90 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
          style={{ left: `${item.poseDrivenPercent}%` }}
          title={poseSemanticTooltips.poseDriven}
        />
      </div>
      <div
        className="inspector-numeric-control min-w-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <NumberField
          size="sm"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          format={POSE_VALUE_PRECISION_FORMAT}
          value={displayPoseValue}
          allowScrub={false}
          className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-primary"
          onChange={handleTargetValueChange}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span
          className="text-[10px] font-mono whitespace-nowrap text-white"
          title={poseSemanticTooltips.poseDriven}
        >
          Current Pose: {displayPoseDrivenValue.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

interface InspectorContentProps {
  hasReferenceFaceFile?: boolean;
}

export function InspectorContent({
  hasReferenceFaceFile = false,
}: InspectorContentProps) {
  const { rotationDisplayMode } = useAuthoringUiState();
  const [showSelector, setShowSelector] = useState(false);
  const [rigLinkSelectorMode, setRigLinkSelectorMode] = useState<
    "child" | "parent"
  >("child");
  const [blendAmount, setBlendAmount] = useState(0);

  const showPropsRigInternals = false;
  const pendingChainNavigationRef = useRef<InspectorChainNode | null>(null);
  const [inspectorChainPath, setInspectorChainPath] = useState<
    InspectorChainNode[]
  >([]);
  const [expandedPoseVariableIds, setExpandedPoseVariableIds] = useState<
    Set<string>
  >(() => new Set());
  const [rigDefaultDraft, setRigDefaultDraft] = useState("0");
  const [rigRangeMinDraft, setRigRangeMinDraft] = useState("-1");
  const [rigRangeMaxDraft, setRigRangeMaxDraft] = useState("1");
  const [rigPathDraft, setRigPathDraft] = useState("");
  const [rigLifecycleMessage, setRigLifecycleMessage] =
    useState<RigLifecycleMessage | null>(null);
  const [parentExpressionAttention, setParentExpressionAttention] = useState<{
    inputId: string;
    nonce: number;
    message: string;
  } | null>(null);
  const [rigInspectorScope, setRigInspectorScope] = useState<
    "main" | "reference"
  >("main");
  const [poseInspectorScope, setPoseInspectorScope] = useState<
    "main" | "reference"
  >("main");
  const [sharedRigCombinedValue, setSharedRigCombinedValue] = useState(0);
  const [sharedRigCombinedKey, setSharedRigCombinedKey] = useState<
    string | null
  >(null);
  const [sharedPoseCombinedValue, setSharedPoseCombinedValue] = useState(0);
  const [sharedPoseCombinedKey, setSharedPoseCombinedKey] = useState<
    string | null
  >(null);
  const usesDegreeDisplay = useCallback(
    (path: string | null | undefined) =>
      shouldDisplayRotationInDegrees(path, rotationDisplayMode),
    [rotationDisplayMode],
  );
  const toDisplayValue = useCallback(
    (value: number, path: string | null | undefined) =>
      usesDegreeDisplay(path)
        ? toRotationDisplayValue(value, rotationDisplayMode)
        : value,
    [rotationDisplayMode, usesDegreeDisplay],
  );
  const fromDisplayValue = useCallback(
    (value: number, path: string | null | undefined) =>
      usesDegreeDisplay(path)
        ? fromRotationDisplayValue(value, rotationDisplayMode)
        : value,
    [rotationDisplayMode, usesDegreeDisplay],
  );
  const resolveDisplayStep = useCallback(
    (min: number, max: number, path: string | null | undefined) =>
      usesDegreeDisplay(path)
        ? 0.5
        : Math.max(0.0001, Math.min(0.1, Math.abs(max - min) / 200)),
    [usesDegreeDisplay],
  );
  const formatDraftDisplayNumber = useCallback(
    (value: number, path: string | null | undefined) =>
      formatDraftNumber(toDisplayValue(value, path)),
    [toDisplayValue],
  );

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
  const shouldSubscribeInputValues =
    inspectorMode === "rig" || inspectorMode === "material";
  const referenceFace = useReferenceFace();

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
  const stageRuntimeGraphPathValue = useBindingAuthoring(
    (state) => state.stageRuntimeGraphPathValue,
  );
  const inputValues = useBindingAuthoring((state) =>
    shouldSubscribeInputValues ? state.inputValues : EMPTY_INPUT_VALUES,
  );
  const pipelineMetadataV1 = useBindingAuthoring(
    (state) => state.pipelineMetadataV1,
  );
  const bindingAuthoringStore = useBindingAuthoringStoreApi();
  const bindings = useBindingAuthoring((state) => state.bindings);
  const bindingIssues = useBindingAuthoring((state) => state.bindingIssues);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const applyInputBindingPatch = useBindingAuthoring(
    (state) => state.applyInputBindingPatch,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const lockedPropsRigInputIds = useBindingAuthoring(
    (state) => state.lockedPropsRigInputIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
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
  const handleParentBindingExpressionChange = useBindingAuthoring(
    (state) => state.handleParentBindingExpressionChange,
  );
  const handleEnableParentLocalControl = useBindingAuthoring(
    (state) => state.handleEnableParentLocalControl,
  );
  const handleCreateParentDriverBinding = useBindingAuthoring(
    (state) => state.handleCreateParentDriverBinding,
  );
  const handleUnlinkChildInput = useBindingAuthoring(
    (state) => state.handleUnlinkChildInput,
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
  const propsrigInputIdByComponentId = useMemo(() => {
    type Candidate = {
      inputId: string;
      resolvedInputId: string;
      canonicalPropsRig: boolean;
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
        canonicalPropsRig: isCanonicalPropsRigInputPath(resolvedInput.path),
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
      if (candidate.canonicalPropsRig) {
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
        canonicalPropsRig: isCanonicalPropsRigInputPath(resolvedInput.path),
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

      const directActivePropsRigCandidate = activeBindingInputIds
        .map((id) => candidateFromInputId(id))
        .find((candidate) => candidate?.canonicalPropsRig);
      if (directActivePropsRigCandidate) {
        selected.set(
          componentId,
          directActivePropsRigCandidate.resolvedInputId,
        );
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
  const authoringCompileTarget = useGraphRuntime(
    (state) => state.authoringCompileTarget,
  );
  const authoringCompileTargets = useGraphRuntime(
    (state) => state.authoringCompileTargets,
  );
  const visibleAuthoringCompileState = useMemo(
    () =>
      resolveVisibleAuthoringCompileState({
        authoringCompileTarget,
        authoringCompileTargets,
      }),
    [authoringCompileTarget, authoringCompileTargets],
  );
  const authoringCompileStatus = visibleAuthoringCompileState.status;
  const authoringCompileMessage = visibleAuthoringCompileState.message;
  const visibleAuthoringCompileTarget = visibleAuthoringCompileState.target;
  const runtimeFaceId = useGraphRuntime((state) => state.faceId);
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
  const referencePoseWeightInputByPoseId = useMemo(() => {
    const map = new Map<
      string,
      (typeof referenceFace.standardInputs)[number]
    >();
    referenceFace.standardInputs.forEach((input) => {
      const poseId = parsePoseWeightInputSourceId(input.sourceId);
      if (!poseId || map.has(poseId)) {
        return;
      }
      map.set(poseId, input);
    });
    return map;
  }, [referenceFace.standardInputs]);
  const referencePoseWeightInputByPath = useMemo(() => {
    const map = new Map<
      string,
      (typeof referenceFace.standardInputs)[number]
    >();
    referenceFace.standardInputs.forEach((input) => {
      const normalizedPath = normalizeStandardRigInputPath(input.path);
      if (!normalizedPath || map.has(normalizedPath)) {
        return;
      }
      map.set(normalizedPath, input);
    });
    return map;
  }, [referenceFace.standardInputs]);

  const pipelineLinksById = useMemo(() => {
    const linksContainer = asObject(pipelineMetadataV1?.links);
    if (!linksContainer) {
      return new Map<
        string,
        {
          parentInputId: string;
          childInputId: string;
          scale: number;
          offset: number;
          enabled: boolean;
          expression: string | null;
        }
      >();
    }
    const next = new Map<
      string,
      {
        parentInputId: string;
        childInputId: string;
        scale: number;
        offset: number;
        enabled: boolean;
        expression: string | null;
      }
    >();
    Object.entries(linksContainer).forEach(([linkId, rawEntry]) => {
      const entry = asObject(rawEntry);
      if (!entry) {
        return;
      }
      const parentInputId =
        typeof entry.parentInputId === "string" ? entry.parentInputId : null;
      const childInputId =
        typeof entry.childInputId === "string" ? entry.childInputId : null;
      if (!parentInputId || !childInputId) {
        return;
      }
      next.set(linkId, {
        parentInputId,
        childInputId,
        scale: toFinite(entry.scale, 1),
        offset: toFinite(entry.offset, 0),
        enabled: toBoolean(entry.enabled, true),
        expression:
          typeof entry.expression === "string" && entry.expression.trim().length
            ? entry.expression.trim()
            : null,
      });
    });
    return next;
  }, [pipelineMetadataV1]);

  const selectedPoseWeightInputId =
    inspectorMode === "pose" &&
    selectedPoseId &&
    poseWeightInputIdByPoseId.has(selectedPoseId)
      ? (poseWeightInputIdByPoseId.get(selectedPoseId) ?? null)
      : null;

  const selectedPoseWeightValue = useBindingAuthoring((state) => {
    if (!selectedPoseWeightInputId) {
      return 0;
    }
    const stored = state.inputValues[selectedPoseWeightInputId];
    if (typeof stored !== "number" || !Number.isFinite(stored)) {
      return 0;
    }
    return clamp01(stored);
  });

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
    if (inspectorMode !== "pose" || !selectedPoseId) {
      setExpandedPoseVariableIds((current) =>
        current.size === 0 ? current : new Set(),
      );
      return;
    }
    setExpandedPoseVariableIds(new Set());
  }, [inspectorMode, selectedPoseId]);

  const togglePoseVariableExpansion = useCallback((varId: string) => {
    setExpandedPoseVariableIds((current) => {
      const next = new Set(current);
      if (next.has(varId)) {
        next.delete(varId);
      } else {
        next.add(varId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (inspectorMode !== "rig" || !selectedManagedRigEntry) {
      setRigLifecycleMessage(null);
      return;
    }
    const { input } = selectedManagedRigEntry;
    setRigDefaultDraft(
      formatDraftDisplayNumber(input.defaultValue ?? 0, input.path),
    );
    setRigRangeMinDraft(
      formatDraftDisplayNumber(input.range.min ?? -1, input.path),
    );
    setRigRangeMaxDraft(
      formatDraftDisplayNumber(input.range.max ?? 1, input.path),
    );
    setRigPathDraft(input.path ?? "");
    setRigLifecycleMessage(null);
  }, [formatDraftDisplayNumber, inspectorMode, selectedManagedRigEntry]);

  useEffect(() => {
    if (
      inspectorMode !== "rig" ||
      !selectedManagedRigEntry ||
      !parentExpressionAttention
    ) {
      return;
    }
    if (
      selectedManagedRigEntry.input.id !== parentExpressionAttention.inputId
    ) {
      return;
    }
    setRigLifecycleMessage({
      tone: "info",
      text: parentExpressionAttention.message,
    });
  }, [inspectorMode, parentExpressionAttention, selectedManagedRigEntry]);

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
  const referenceRigInputById = useMemo(
    () =>
      new Map(
        referenceFace.standardInputs.map((referenceInput) => [
          referenceInput.id,
          referenceInput,
        ]),
      ),
    [referenceFace.standardInputs],
  );
  const referenceRigInputByPath = useMemo(() => {
    const byPath = new Map<
      string,
      (typeof referenceFace.standardInputs)[number]
    >();
    referenceFace.standardInputs.forEach((referenceInput) => {
      const normalizedPath = normalizeStandardRigInputPath(referenceInput.path);
      if (!byPath.has(normalizedPath)) {
        byPath.set(normalizedPath, referenceInput);
      }
    });
    return byPath;
  }, [referenceFace.standardInputs]);

  const poseById = useMemo(
    () => new Map(poses.map((pose) => [pose.id, pose])),
    [poses],
  );
  const referencePoseById = useMemo(
    () =>
      new Map(
        referenceFace.referenceCatalog.poses.map((pose) => [pose.id, pose]),
      ),
    [referenceFace.referenceCatalog.poses],
  );
  const referencePoseByLookupToken = useMemo(() => {
    const byLookupToken = new Map<
      string,
      (typeof referenceFace.referenceCatalog.poses)[number] | null
    >();
    referenceFace.referenceCatalog.poses.forEach((pose) => {
      const token = normalizePoseLookupToken(pose.name);
      if (!token) {
        return;
      }
      const existing = byLookupToken.get(token);
      if (!existing) {
        byLookupToken.set(token, pose);
        return;
      }
      byLookupToken.set(token, null);
    });
    return byLookupToken;
  }, [referenceFace.referenceCatalog.poses]);
  const selectedPose = useMemo(() => {
    if (!selectedPoseId) {
      return null;
    }
    return poseById.get(selectedPoseId) ?? null;
  }, [poseById, selectedPoseId]);
  const selectedReferencePose = useMemo(() => {
    if (!selectedPoseId || selectedPose) {
      return null;
    }
    return referencePoseById.get(selectedPoseId) ?? null;
  }, [referencePoseById, selectedPose, selectedPoseId]);
  const selectedSharedReferencePose = useMemo(() => {
    if (!selectedPose) {
      return null;
    }
    const byId = referencePoseById.get(selectedPose.id);
    if (byId) {
      return byId;
    }
    const byName =
      referencePoseByLookupToken.get(
        normalizePoseLookupToken(selectedPose.name),
      ) ?? null;
    return byName;
  }, [referencePoseById, referencePoseByLookupToken, selectedPose]);
  const selectedReferenceRigInput = useMemo(() => {
    if (inspectorMode !== "rig" || !selectedRigId || selectedManagedRigEntry) {
      return null;
    }
    return referenceRigInputById.get(selectedRigId) ?? null;
  }, [
    inspectorMode,
    referenceRigInputById,
    selectedManagedRigEntry,
    selectedRigId,
  ]);
  const selectedSharedReferenceRigInput = useMemo(() => {
    if (!selectedManagedRigEntry) {
      return null;
    }
    const normalizedPath = normalizeStandardRigInputPath(
      selectedManagedRigEntry.input.path,
    );
    return referenceRigInputByPath.get(normalizedPath) ?? null;
  }, [referenceRigInputByPath, selectedManagedRigEntry]);
  const mainRigInputIdByPath = useMemo(() => {
    const byPath = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const normalizedPath = normalizeStandardRigInputPath(entry.input.path);
      if (!byPath.has(normalizedPath)) {
        byPath.set(normalizedPath, entry.input.id);
      }
    });
    return byPath;
  }, [managedStandardInputs]);

  useEffect(() => {
    if (inspectorMode !== "rig") {
      setRigInspectorScope("main");
      return;
    }
    if (selectedReferenceRigInput && !selectedManagedRigEntry) {
      setRigInspectorScope("reference");
      return;
    }
    setRigInspectorScope("main");
  }, [inspectorMode, selectedManagedRigEntry, selectedReferenceRigInput]);
  useEffect(() => {
    if (inspectorMode !== "pose") {
      setPoseInspectorScope("main");
      return;
    }
    if (selectedReferencePose && !selectedPose) {
      setPoseInspectorScope("reference");
      return;
    }
    setPoseInspectorScope("main");
  }, [inspectorMode, selectedPoseId, selectedReferencePose?.id]);
  const setReferenceRigInputValue = useCallback(
    (
      input: (typeof referenceFace.standardInputs)[number],
      nextValue: number,
      range?: { min: number; max: number },
    ) => {
      const min =
        range && Number.isFinite(range.min)
          ? range.min
          : Number.isFinite(input.range.min)
            ? input.range.min
            : -1;
      const max =
        range && Number.isFinite(range.max)
          ? range.max
          : Number.isFinite(input.range.max)
            ? input.range.max
            : 1;
      const clampedValue = clampToRange(nextValue, min, max);
      if (referenceFace.standardInputsById.has(input.id)) {
        referenceFace.handleInputValueChange(input.id, clampedValue);
        return;
      }
      referenceFace.handleInputPathValueChange(input.path, clampedValue);
    },
    [referenceFace],
  );
  const resolveReferenceRigInputValue = useCallback(
    (input: (typeof referenceFace.standardInputs)[number]) =>
      referenceFace.inputValues[input.id] ?? input.defaultValue,
    [referenceFace.inputValues],
  );
  const setReferencePoseWeightValue = useCallback(
    (poseId: string, nextValue: number) => {
      referenceFace.handleInputPathValueChange(
        buildPoseWeightRelativePath(poseId),
        clamp01(nextValue),
      );
    },
    [referenceFace],
  );
  const resolveReferencePoseWeightValue = useCallback(
    (poseId: string) => {
      const runtimeInput =
        referencePoseWeightInputByPoseId.get(poseId) ??
        referencePoseWeightInputByPath.get(
          normalizeStandardRigInputPath(buildPoseWeightRelativePath(poseId)),
        );
      if (!runtimeInput) {
        return 0;
      }
      const value =
        referenceFace.inputValues[runtimeInput.id] ?? runtimeInput.defaultValue;
      return clamp01(value);
    },
    [
      referenceFace.inputValues,
      referencePoseWeightInputByPath,
      referencePoseWeightInputByPoseId,
    ],
  );
  useEffect(() => {
    if (
      inspectorMode !== "rig" ||
      !selectedManagedRigEntry ||
      !selectedSharedReferenceRigInput
    ) {
      setSharedRigCombinedKey(null);
      return;
    }
    const pairKey = `${selectedManagedRigEntry.input.id}::${selectedSharedReferenceRigInput.id}`;
    if (sharedRigCombinedKey === pairKey) {
      return;
    }
    const mainValue =
      inputValues[selectedManagedRigEntry.input.id] ??
      selectedManagedRigEntry.input.defaultValue;
    const referenceValue = resolveReferenceRigInputValue(
      selectedSharedReferenceRigInput,
    );
    const nextCombinedValue =
      Math.abs(mainValue - referenceValue) <= SYNC_VALUE_EPSILON
        ? mainValue
        : mainValue;
    setSharedRigCombinedValue(
      clampToRange(
        nextCombinedValue,
        selectedManagedRigEntry.input.range.min,
        selectedManagedRigEntry.input.range.max,
      ),
    );
    setSharedRigCombinedKey(pairKey);
  }, [
    inputValues,
    inspectorMode,
    resolveReferenceRigInputValue,
    selectedManagedRigEntry?.input.id,
    selectedManagedRigEntry?.input.defaultValue,
    selectedManagedRigEntry?.input.range.max,
    selectedManagedRigEntry?.input.range.min,
    selectedSharedReferenceRigInput?.id,
    selectedManagedRigEntry,
    selectedSharedReferenceRigInput,
    sharedRigCombinedKey,
  ]);
  useEffect(() => {
    if (
      inspectorMode !== "pose" ||
      !selectedPose ||
      !selectedSharedReferencePose
    ) {
      setSharedPoseCombinedKey(null);
      return;
    }
    const pairKey = `${selectedPose.id}::${selectedSharedReferencePose.id}`;
    if (sharedPoseCombinedKey === pairKey) {
      return;
    }
    const mainValue = selectedPoseWeightInputId
      ? selectedPoseWeightValue
      : blendAmount;
    const referenceValue = resolveReferencePoseWeightValue(
      selectedSharedReferencePose.id,
    );
    const nextCombinedValue =
      Math.abs(mainValue - referenceValue) <= SYNC_VALUE_EPSILON
        ? mainValue
        : mainValue;
    setSharedPoseCombinedValue(clamp01(nextCombinedValue));
    setSharedPoseCombinedKey(pairKey);
  }, [
    blendAmount,
    inspectorMode,
    resolveReferencePoseWeightValue,
    selectedPose?.id,
    selectedPoseWeightInputId,
    selectedPoseWeightValue,
    selectedSharedReferencePose?.id,
    sharedPoseCombinedKey,
  ]);
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
      const inputPath = standardInputsById.get(varId)?.path ?? null;
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
        path: inputPath,
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
          path: null,
          min: -1,
          max: 1,
          neutralVal: 0,
          directDefaultValue: 0,
          canInspectVariable: standardInputsById.has(item.varId),
          poseComposeMode: "add" as const,
        };
        const interpolated =
          base.neutralVal +
          (item.poseVal - base.neutralVal) * clamp01(activePoseWeight);
        const poseDrivenVal = clampToRange(interpolated, base.min, base.max);
        return {
          ...item,
          label: cleanLabel(base.rawLabel, group.label),
          path: base.path,
          min: base.min,
          max: base.max,
          neutralVal: base.neutralVal,
          poseDrivenVal,
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
    inspectorMode,
    poseVariableBaseById,
    selectedPose,
    selectedPoseWeightValue,
    standardInputsById,
    usePoseWeightPreview,
  ]);
  const poseVariableIds = useMemo(
    () =>
      poseVariableRenderGroups.flatMap((group) =>
        group.items.map((item) => item.varId),
      ),
    [poseVariableRenderGroups],
  );
  const allPoseVariablesExpanded = useMemo(
    () =>
      poseVariableIds.length > 0 &&
      poseVariableIds.every((varId) => expandedPoseVariableIds.has(varId)),
    [expandedPoseVariableIds, poseVariableIds],
  );
  const selectedRigTraversal = useMemo<RigTraversalSummary>(() => {
    if (inspectorMode !== "rig" || !resolvedSelectedRigId) {
      return EMPTY_RIG_TRAVERSAL_SUMMARY;
    }
    const downstreamConnections = collectDirectDownstreamRigInputs({
      selectedRigId: resolvedSelectedRigId,
      inputBindings,
      standardInputsById,
      includePropsRig: true,
    });
    return {
      downstreamConnections,
      downstreamInputs: downstreamConnections.filter(
        (entry) => entry.layer === "rig",
      ),
      downstreamPropsRigInputs: downstreamConnections.filter(
        (entry) => entry.layer === "propsrig",
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

  const currentInspectorChainNode = useMemo<InspectorChainNode | null>(() => {
    if (inspectorMode === "scene" && selectedId) {
      const sceneNode = sceneNodeById.get(selectedId);
      return {
        mode: "scene" as const,
        id: selectedId,
        label: sceneNode?.name || selectedId,
        view: "quick",
      };
    }
    if (inspectorMode === "rig" && selectedRigId) {
      if (resolvedSelectedRigId && selectedManagedRigEntry) {
        const rig = rigInputById.get(resolvedSelectedRigId);
        return {
          mode: "rig" as const,
          id: resolvedSelectedRigId,
          label: rig?.label || resolvedSelectedRigId,
          view: "quick",
        };
      }
      if (selectedReferenceRigInput) {
        return {
          mode: "rig" as const,
          id: selectedReferenceRigInput.id,
          label:
            selectedReferenceRigInput.label ||
            selectedReferenceRigInput.path ||
            selectedReferenceRigInput.id,
          view: "quick",
        };
      }
    }
    if (inspectorMode === "pose" && selectedPoseId) {
      if (selectedPose) {
        return {
          mode: "pose" as const,
          id: selectedPoseId,
          label: selectedPose.name || selectedPoseId,
        };
      }
      if (selectedReferencePose) {
        return {
          mode: "pose" as const,
          id: selectedReferencePose.id,
          label: selectedReferencePose.name || selectedReferencePose.id,
        };
      }
    }
    return null;
  }, [
    inspectorMode,
    poseById,
    rigInputById,
    sceneNodeById,
    selectedId,
    selectedPose,
    selectedPoseId,
    selectedReferencePose,
    selectedReferenceRigInput,
    selectedRigId,
    resolvedSelectedRigId,
    selectedManagedRigEntry,
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

  const navigateWithChain = (
    node: InspectorChainNode,
    navigate: () => void,
  ) => {
    pendingChainNavigationRef.current = node;
    navigate();
  };
  const showInspectorChainPath = useMemo(() => false, []);
  const showAuthoringStatus = false;

  const renderChainPath = () => {
    if (!showInspectorChainPath) {
      return null;
    }
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
                    handleSelectObject(entry.id);
                    return;
                  }
                  if (entry.mode === "rig") {
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
    if (!showAuthoringStatus) {
      return null;
    }
    const statusTone =
      graphStatus === "ready"
        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
        : graphStatus === "loading"
          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
          : graphStatus === "error"
            ? "text-red-300 border-red-500/40 bg-red-500/10"
            : "text-text-muted border-border-default/50 bg-bg-panel/30";
    const compileTone =
      authoringCompileStatus === "registered"
        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
        : authoringCompileStatus === "compiling" ||
            authoringCompileStatus === "dirty" ||
            authoringCompileStatus === "compiled"
          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
          : authoringCompileStatus === "runtime-error"
            ? "text-red-300 border-red-500/40 bg-red-500/10"
            : "text-text-muted border-border-default/50 bg-bg-panel/30";
    const compileLabel = visibleAuthoringCompileTarget
      ? `${visibleAuthoringCompileTarget} ${authoringCompileStatus}`
      : `asset ${authoringCompileStatus}`;
    return (
      <div
        className="flex items-center gap-1.5 flex-wrap px-1 py-0.5 mb-1"
        data-testid="authoring-compile-status-bar"
      >
        <span
          data-testid="authoring-graph-status-chip"
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
            statusTone,
          )}
        >
          Compile {graphStatus}
        </span>
        <span
          data-testid="authoring-compile-state-chip"
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
            compileTone,
          )}
        >
          {compileLabel}
        </span>
        {authoringCompileMessage ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 truncate max-w-[260px]">
            {authoringCompileMessage}
          </span>
        ) : null}
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

  const openRigInspector = (rigId: string) => {
    const rig = rigInputById.get(rigId);
    navigateWithChain(
      {
        mode: "rig",
        id: rigId,
        label: rig?.label || rigId,
        view: "quick",
      },
      () => handleSelectRig(rigId),
    );
  };

  const promptManualParentFormulaEdit = useCallback(
    (inputId: string, label: string, action: "add" | "remove") => {
      openRigInspector(inputId);
      setParentExpressionAttention({
        inputId,
        nonce: Date.now(),
        message:
          action === "add"
            ? `Parent contribution formula for "${label}" is custom. Add the new parent term manually.`
            : `Parent contribution formula for "${label}" is custom. Remove the deleted parent term manually.`,
      });
    },
    [openRigInspector],
  );

  const resolveRigInputIdForTarget = useCallback(
    (targetId: string): string | null => {
      const candidateIds = new Set<string>();
      const mappedInputId = propsrigInputIdByComponentId.get(targetId);
      if (mappedInputId) {
        candidateIds.add(mappedInputId);
      }
      collectBindingInputIds(bindings[targetId]).forEach((inputId) => {
        candidateIds.add(inputId);
      });
      for (const candidateId of candidateIds) {
        const resolvedInputId = resolveRigMetadataInputId(
          candidateId,
          standardInputsById,
        );
        if (rigInputById.has(resolvedInputId)) {
          return resolvedInputId;
        }
      }
      return null;
    },
    [propsrigInputIdByComponentId, bindings, rigInputById, standardInputsById],
  );

  const openBindingTargetInspector = useCallback(
    (targetId: string) => {
      const resolvedRigInputId = resolveRigInputIdForTarget(targetId);
      if (resolvedRigInputId) {
        openRigInspector(resolvedRigInputId);
        return;
      }
      const objectId = targetOwnerById.get(targetId);
      if (!objectId) {
        return;
      }
      const objectNode = sceneNodeById.get(objectId);
      navigateWithChain(
        {
          mode: "scene",
          id: objectId,
          label: objectNode?.name || objectId,
          view: "quick",
        },
        () => handleSelectObject(objectId),
      );
    },
    [
      handleSelectObject,
      openRigInspector,
      resolveRigInputIdForTarget,
      sceneNodeById,
      targetOwnerById,
    ],
  );

  const openRigFromChainSource = (
    rigId: string,
    _sourceKind?: PoseRigSourceKind,
  ) => {
    openRigInspector(rigId);
  };
  const resolveReferenceInputLabel = useCallback(
    (inputId: string) => {
      const runtimeInput = referenceFace.standardInputsById.get(inputId);
      if (runtimeInput) {
        return runtimeInput.label || runtimeInput.path || runtimeInput.id;
      }
      const catalogInput = referenceFace.getReferenceCatalogInput(inputId);
      if (catalogInput) {
        return catalogInput.label || catalogInput.path || catalogInput.id;
      }
      return inputId;
    },
    [referenceFace],
  );

  const renderRigScopeTabs = (showReferenceTab: boolean): ReactNode => {
    if (!showReferenceTab) {
      return null;
    }
    return (
      <div className="mx-1 mt-1 mb-2 flex items-center gap-1 rounded border border-border-default/50 bg-bg-panel/35 p-1">
        <Button
          variant={rigInspectorScope === "main" ? "primary" : "subtle"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setRigInspectorScope("main")}
        >
          Main Face
        </Button>
        <Button
          variant={rigInspectorScope === "reference" ? "primary" : "subtle"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setRigInspectorScope("reference")}
        >
          Reference Face
        </Button>
      </div>
    );
  };
  const renderPoseScopeTabs = (showReferenceTab: boolean): ReactNode => {
    if (!showReferenceTab) {
      return null;
    }
    return (
      <div className="mx-1 mt-1 mb-2 flex items-center gap-1 rounded border border-border-default/50 bg-bg-panel/35 p-1">
        <Button
          variant={poseInspectorScope === "main" ? "primary" : "subtle"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setPoseInspectorScope("main")}
        >
          Main Face
        </Button>
        <Button
          variant={poseInspectorScope === "reference" ? "primary" : "subtle"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setPoseInspectorScope("reference")}
        >
          Reference Face
        </Button>
      </div>
    );
  };

  const renderReferenceRigInspector = (params: {
    input: (typeof referenceFace.standardInputs)[number];
    linkedMainRigInputId?: string | null;
    showScopeTabs?: boolean;
    sharedMainValue?: number | null;
    sharedCombinedValue?: number;
    onSharedCombinedValueChange?: (nextValue: number) => void;
  }): ReactNode => {
    const {
      input,
      linkedMainRigInputId = null,
      showScopeTabs = false,
      sharedMainValue = null,
      sharedCombinedValue = 0,
      onSharedCombinedValueChange,
    } = params;
    const currentValue = resolveReferenceRigInputValue(input);
    const min = Number.isFinite(input.range.min) ? input.range.min : -1;
    const max = Number.isFinite(input.range.max) ? input.range.max : 1;
    const displayMin = toDisplayValue(min, input.path);
    const displayMax = toDisplayValue(max, input.path);
    const displayCurrentValue = toDisplayValue(currentValue, input.path);
    const displaySharedCombinedValue = toDisplayValue(
      sharedCombinedValue,
      input.path,
    );
    const step = resolveDisplayStep(min, max, input.path);
    const catalogInput = referenceFace.getReferenceCatalogInput(input.id);
    const rigValuesMatch =
      sharedMainValue === null ||
      Math.abs(sharedMainValue - currentValue) <= SYNC_VALUE_EPSILON;
    const updateReferenceValue = (nextValue: number) => {
      setReferenceRigInputValue(input, nextValue, { min, max });
    };

    return (
      <div className="flex flex-col gap-1 p-1">
        <InspectorHeader
          name={input.label || input.path || input.id}
          typeLabel="Reference Driver"
          id={input.id}
          onNameChange={() => undefined}
        />
        {renderChainPath()}
        {renderAuthoringStatus()}
        {renderRigScopeTabs(showScopeTabs)}
        {showScopeTabs && onSharedCombinedValueChange ? (
          <div className="mx-1 mb-2 flex flex-col gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-2">
            <span className="text-[10px] uppercase tracking-wider text-cyan-100">
              Both Faces Value
            </span>
            <div className="flex items-center gap-2">
              <Slider
                value={displaySharedCombinedValue}
                min={displayMin}
                max={displayMax}
                step={step}
                defaultValue={toDisplayValue(input.defaultValue, input.path)}
                fillMode="value"
                className="flex-1"
                onChange={(nextValue) =>
                  onSharedCombinedValueChange(
                    clampToRange(
                      fromDisplayValue(
                        typeof nextValue === "number"
                          ? nextValue
                          : (nextValue[0] ?? 0),
                        input.path,
                      ),
                      min,
                      max,
                    ),
                  )
                }
              />
              <NumberField
                value={displaySharedCombinedValue}
                min={displayMin}
                max={displayMax}
                step={step}
                size="sm"
                className="w-[108px]"
                allowScrub={false}
                onChange={(nextValue) =>
                  onSharedCombinedValueChange(
                    clampToRange(
                      fromDisplayValue(nextValue, input.path),
                      min,
                      max,
                    ),
                  )
                }
              />
            </div>
            {!rigValuesMatch ? (
              <span className="text-[10px] text-amber-100">
                Faces are currently controlled individually. Set this slider to
                re-sync both.
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 p-2">
          <div className="rounded border border-violet-500/35 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-100 font-mono truncate">
            {input.path}
          </div>
          {linkedMainRigInputId ? (
            <div className="flex items-center justify-between gap-2 rounded border border-border-default/55 bg-bg-panel/35 px-2 py-1.5">
              <span className="text-[10px] text-text-secondary">
                Linked main driver
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-mono"
                onClick={() => openRigInspector(linkedMainRigInputId)}
              >
                {linkedMainRigInputId}
              </Button>
            </div>
          ) : null}
          <div className="rounded border border-border-default/60 bg-bg-panel/30 px-2 py-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Current Value
              </span>
              <NumberField
                value={displayCurrentValue}
                min={displayMin}
                max={displayMax}
                step={step}
                size="sm"
                className="w-[108px]"
                onChange={(nextValue) =>
                  updateReferenceValue(fromDisplayValue(nextValue, input.path))
                }
              />
            </div>
            <Slider
              value={displayCurrentValue}
              min={displayMin}
              max={displayMax}
              step={step}
              defaultValue={toDisplayValue(input.defaultValue, input.path)}
              fillMode="value"
              onChange={(nextValue) =>
                updateReferenceValue(
                  fromDisplayValue(
                    typeof nextValue === "number"
                      ? nextValue
                      : (nextValue[0] ?? 0),
                    input.path,
                  ),
                )
              }
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => updateReferenceValue(min)}
              >
                Min
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => updateReferenceValue(input.defaultValue)}
              >
                Def
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => updateReferenceValue(max)}
              >
                Max
              </Button>
            </div>
          </div>
          <div className="rounded border border-border-default/50 bg-bg-panel/20 px-2 py-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Pipeline Links
            </span>
            <span className="text-[10px] text-text-secondary">
              Parents: {catalogInput?.parents.length ?? 0}
            </span>
            {catalogInput?.parents.map((link) => (
              <span
                key={`reference-parent:${link.linkId}`}
                className="text-[10px] font-mono text-text-muted truncate"
                title={resolveReferenceInputLabel(link.parentInputId)}
              >
                Parent: {resolveReferenceInputLabel(link.parentInputId)}
              </span>
            ))}
            <span className="text-[10px] text-text-secondary mt-1">
              Children: {catalogInput?.children.length ?? 0}
            </span>
            {catalogInput?.children.map((link) => (
              <span
                key={`reference-child:${link.linkId}`}
                className="text-[10px] font-mono text-text-muted truncate"
                title={resolveReferenceInputLabel(link.childInputId)}
              >
                Child: {resolveReferenceInputLabel(link.childInputId)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };
  const renderReferencePoseInspector = (params: {
    pose: (typeof referenceFace.referenceCatalog.poses)[number];
    showScopeTabs?: boolean;
    sharedMainWeightValue?: number | null;
    sharedCombinedValue?: number;
    onSharedCombinedValueChange?: (nextValue: number) => void;
  }): ReactNode => {
    const {
      pose,
      showScopeTabs = false,
      sharedMainWeightValue = null,
      sharedCombinedValue = 0,
      onSharedCombinedValueChange,
    } = params;
    const poseWeightPath = buildPoseWeightRelativePath(pose.id);
    const poseWeightInput =
      referencePoseWeightInputByPoseId.get(pose.id) ?? null;
    const poseWeightDefault = poseWeightInput?.defaultValue ?? 0;
    const referencePoseWeightValue = resolveReferencePoseWeightValue(pose.id);
    const poseWeightsMatch =
      sharedMainWeightValue === null ||
      Math.abs(sharedMainWeightValue - referencePoseWeightValue) <=
        SYNC_VALUE_EPSILON;
    const applyReferencePose = () => {
      referenceFace.referenceCatalog.poses.forEach((referencePoseEntry) => {
        referenceFace.handleInputPathValueChange(
          buildPoseWeightRelativePath(referencePoseEntry.id),
          referencePoseEntry.id === pose.id ? 1 : 0,
        );
      });
    };
    const resetReferencePose = () => {
      referenceFace.handleInputPathValueChange(
        poseWeightPath,
        poseWeightDefault,
      );
    };

    return (
      <div className="flex flex-col gap-1 p-1">
        <InspectorHeader
          name={pose.name}
          typeLabel="Reference Pose"
          id={pose.id}
          icon={Activity}
          onNameChange={() => undefined}
        />
        {renderChainPath()}
        {renderAuthoringStatus()}
        {renderPoseScopeTabs(showScopeTabs)}
        {showScopeTabs && onSharedCombinedValueChange ? (
          <div className="mx-1 mb-2 flex flex-col gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-2">
            <span className="text-[10px] uppercase tracking-wider text-cyan-100">
              Both Faces Weight
            </span>
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={sharedCombinedValue}
                fillMode="value"
                className="flex-1"
                onChange={(nextValue) =>
                  onSharedCombinedValueChange(
                    clamp01(
                      typeof nextValue === "number"
                        ? nextValue
                        : (nextValue[0] ?? 0),
                    ),
                  )
                }
              />
              <NumberField
                value={sharedCombinedValue}
                min={0}
                max={1}
                step={0.01}
                size="sm"
                className="w-[92px]"
                allowScrub={false}
                onChange={(nextValue) =>
                  onSharedCombinedValueChange(clamp01(nextValue))
                }
              />
            </div>
            {!poseWeightsMatch ? (
              <span className="text-[10px] text-amber-100">
                Faces are currently controlled individually. Set this slider to
                re-sync both.
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 p-2">
          <RiggingPropertyRow
            label="Reference Weight"
            onScrub={(_, totalDelta) =>
              setReferencePoseWeightValue(
                pose.id,
                clamp01(referencePoseWeightValue + totalDelta / 100),
              )
            }
            renderMainInput={() => (
              <div className="flex flex-wrap items-center gap-2 flex-1 group/row inspector-row-hit-target">
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={referencePoseWeightValue}
                  fillMode="value"
                  className="flex-1"
                  onChange={(nextValue) =>
                    setReferencePoseWeightValue(
                      pose.id,
                      clamp01(
                        typeof nextValue === "number"
                          ? nextValue
                          : (nextValue[0] ?? 0),
                      ),
                    )
                  }
                />
                <div className="inspector-numeric-control flex-shrink-0">
                  <NumberField
                    value={referencePoseWeightValue}
                    min={0}
                    max={1}
                    step={0.01}
                    size="sm"
                    className="w-full"
                    allowScrub={false}
                    onChange={(nextValue) =>
                      setReferencePoseWeightValue(pose.id, clamp01(nextValue))
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-text-muted hover:text-text-primary"
                  title="Apply full reference pose weight"
                  onClick={() => setReferencePoseWeightValue(pose.id, 1)}
                >
                  <Play size={12} fill="currentColor" />
                </Button>
              </div>
            )}
          />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={applyReferencePose}
            >
              <Play size={11} className="mr-1" />
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={resetReferencePose}
            >
              <RotateCcw size={11} className="mr-1" />
              Reset
            </Button>
          </div>
          <div className="rounded border border-violet-500/35 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-100 font-mono truncate">
            Weight path: {poseWeightPath}
          </div>
          <div className="rounded border border-border-default/50 bg-bg-panel/20 px-2 py-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Pose Targets
              </span>
              <span className="text-[10px] text-text-muted font-mono">
                {pose.targets.length}
              </span>
            </div>
            {pose.targets.length === 0 ? (
              <span className="text-[10px] text-text-muted">
                No target values found on this reference pose.
              </span>
            ) : (
              pose.targets.map((target) => {
                const runtimeInput =
                  referenceFace.standardInputsById.get(target.inputId) ?? null;
                const catalogInput = referenceFace.getReferenceCatalogInput(
                  target.inputId,
                );
                const label =
                  runtimeInput?.label ||
                  catalogInput?.label ||
                  catalogInput?.path ||
                  target.inputId;
                const liveValue = runtimeInput
                  ? (referenceFace.inputValues[runtimeInput.id] ??
                    runtimeInput.defaultValue)
                  : target.value;
                return (
                  <div
                    key={`reference-pose-target:${target.inputId}`}
                    className="rounded border border-border-default/40 bg-bg-panel/30 px-2 py-1.5 flex items-center gap-2"
                  >
                    <span
                      className="flex-1 text-[10px] text-text-secondary truncate"
                      title={label}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">
                      Pose {target.value.toFixed(3)}
                    </span>
                    <span className="text-[10px] font-mono text-text-primary">
                      Live {liveValue.toFixed(3)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] font-mono"
                      onClick={() => handleSelectRig(target.inputId)}
                    >
                      Inspect
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // 1. Scene Object Mode
  if (inspectorMode === "scene" && selectedId) {
    const node = getNode(selectedId);
    if (node) {
      const lockableTargetIds = collectLockableTargetIdsForNode(node);
      const lockedTargetCount = lockableTargetIds.reduce(
        (count, targetId) =>
          lockedInspectorTargetIds.has(targetId) ? count + 1 : count,
        0,
      );
      const hasLockableTargets = lockableTargetIds.length > 0;
      const isElementFullyLocked =
        hasLockableTargets && lockedTargetCount === lockableTargetIds.length;
      const lockSummary = hasLockableTargets
        ? isElementFullyLocked
          ? "All properties locked."
          : lockedTargetCount > 0
            ? `${lockedTargetCount}/${lockableTargetIds.length} properties locked.`
            : "No properties locked."
        : "No lockable properties on this element.";

      return (
        <div className="flex flex-col gap-1 p-1">
          <InspectorHeader
            name={node.name || node.id}
            typeLabel={node.type}
            id={node.id}
            nameEditable={false}
            onNameChange={(name) => handleRenameShape(node.id, name)}
          />
          {renderChainPath()}
          {renderAuthoringStatus()}
          {hasLockableTargets ? (
            <div className="mx-1 flex items-center justify-between rounded-md border border-border-default/70 bg-bg-secondary/50 px-2 py-1">
              <p className="text-[11px] text-text-secondary">{lockSummary}</p>
              <Button
                variant={isElementFullyLocked ? "secondary" : "ghost"}
                size="sm"
                className={
                  isElementFullyLocked
                    ? "text-rose-300 hover:text-rose-200"
                    : "text-sky-300 hover:text-sky-200"
                }
                onClick={() => {
                  const nextLocked = !isElementFullyLocked;
                  lockableTargetIds.forEach((targetId) => {
                    handleSetInspectorTargetLocked(targetId, nextLocked);
                  });
                }}
                title={
                  isElementFullyLocked
                    ? "Unlock all face-element properties."
                    : "Lock all face-element properties."
                }
              >
                {isElementFullyLocked ? (
                  <Lock size={12} className="mr-1 shrink-0" />
                ) : (
                  <LockOpen size={12} className="mr-1 shrink-0" />
                )}
                {isElementFullyLocked
                  ? "Unlock All Properties"
                  : "Lock All Properties"}
              </Button>
            </div>
          ) : null}
          <RiggingTransformSection node={node} />

          <RiggingMorphTargetsSection node={node} />
          <RiggingMaterialSection node={node} />
          <BindingConnections
            node={node}
            onSelectPose={openPoseInspector}
            onSelectRig={openRigFromChainSource}
            onSelectTarget={openBindingTargetInspector}
          />
        </div>
      );
    }
    if (selectedReferenceRigInput) {
      const linkedMainRigInputId =
        mainRigInputIdByPath.get(
          normalizeStandardRigInputPath(selectedReferenceRigInput.path),
        ) ?? null;
      return renderReferenceRigInspector({
        input: selectedReferenceRigInput,
        linkedMainRigInputId,
      });
    }
  }

  if (inspectorMode === "pose" && selectedReferencePose) {
    return renderReferencePoseInspector({ pose: selectedReferencePose });
  }

  // 2. Pose Mode
  if (inspectorMode === "pose" && selectedPose) {
    const pose = selectedPose;
    const showReferencePoseTab = Boolean(
      selectedSharedReferencePose && hasReferenceFaceFile,
    );
    const mainPoseWeightValue = selectedPoseWeightInputId
      ? selectedPoseWeightValue
      : blendAmount;
    if (
      showReferencePoseTab &&
      selectedSharedReferencePose &&
      poseInspectorScope === "reference"
    ) {
      const handleSharedPoseWeightChange = (nextValue: number) => {
        const clamped = clamp01(nextValue);
        setSharedPoseCombinedValue(clamped);
        if (selectedPoseWeightInputId) {
          handleInputValueChange(selectedPoseWeightInputId, clamped);
        } else {
          setBlendAmount(clamped);
        }
        setReferencePoseWeightValue(selectedSharedReferencePose.id, clamped);
      };
      return renderReferencePoseInspector({
        pose: selectedSharedReferencePose,
        showScopeTabs: true,
        sharedMainWeightValue: mainPoseWeightValue,
        sharedCombinedValue: sharedPoseCombinedValue,
        onSharedCombinedValueChange: handleSharedPoseWeightChange,
      });
    }
    const handleSharedPoseWeightChange = (nextValue: number) => {
      const clamped = clamp01(nextValue);
      setSharedPoseCombinedValue(clamped);
      if (selectedPoseWeightInputId) {
        handleInputValueChange(selectedPoseWeightInputId, clamped);
      } else {
        setBlendAmount(clamped);
      }
      if (selectedSharedReferencePose) {
        setReferencePoseWeightValue(selectedSharedReferencePose.id, clamped);
      }
    };
    const referencePoseWeightValue = selectedSharedReferencePose
      ? resolveReferencePoseWeightValue(selectedSharedReferencePose.id)
      : null;
    const poseWeightsMatch =
      referencePoseWeightValue === null ||
      Math.abs(mainPoseWeightValue - referencePoseWeightValue) <=
        SYNC_VALUE_EPSILON;
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
      if (selection.type === "mixed") {
        const variableIds = Array.from(
          new Set(
            selection.variableIds
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          ),
        );
        if (variableIds.length > 0) {
          handleAddVariable({
            type: "variable",
            id: variableIds[0]!,
            ids: variableIds,
          });
        }
        if (
          selection.propertyTargetIds.length > 0 ||
          selection.propertyInputIds.length > 0
        ) {
          handleAddVariable({
            type: "property",
            objectId: "propsrig",
            featureId: "propsrig",
            label: selection.label,
            inputIds: selection.propertyInputIds,
            targetIds: selection.propertyTargetIds,
          });
        }
        return;
      }
      if (selection.type === "variable") {
        const inputIds =
          selection.ids && selection.ids.length > 0
            ? selection.ids
            : [selection.id];
        inputIds.forEach((inputId) => addPoseInput(pose.id, inputId));
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
        propsrigInputIdByComponentId,
      });

      if (resolvedInputIds.length === 0) {
        alertDialog(
          "Selected properties are not currently mapped to existing rig drivers.",
        );
        return;
      }

      resolvedInputIds.forEach((inputId) => addPoseInput(pose.id, inputId));
    };

    const poseSemanticTooltips: PoseSemanticTooltips = {
      target:
        "Control Target: authored pose value for this rig input when the pose contributes at 100%.",
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
    const handleToggleAllPoseVariables = () => {
      setExpandedPoseVariableIds(() =>
        allPoseVariablesExpanded ? new Set() : new Set(poseVariableIds),
      );
    };
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
        {renderPoseScopeTabs(showReferencePoseTab)}
        {showReferencePoseTab ? (
          <div className="mx-1 mb-2 flex flex-col gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-2">
            <span className="text-[10px] uppercase tracking-wider text-cyan-100">
              Both Faces Weight
            </span>
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={sharedPoseCombinedValue}
                fillMode="value"
                className="flex-1"
                onChange={(nextValue) =>
                  handleSharedPoseWeightChange(
                    typeof nextValue === "number"
                      ? nextValue
                      : (nextValue[0] ?? 0),
                  )
                }
              />
              <NumberField
                value={sharedPoseCombinedValue}
                min={0}
                max={1}
                step={0.01}
                size="sm"
                className="w-[92px]"
                allowScrub={false}
                onChange={(nextValue) =>
                  handleSharedPoseWeightChange(nextValue)
                }
              />
            </div>
            {!poseWeightsMatch ? (
              <span className="text-[10px] text-amber-100">
                Faces are currently controlled individually. Set this slider to
                re-sync both.
              </span>
            ) : null}
          </div>
        ) : null}
        <RiggingPropertyRow
          label="Set Pose Percentage:"
          onScrub={(_, totalDelta) => {
            // Blend based on delta (assuming 100px = 100% blend)
            const newAmount = Math.max(
              0,
              Math.min(1, blendAmount + totalDelta / 100),
            );
            handleBlend(newAmount);
          }}
          renderMainInput={() => (
            <div
              className="flex flex-1 flex-col gap-1.5 group/row inspector-row-hit-target"
              title={poseSemanticTooltips.contribution}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0 text-text-muted hover:text-text-primary"
                  title="Play Pose (100%)"
                  onClick={() => {
                    handleBlend(1);
                  }}
                >
                  <Play size={12} fill="currentColor" />
                </Button>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={blendAmount}
                  fillMode="value"
                  className="flex-1"
                  onChange={(val) => handleBlend(val as number)}
                />
              </div>
              <div className="pl-8">
                <div className="inspector-numeric-control w-[84px] flex-shrink-0">
                  <Input
                    size="sm"
                    type="text"
                    value={(blendAmount * 100).toFixed(0) + "%"}
                    className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-text-muted"
                    readOnly
                  />
                </div>
              </div>
            </div>
          )}
        />
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="h-px bg-border-default flex-1" />
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider whitespace-nowrap">
            What I Drive · {Object.keys(pose.values).length} Drivers
          </span>
          <div className="h-px bg-border-default flex-1" />
        </div>
        <div className="mb-2 flex px-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] whitespace-nowrap"
            onClick={handleToggleAllPoseVariables}
          >
            {allPoseVariablesExpanded ? "Collapse All" : "Expand All"}
          </Button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1 min-h-[100px] pr-1">
          {poseVariableRenderGroups.length === 0 && (
            <EmptyState
              icon={Sliders}
              iconSize={18}
              title="No Connected Drivers"
              description="This pose has no driver targets yet. Connect one or more rig drivers to define the pose output."
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
                  const isExpanded = expandedPoseVariableIds.has(varId);
                  const displayPoseValue = toDisplayValue(
                    item.poseVal,
                    item.path,
                  );
                  const {
                    label,
                    poseComposeMode,
                    canInspectVariable,
                    chainSummary,
                    drivenVariableCount,
                    drivenPropertyCount,
                  } = item;

                  return (
                    <div
                      key={`${pose.id}:${varId}`}
                      className="flex flex-col gap-2 rounded border border-border-default/50 bg-bg-panel/30 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="mt-0.5 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePoseVariableExpansion(varId);
                          }}
                          aria-expanded={isExpanded}
                          title={
                            isExpanded
                              ? "Collapse channel details"
                              : "Expand channel details"
                          }
                        >
                          {isExpanded ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex flex-wrap items-center gap-2 flex-1 min-w-0 rounded px-1 py-0.5 cursor-pointer hover:bg-bg-hover/40"
                          onClick={() => togglePoseVariableExpansion(varId)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              togglePoseVariableExpansion(varId);
                            }
                          }}
                          aria-expanded={isExpanded}
                          title={
                            isExpanded
                              ? "Collapse channel details"
                              : "Expand channel details"
                          }
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="text-xs font-medium text-text-primary truncate">
                              {label}
                            </span>
                          </div>
                          <div className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              className="text-[9px] font-mono whitespace-nowrap rounded border border-amber-300/70 bg-amber-500/12 px-1 py-0.5 text-amber-200"
                              title={poseSemanticTooltips.target}
                            >
                              Target {displayPoseValue.toFixed(4)}
                            </span>
                            <label
                              className="inline-flex items-center gap-1 rounded border border-border-default/60 bg-bg-panel/40 px-1 py-0.5 text-[9px] text-text-muted"
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <span className="uppercase tracking-wide font-bold">
                                Compose
                              </span>
                              <select
                                className="rounded border border-border-default/50 bg-bg-panel/40 px-1 py-0.5 text-[9px] text-text-primary"
                                value={poseComposeMode}
                                title="Compose direct/current value with this pose target for this channel."
                                onMouseDown={(event) => event.stopPropagation()}
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
                              className="h-6 w-6 p-0 rounded border border-border-default/60 text-text-secondary hover:text-red-400 hover:border-red-400/70"
                              title="Remove from Pose"
                              onClick={(event) => {
                                event.stopPropagation();
                                removePoseInput(pose.id, varId);
                              }}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="ml-6 flex flex-col gap-2">
                          <PoseVariableExpandedControls
                            poseId={pose.id}
                            item={item}
                            poseSemanticTooltips={poseSemanticTooltips}
                            onInputValueChange={handleInputValueChange}
                            onUpdatePoseValue={updatePoseValue}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default/50 pt-2">
                            <span
                              className="text-[9px] text-text-muted font-mono"
                              title={`Downstream links from this channel: drives ${drivenVariableCount} driver${drivenVariableCount === 1 ? "" : "s"} and ${drivenPropertyCount} propert${drivenPropertyCount === 1 ? "y" : "ies"}.`}
                            >
                              {chainSummary ?? "0 vars · 0 props"}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] font-mono text-text-muted hover:text-text-primary"
                              title={`Inspect driver ${varId}`}
                              disabled={!canInspectVariable}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canInspectVariable) {
                                  openRigInspector(varId);
                                }
                              }}
                            >
                              {varId}
                              <ChevronRight size={11} />
                            </Button>
                          </div>
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
          <span className="font-normal text-xs">Connect Driver to Pose</span>
        </Button>
        <Modal
          open={showSelector}
          onClose={() => setShowSelector(false)}
          title="Connect Driver to Pose"
          maxWidth="md"
        >
          <VariableSelector
            onSelect={handleAddVariable}
            onCancel={() => setShowSelector(false)}
          />
        </Modal>
      </div>
    );
  }

  // 3. Rig Mode
  if (inspectorMode === "rig" && resolvedSelectedRigId) {
    const rigInput = selectedManagedRigEntry;
    if (rigInput) {
      const input = rigInput.input;
      const showReferenceRigTab = Boolean(
        selectedSharedReferenceRigInput && hasReferenceFaceFile,
      );
      const value = inputValues[input.id] ?? input.defaultValue ?? 0;
      const referenceSharedValue =
        showReferenceRigTab && selectedSharedReferenceRigInput
          ? resolveReferenceRigInputValue(selectedSharedReferenceRigInput)
          : null;
      const handleSharedRigValueChange = (nextValue: number) => {
        const clamped = clampToRange(
          nextValue,
          input.range.min,
          input.range.max,
        );
        setSharedRigCombinedValue(clamped);
        handleInputValueChange(input.id, clamped);
        if (selectedSharedReferenceRigInput) {
          setReferenceRigInputValue(selectedSharedReferenceRigInput, clamped, {
            min: input.range.min,
            max: input.range.max,
          });
        }
      };
      if (
        showReferenceRigTab &&
        selectedSharedReferenceRigInput &&
        rigInspectorScope === "reference"
      ) {
        return renderReferenceRigInspector({
          input: selectedSharedReferenceRigInput,
          linkedMainRigInputId: input.id,
          showScopeTabs: true,
          sharedMainValue: value,
          sharedCombinedValue: sharedRigCombinedValue,
          onSharedCombinedValueChange: handleSharedRigValueChange,
        });
      }
      const activeFaceId =
        runtimeFaceId && runtimeFaceId.trim().length > 0
          ? runtimeFaceId
          : "robot";
      const overrideEnabledPath = buildRigPipelineV1OverrideEnabledPath(
        activeFaceId,
        input.id,
      );
      const overrideValuePath = buildRigPipelineV1OverrideValuePath(
        activeFaceId,
        input.id,
      );
      const directInputRuntimePath = `rig/${activeFaceId}/${normalizeStandardRigInputPath(
        input.path,
      ).replace(/^\/+/, "")}`;
      const parentBinding = inputBindings[input.id];
      const isRemovableCustomInput = rigInput.source === "custom";
      const deleteGuardrailMessage = isRemovableCustomInput
        ? null
        : "This driver is system-managed and cannot be deleted from the inspector.";
      const controllableResolution = resolveControllableInputId(
        input.id,
        inputBindings,
      );
      const isLockedFromFaceInspector = lockedPropsRigInputIds.has(input.id);
      const isDirectRigControlAvailable =
        !isLockedFromFaceInspector &&
        !controllableResolution.blockedReason &&
        (controllableResolution.inputId === null ||
          controllableResolution.inputId === input.id);
      const directRigControlReason = isLockedFromFaceInspector
        ? "Direct input is disabled while this property is locked in the Face Element inspector."
        : controllableResolution.blockedReason
          ? controllableResolution.blockedReason
          : controllableResolution.inputId &&
              controllableResolution.inputId !== input.id
            ? `This driver is derived from "${controllableResolution.inputId}" without a local self slot. Use the Parents expression/links below to add local control or adjust "${controllableResolution.inputId}".`
            : null;
      const {
        downstreamInputs,
        downstreamPropsRigInputs,
        directDependents,
        dependents,
      } = selectedRigTraversal;
      const parentRigInputRefs = collectBindingInputIds(parentBinding)
        .filter((candidateId) => candidateId !== input.id)
        .map((candidateId) => {
          const parentEntry = standardInputsById.get(candidateId);
          const linkId = buildRigPipelineV1LinkId(candidateId, input.id);
          const linkConfig = pipelineLinksById.get(linkId);
          return {
            id: candidateId,
            linkId,
            label: parentEntry?.label || parentEntry?.path || candidateId,
            isPropsRig: isCanonicalPropsRigInputPath(parentEntry?.path),
            linkScale: linkConfig?.scale ?? 1,
            linkOffset: linkConfig?.offset ?? 0,
            linkEnabled: linkConfig?.enabled ?? true,
            linkExpression: linkConfig?.expression ?? null,
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
      type PipelineMetadataPatch = {
        directInputEnabled?: boolean;
        overrideEnabled?: boolean;
        overrideValue?: number;
        clampEnabled?: boolean;
        parentBlendExpression?: string | null;
        linkUpserts?: Record<
          string,
          {
            parentInputId?: string;
            childInputId?: string;
            scale?: number;
            offset?: number;
            enabled?: boolean;
            expression?: string | null;
          }
        >;
        linkDeletes?: readonly string[];
        migrationStatus?: "migrated";
        migrationSource?: string;
        migrationExpression?: string;
        legacyReadOnly?: boolean;
        legacyReadOnlyReason?: string;
      };
      const resolvePatchedPipelineMetadata = (
        pipelineMetadata:
          | Record<string, unknown>
          | RigPipelineV1Metadata
          | null
          | undefined,
        patch?: PipelineMetadataPatch,
      ): RigPipelineV1Metadata | null => {
        if (!patch) {
          return (
            (pipelineMetadata as RigPipelineV1Metadata | null | undefined) ??
            null
          );
        }
        const merged = mergePipelineMetadata(
          pipelineMetadata
            ? {
                vizij: {
                  pipelineV1: pipelineMetadata as Record<string, unknown>,
                },
              }
            : undefined,
          patch,
        );
        return (
          (asObject(
            asObject(merged.vizij)?.pipelineV1,
          ) as RigPipelineV1Metadata | null) ?? null
        );
      };
      const resolveParentContributionSourcesForInput = (params: {
        childInputId: string;
        pipelineMetadata:
          | Record<string, unknown>
          | RigPipelineV1Metadata
          | null
          | undefined;
        patch?: PipelineMetadataPatch;
      }): RigPipelineV1ParentContributionSource[] => {
        const childInput = standardInputsById.get(params.childInputId);
        if (!childInput) {
          return [];
        }
        const resolvedMetadata = resolvePatchedPipelineMetadata(
          params.pipelineMetadata,
          params.patch,
        );
        const linksById = asObject(resolvedMetadata?.links);
        const childBinding =
          bindingAuthoringStore.getState().inputBindings[params.childInputId] ??
          inputBindings[params.childInputId];
        const slotByInputId = new Map<
          string,
          {
            slot: NonNullable<typeof childBinding>["slots"][number];
            index: number;
          }
        >();
        (childBinding?.slots ?? []).forEach((slot, index) => {
          const rawInputId = slot.inputId?.trim() ?? "";
          if (!rawInputId || rawInputId === SELF_BINDING_ID) {
            return;
          }
          const resolvedInputId = resolveRigMetadataInputId(
            rawInputId,
            standardInputsById,
          );
          slotByInputId.set(resolvedInputId, { slot, index });
        });
        const resolvedConfig = resolveRigPipelineV1InputConfig({
          faceId: runtimeFaceId?.trim() || "robot",
          input: childInput,
          pipelineV1: resolvedMetadata ?? undefined,
        });
        return resolvedConfig.parents
          .filter((parent) => parent.enabled)
          .map((parent) => {
            const linkConfig = asObject(linksById?.[parent.linkId]);
            const linkExpression =
              typeof linkConfig?.expression === "string" &&
              linkConfig.expression.trim().length > 0
                ? linkConfig.expression.trim()
                : null;
            return {
              alias: resolveAuthoringParentExpressionVariable({
                input: standardInputsById.get(parent.inputId),
                slot: slotByInputId.get(parent.inputId)?.slot ?? null,
                slotIndex: slotByInputId.get(parent.inputId)?.index,
                linkExpression,
                fallbackAlias: parent.alias,
              }),
              ...(linkExpression ? { expression: linkExpression } : {}),
            };
          });
      };
      const queueParentBlendExpressionSync = (params: {
        childInputId: string;
        previousParentVariables: readonly RigPipelineV1ParentContributionSource[];
        linkUpserts?: PipelineMetadataPatch["linkUpserts"];
        linkDeletes?: readonly string[];
        manualNotice?: string | null;
      }) => {
        const currentState = bindingAuthoringStore.getState();
        const previousExpression =
          readParentBlendExpressionFromPipelineMetadata(
            currentState.pipelineMetadataV1 as
              | Record<string, unknown>
              | null
              | undefined,
            params.childInputId,
          );
        const rewriteParentBlend = isAutoParentBlendExpression(
          previousExpression,
          params.previousParentVariables,
        );
        applyInputBindingPatch((previous) => {
          const childInput = standardInputsById.get(params.childInputId);
          if (!childInput) {
            return previous;
          }
          const existingBinding =
            previous[params.childInputId] ??
            createDefaultParentBinding(bindingTargetFromInput(childInput));
          const nextParentVariables = resolveParentContributionSourcesForInput({
            childInputId: params.childInputId,
            pipelineMetadata: currentState.pipelineMetadataV1,
            patch: {
              ...(params.linkUpserts
                ? { linkUpserts: params.linkUpserts }
                : {}),
              ...(params.linkDeletes && params.linkDeletes.length > 0
                ? { linkDeletes: params.linkDeletes }
                : {}),
            },
          });
          const nextExpression = rewriteParentBlend
            ? resolveParentBlendExpressionUpdate({
                previousExpression,
                previousParentVariables: params.previousParentVariables,
                nextParentVariables,
              }).nextExpression
            : previousExpression;
          const nextMetadata = mergePipelineMetadata(
            (existingBinding.metadata ?? undefined) as
              | Record<string, unknown>
              | undefined,
            {
              ...(params.linkDeletes && params.linkDeletes.length > 0
                ? { linkDeletes: params.linkDeletes }
                : {}),
              ...(rewriteParentBlend
                ? { parentBlendExpression: nextExpression }
                : {}),
            },
          );
          const previousMetadataSignature = JSON.stringify(
            existingBinding.metadata ?? null,
          );
          const nextMetadataSignature = JSON.stringify(nextMetadata);
          if (
            previous[params.childInputId] &&
            previousMetadataSignature === nextMetadataSignature
          ) {
            return previous;
          }
          return {
            ...previous,
            [params.childInputId]: {
              ...existingBinding,
              metadata: nextMetadata,
            },
          };
        });
        if (!rewriteParentBlend && params.manualNotice) {
          const childLabel =
            standardInputsById.get(params.childInputId)?.label ??
            params.childInputId;
          promptManualParentFormulaEdit(
            params.childInputId,
            childLabel,
            params.linkDeletes && params.linkDeletes.length > 0
              ? "remove"
              : "add",
          );
        }
      };
      const addParentLinkForInput = (
        childInputId: string,
        parentInputId: string,
      ) => {
        const currentState = bindingAuthoringStore.getState();
        const previousParentVariables =
          resolveParentContributionSourcesForInput({
            childInputId,
            pipelineMetadata: currentState.pipelineMetadataV1,
          });
        const childInput = currentState.standardInputsById.get(childInputId);
        const defaultOffset =
          childInput && Number.isFinite(childInput.defaultValue)
            ? childInput.defaultValue
            : 0;
        const linkId = buildRigPipelineV1LinkId(parentInputId, childInputId);
        const linkUpserts = {
          [linkId]: {
            parentInputId,
            childInputId,
            scale: 1,
            offset: defaultOffset,
            enabled: true,
          },
        };
        handleCreateParentDriverBinding(childInputId, parentInputId);
        applyPipelineMetadataPatchForInput(childInputId, {
          linkUpserts,
          migrationStatus: "migrated",
          migrationSource: "staged-link-authoring",
        });
        queueParentBlendExpressionSync({
          childInputId,
          previousParentVariables,
          linkUpserts,
          manualNotice:
            "Parent contribution formula uses a custom expression and was not rewritten. Update the formula above to include the new parent variable.",
        });
      };
      const removeParentLinkForInput = (
        childInputId: string,
        parentInputId: string,
      ) => {
        const currentState = bindingAuthoringStore.getState();
        const previousParentVariables =
          resolveParentContributionSourcesForInput({
            childInputId,
            pipelineMetadata: currentState.pipelineMetadataV1,
          });
        handleUnlinkChildInput(parentInputId, childInputId);
        queueParentBlendExpressionSync({
          childInputId,
          previousParentVariables,
          linkDeletes: [buildRigPipelineV1LinkId(parentInputId, childInputId)],
          manualNotice:
            "Parent contribution formula uses a custom expression and was not rewritten. Update the formula above to remove the deleted parent variable.",
        });
      };

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
        const displayMin = parseDraftNumber(rigRangeMinDraft, "Minimum value");
        if (displayMin === null) {
          return;
        }
        const displayMax = parseDraftNumber(rigRangeMaxDraft, "Maximum value");
        if (displayMax === null) {
          return;
        }
        const displayDefault = parseDraftNumber(
          rigDefaultDraft,
          "Default value",
        );
        if (displayDefault === null) {
          return;
        }
        const parsedMin = fromDisplayValue(displayMin, input.path);
        const parsedMax = fromDisplayValue(displayMax, input.path);
        const parsedDefault = fromDisplayValue(displayDefault, input.path);
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
        setRigDefaultDraft(
          formatDraftDisplayNumber(reactivity.defaultValue, input.path),
        );
        setRigRangeMinDraft(
          formatDraftDisplayNumber(reactivity.range.min, input.path),
        );
        setRigRangeMaxDraft(
          formatDraftDisplayNumber(reactivity.range.max, input.path),
        );
        setRigLifecycleMessage({
          tone: "info",
          text: "Driver metadata updated.",
        });
      };

      const handleRigPathChange = (nextPath: string): boolean => {
        const trimmedPath = nextPath.trim();
        if (!trimmedPath) {
          setRigLifecycleMessage({
            tone: "error",
            text: "Path cannot be empty.",
          });
          return false;
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
            text: `Another driver already uses "${normalizedPath}".`,
          });
          return false;
        }
        handleUpdateStandardInput(input.id, { path: normalizedPath });
        setRigPathDraft(normalizedPath);
        setRigLifecycleMessage(null);
        return true;
      };

      const handleApplyRigPathDraft = () => {
        const normalizedDraft = normalizeStandardRigInputPath(rigPathDraft);
        const normalizedCurrent = normalizeStandardRigInputPath(input.path);
        if (normalizedDraft === normalizedCurrent) {
          setRigPathDraft(normalizedCurrent);
          return;
        }
        handleRigPathChange(rigPathDraft);
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
          impactNotes.push(`${downstreamInputs.length} downstream driver(s)`);
        }
        if (downstreamPropsRigInputs.length > 0) {
          impactNotes.push(
            `${downstreamPropsRigInputs.length} downstream props rig driver(s)`,
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
          `Delete custom driver "${label}"?${impactSummary}`,
        );
        if (!shouldDelete) {
          return;
        }
        handleDeleteCustomStandardInput(input.id);
        handleSelectRig(null);
      };

      const handleAddRigDrivenVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        if (selection.type === "mixed") {
          const variableIds = Array.from(
            new Set(
              selection.variableIds
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
            ),
          );
          if (variableIds.length > 0) {
            handleAddRigDrivenVariable({
              type: "variable",
              id: variableIds[0]!,
              ids: variableIds,
            });
          }
          if (
            selection.propertyTargetIds.length > 0 ||
            selection.propertyInputIds.length > 0
          ) {
            handleAddRigDrivenVariable({
              type: "property",
              objectId: "propsrig",
              featureId: "propsrig",
              label: selection.label,
              inputIds: selection.propertyInputIds,
              targetIds: selection.propertyTargetIds,
            });
          }
          return;
        }
        const resolvedSelection = resolveRigDrivenSelection(
          selection,
          resolvedSelectedRigId,
          objects,
        );

        if (resolvedSelection.kind === "self-variable") {
          alertDialog("A driver cannot directly drive itself.");
          return;
        }

        if (resolvedSelection.kind === "variable") {
          let linkedCount = 0;
          let skippedLocked = 0;
          let skippedExisting = 0;
          let lastLinkedInputId: string | null = null;

          resolvedSelection.childInputIds.forEach((childInputId) => {
            const resolvedChildInputId = resolveRigMetadataInputId(
              childInputId,
              standardInputsById,
            );
            if (
              lockedPropsRigInputIds.has(childInputId) ||
              lockedPropsRigInputIds.has(resolvedChildInputId)
            ) {
              skippedLocked += 1;
              return;
            }
            const existingBinding = inputBindings[resolvedChildInputId];
            const alreadyLinked = hasParentBindingInput(
              existingBinding,
              resolvedSelectedRigId,
            );
            if (alreadyLinked) {
              skippedExisting += 1;
              return;
            }
            addParentLinkForInput(resolvedChildInputId, resolvedSelectedRigId);
            linkedCount += 1;
            lastLinkedInputId = resolvedChildInputId;
          });

          if (linkedCount === 0) {
            if (skippedLocked > 0) {
              alertDialog(
                "Cannot add child drivers for locked face properties. Unlock them first in the Face Element inspector.",
              );
              return;
            }
            if (skippedExisting > 0) {
              alertDialog(
                "Selected drivers are already driven by the selected rig driver.",
              );
              return;
            }
            return;
          }

          if (lastLinkedInputId) {
            openRigInspector(lastLinkedInputId);
          }
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
          const lockedTargetIds: string[] = [];
          const lockedPropsRigTargets: string[] = [];
          const propsrigInputIds = new Set<string>();
          componentTargetIds.forEach((targetId) => {
            if (lockedInspectorTargetIds.has(targetId)) {
              lockedTargetIds.push(targetId);
              return;
            }
            const mappedPropsRigInputId =
              propsrigInputIdByComponentId.get(targetId);
            if (
              mappedPropsRigInputId &&
              lockedPropsRigInputIds.has(mappedPropsRigInputId)
            ) {
              lockedPropsRigTargets.push(targetId);
              return;
            }

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

            const propsrigInputId = propsrigInputIdByComponentId.get(targetId);
            if (!propsrigInputId) {
              missingTargetIds.push(targetId);
              return;
            }
            propsrigInputIds.add(propsrigInputId);
          });
          const resolvedPropsRigInputIds = Array.from(propsrigInputIds);
          if (resolvedPropsRigInputIds.length === 0) {
            if (
              lockedTargetIds.length > 0 ||
              lockedPropsRigTargets.length > 0
            ) {
              alertDialog(
                "Selected properties are locked in the Face Element inspector. Unlock them before adding child drivers.",
              );
              return;
            }
            alertDialog(
              "Some selected properties are not currently mapped to props rig inputs.",
            );
            return;
          }
          const selectionLabel =
            selection.type === "property" ? selection.label : "selection";
          const shouldApplyBulk =
            resolvedPropsRigInputIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Bind all ${resolvedPropsRigInputIds.length} components for "${selectionLabel}" to this rig input?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          let linkedCount = 0;
          resolvedPropsRigInputIds.forEach((propsrigInputId) => {
            const resolvedPropsRigInputId = resolveRigMetadataInputId(
              propsrigInputId,
              standardInputsById,
            );
            const existingInputBinding = inputBindings[resolvedPropsRigInputId];
            const alreadyLinked = hasParentBindingInput(
              existingInputBinding,
              resolvedSelectedRigId,
            );
            if (alreadyLinked) {
              return;
            }
            addParentLinkForInput(
              resolvedPropsRigInputId,
              resolvedSelectedRigId,
            );
            linkedCount += 1;
          });
          if (
            (missingTargetIds.length > 0 ||
              lockedTargetIds.length > 0 ||
              lockedPropsRigTargets.length > 0) &&
            linkedCount === 0
          ) {
            if (
              lockedTargetIds.length > 0 ||
              lockedPropsRigTargets.length > 0
            ) {
              alertDialog(
                "Selected properties are locked in the Face Element inspector. Unlock them before adding child drivers.",
              );
              return;
            }
            alertDialog(
              "Some selected properties are not currently mapped to props rig inputs.",
            );
          }
          return;
        }
      };
      const handleAddRigParentVariable = (selection: VariableSelection) => {
        setShowSelector(false);
        if (selection.type === "mixed") {
          const variableIds = Array.from(
            new Set(
              selection.variableIds
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
            ),
          );
          if (variableIds.length > 0) {
            handleAddRigParentVariable({
              type: "variable",
              id: variableIds[0]!,
              ids: variableIds,
            });
          }
          if (
            selection.propertyTargetIds.length > 0 ||
            selection.propertyInputIds.length > 0
          ) {
            handleAddRigParentVariable({
              type: "property",
              objectId: "propsrig",
              featureId: "propsrig",
              label: selection.label,
              inputIds: selection.propertyInputIds,
              targetIds: selection.propertyTargetIds,
            });
          }
          return;
        }
        const resolvedSelection = resolveRigDrivenSelection(
          selection,
          resolvedSelectedRigId,
          objects,
        );

        if (resolvedSelection.kind === "self-variable") {
          alertDialog("A driver cannot directly drive itself.");
          return;
        }

        if (resolvedSelection.kind === "variable") {
          let linkedCount = 0;
          let skippedExisting = 0;

          resolvedSelection.childInputIds.forEach((childInputId) => {
            const parentInputId = resolveRigMetadataInputId(
              childInputId,
              standardInputsById,
            );
            const existingBinding = inputBindings[resolvedSelectedRigId];
            if (hasParentBindingInput(existingBinding, parentInputId)) {
              skippedExisting += 1;
              return;
            }
            addParentLinkForInput(resolvedSelectedRigId, parentInputId);
            linkedCount += 1;
          });

          if (linkedCount === 0 && skippedExisting > 0) {
            alertDialog(
              "Selected drivers are already linked as parents for the selected driver.",
            );
          }
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
          const parentInputIds = new Set<string>();
          componentTargetIds.forEach((targetId) => {
            const parentInputId = propsrigInputIdByComponentId.get(targetId);
            if (!parentInputId) {
              missingTargetIds.push(targetId);
              return;
            }
            parentInputIds.add(parentInputId);
          });
          const resolvedParentInputIds = Array.from(parentInputIds);
          if (resolvedParentInputIds.length === 0) {
            alertDialog(
              "Some selected properties are not currently mapped to props rig inputs.",
            );
            return;
          }
          const selectionLabel =
            selection.type === "property" ? selection.label : "selection";
          const shouldApplyBulk =
            resolvedParentInputIds.length === 1 ||
            (typeof window !== "undefined" &&
              window.confirm(
                `Link all ${resolvedParentInputIds.length} components from "${selectionLabel}" as parents for this driver?`,
              ));
          if (!shouldApplyBulk) {
            return;
          }
          const existingBinding = inputBindings[resolvedSelectedRigId];
          let linkedCount = 0;
          resolvedParentInputIds.forEach((parentInputId) => {
            if (hasParentBindingInput(existingBinding, parentInputId)) {
              return;
            }
            addParentLinkForInput(resolvedSelectedRigId, parentInputId);
            linkedCount += 1;
          });
          if (linkedCount === 0) {
            alertDialog(
              "Selected properties are already linked as parents for this driver.",
            );
            return;
          }
          if (missingTargetIds.length > 0) {
            alertDialog(
              "Some selected properties are not currently mapped to props rig inputs.",
            );
          }
          return;
        }
      };
      const resolveParentDirectControl = (parentInputId: string) => {
        const parentInput = standardInputsById.get(parentInputId);
        const min = parentInput?.range.min ?? -1;
        const max = parentInput?.range.max ?? 1;
        const fallback = parentInput?.defaultValue ?? 0;
        const stagedValue = inputValues[parentInputId];
        const resolvedValue =
          typeof stagedValue === "number" && Number.isFinite(stagedValue)
            ? stagedValue
            : fallback;
        return {
          value: clampToRange(resolvedValue, min, max),
          min,
          max,
        };
      };
      const resolvedCurrentPipelineConfig = resolveRigPipelineV1InputConfig({
        faceId: runtimeFaceId?.trim() || "robot",
        input,
        pipelineV1:
          resolvePatchedPipelineMetadata(pipelineMetadataV1) ?? undefined,
      });
      const expressionVariableByInputId = (() => {
        const aliasesByInputId = new Map<string, string>();
        const slotByInputId = new Map<
          string,
          {
            slot: NonNullable<typeof parentBinding>["slots"][number];
            index: number;
          }
        >();
        (parentBinding?.slots ?? []).forEach((slot, index) => {
          const rawInputId = slot.inputId?.trim() ?? "";
          if (!rawInputId || rawInputId === SELF_BINDING_ID) {
            return;
          }
          const resolvedInputId = resolveRigMetadataInputId(
            rawInputId,
            standardInputsById,
          );
          slotByInputId.set(resolvedInputId, { slot, index });
        });
        resolvedCurrentPipelineConfig.parents.forEach((parent) => {
          const slotInfo = slotByInputId.get(parent.inputId);
          aliasesByInputId.set(
            parent.inputId,
            resolveAuthoringParentExpressionVariable({
              input: standardInputsById.get(parent.inputId),
              slot: slotInfo?.slot ?? null,
              slotIndex: slotInfo?.index,
              linkExpression:
                pipelineLinksById.get(parent.linkId)?.expression ?? null,
              fallbackAlias: parent.alias,
            }),
          );
        });
        parentRigInputRefs.forEach((entry, index) => {
          if (aliasesByInputId.has(entry.id)) {
            return;
          }
          const slotInfo = slotByInputId.get(entry.id);
          aliasesByInputId.set(
            entry.id,
            resolveAuthoringParentExpressionVariable({
              input: standardInputsById.get(entry.id),
              slot: slotInfo?.slot ?? null,
              slotIndex: slotInfo?.index,
              linkExpression: entry.linkExpression,
              fallbackAlias: `s${index + 1}`,
            }),
          );
        });
        return aliasesByInputId;
      })();
      const canonicalParentContributionSources =
        resolveParentContributionSourcesForInput({
          childInputId: input.id,
          pipelineMetadata: pipelineMetadataV1,
        });
      const resolvedParentContributionSources =
        resolvedCurrentPipelineConfig.parents
          .filter((parent) => parent.enabled)
          .map((parent) => {
            const linkExpression =
              pipelineLinksById.get(parent.linkId)?.expression ?? null;
            if (linkExpression) {
              return {
                alias: parent.alias,
                expression: linkExpression,
              };
            }
            return {
              alias: parent.alias,
            };
          });
      const parentRigChainItems: Array<{
        key: string;
        inputId: string;
        linkId: string;
        linkScale: number;
        linkOffset: number;
        linkEnabled: boolean;
        linkExpression: string | null;
        parentDirectValue: number;
        parentDirectMin: number;
        parentDirectMax: number;
        label: string;
        expressionVariable: string;
        kind: "variable" | "property" | "propsrig";
        onClick: () => void;
      }> = [];
      parentRigInputRefs.forEach((entry) => {
        const parentDirectControl = resolveParentDirectControl(entry.id);
        const expressionVariable =
          expressionVariableByInputId.get(entry.id) ?? "s1";
        if (!entry.isPropsRig) {
          parentRigChainItems.push({
            key: `variable:${entry.id}`,
            inputId: entry.id,
            linkId: entry.linkId,
            linkScale: entry.linkScale,
            linkOffset: entry.linkOffset,
            linkEnabled: entry.linkEnabled,
            linkExpression: entry.linkExpression,
            parentDirectValue: parentDirectControl.value,
            parentDirectMin: parentDirectControl.min,
            parentDirectMax: parentDirectControl.max,
            label: entry.label,
            expressionVariable,
            kind: "variable",
            onClick: () => openRigInspector(entry.id),
          });
          return;
        }
        const mappedTargetId = componentIdByInputId.get(entry.id) ?? null;
        if (mappedTargetId) {
          parentRigChainItems.push({
            key: `property:${mappedTargetId}`,
            inputId: entry.id,
            linkId: entry.linkId,
            linkScale: entry.linkScale,
            linkOffset: entry.linkOffset,
            linkEnabled: entry.linkEnabled,
            linkExpression: entry.linkExpression,
            parentDirectValue: parentDirectControl.value,
            parentDirectMin: parentDirectControl.min,
            parentDirectMax: parentDirectControl.max,
            label: targetLabelById.get(mappedTargetId) ?? entry.label,
            expressionVariable,
            kind: "property",
            onClick: () => openBindingTargetInspector(mappedTargetId),
          });
          return;
        }
        if (!showPropsRigInternals) {
          return;
        }
        parentRigChainItems.push({
          key: `propsrig:${entry.id}`,
          inputId: entry.id,
          linkId: entry.linkId,
          linkScale: entry.linkScale,
          linkOffset: entry.linkOffset,
          linkEnabled: entry.linkEnabled,
          linkExpression: entry.linkExpression,
          parentDirectValue: parentDirectControl.value,
          parentDirectMin: parentDirectControl.min,
          parentDirectMax: parentDirectControl.max,
          label: entry.label,
          expressionVariable,
          kind: "propsrig",
          onClick: () => openRigInspector(entry.id),
        });
      });

      const drivenChainItems: Array<{
        key: string;
        label: string;
        kind: "variable" | "property" | "propsrig";
        drivenInputId?: string;
        linkId?: string;
        linkScale?: number;
        linkOffset?: number;
        linkEnabled?: boolean;
        onClick: () => void;
      }> = [];
      const seenDrivenKeys = new Set<string>();
      const removeDrivenVariableLink = (drivenInputId: string) => {
        removeParentLinkForInput(drivenInputId, resolvedSelectedRigId);
      };
      downstreamInputs.forEach((entry) => {
        const linkId = buildRigPipelineV1LinkId(input.id, entry.id);
        const linkConfig = pipelineLinksById.get(linkId);
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
          linkId,
          linkScale: linkConfig?.scale ?? 1,
          linkOffset: linkConfig?.offset ?? 0,
          linkEnabled: linkConfig?.enabled ?? true,
          onClick: () => openRigInspector(entry.id),
        });
      });
      downstreamPropsRigInputs.forEach((entry) => {
        const linkId = buildRigPipelineV1LinkId(input.id, entry.id);
        const linkConfig = pipelineLinksById.get(linkId);
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
            linkId,
            linkScale: linkConfig?.scale ?? 1,
            linkOffset: linkConfig?.offset ?? 0,
            linkEnabled: linkConfig?.enabled ?? true,
            onClick: () => openBindingTargetInspector(mappedTargetId),
          });
          return;
        }
        if (!showPropsRigInternals) {
          return;
        }
        const key = `propsrig:${entry.id}`;
        if (seenDrivenKeys.has(key)) {
          return;
        }
        seenDrivenKeys.add(key);
        drivenChainItems.push({
          key,
          label: entry.label,
          kind: "propsrig",
          drivenInputId: entry.id,
          linkId,
          linkScale: linkConfig?.scale ?? 1,
          linkOffset: linkConfig?.offset ?? 0,
          linkEnabled: linkConfig?.enabled ?? true,
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
          onClick: () => openBindingTargetInspector(dependent.targetId),
        });
      });

      const parentInputIds = parentRigInputRefs
        .map((entry) => entry.id)
        .filter((candidateId) => candidateId !== input.id);
      const parentValues = parentRigInputRefs
        .filter((entry) => entry.linkEnabled)
        .map((entry) => {
          const parentId = entry.id;
          const stagedParentValue = inputValues[parentId];
          const rawValue =
            typeof stagedParentValue === "number" &&
            Number.isFinite(stagedParentValue)
              ? stagedParentValue
              : standardInputsById.get(parentId)?.defaultValue;
          const fallbackValue = Number.isFinite(rawValue)
            ? (rawValue as number)
            : input.defaultValue;
          return fallbackValue * entry.linkScale + entry.linkOffset;
        });
      const linkedPoseStageItems = poses
        .reduce<
          Array<{
            id: string;
            label: string;
            targetValue: number;
            neutralValue: number;
            weight: number;
            onInspect: () => void;
            onWeightChange?: (nextValue: number) => void;
          }>
        >((items, poseEntry) => {
          const poseTargetValue = poseEntry.values[input.id];
          if (
            typeof poseTargetValue !== "number" ||
            !Number.isFinite(poseTargetValue)
          ) {
            return items;
          }
          const poseWeightInputId = poseWeightInputIdByPoseId.get(poseEntry.id);
          const poseWeightValue =
            poseWeightInputId &&
            typeof inputValues[poseWeightInputId] === "number" &&
            Number.isFinite(inputValues[poseWeightInputId])
              ? clamp01(inputValues[poseWeightInputId] as number)
              : 0;
          const onWeightChange =
            poseWeightInputId !== undefined
              ? (nextValue: number) =>
                  handleInputValueChange(poseWeightInputId, clamp01(nextValue))
              : undefined;
          items.push({
            id: poseEntry.id,
            label: poseEntry.name || poseEntry.id,
            targetValue: poseTargetValue,
            neutralValue: neutralInputs[input.id] ?? input.defaultValue,
            weight: poseWeightValue,
            onInspect: () => openPoseInspector(poseEntry.id),
            ...(onWeightChange ? { onWeightChange } : {}),
          });
          return items;
        }, [])
        .sort((left, right) => left.label.localeCompare(right.label));
      const pipelineStageSettings = resolvePipelineStageSettings(
        parentBinding ?? null,
        {
          defaultValue: input.defaultValue,
          fallbackDirectEnabled: true,
        },
      );
      const effectiveDirectInputEnabled = isLockedFromFaceInspector
        ? false
        : pipelineStageSettings.directInputEnabled;
      const poseContribution = computePoseContribution(
        linkedPoseStageItems.map((item) => ({
          targetValue: item.targetValue,
          neutralValue: item.neutralValue,
          weight: item.weight,
        })),
        input.defaultValue,
      );
      const pipelineDiagnostics = computePipelineDiagnostics({
        baseline: input.defaultValue,
        min: input.range.min,
        max: input.range.max,
        parentValues,
        poseContribution,
        directValue: value,
        directEnabled: effectiveDirectInputEnabled,
        overrideEnabled: pipelineStageSettings.overrideEnabled,
        overrideValue: pipelineStageSettings.overrideValue,
        clampEnabled: pipelineStageSettings.clampEnabled,
      });
      const compiledPipelineEquation = buildCompiledPipelineEquation({
        hasParents: parentInputIds.length > 0,
        hasPoses: linkedPoseStageItems.length > 0,
        directEnabled: effectiveDirectInputEnabled,
        clampEnabled: pipelineStageSettings.clampEnabled,
      });
      const legacyMigrationAssessment = assessLegacyBindingMigration(
        parentBinding ?? null,
      );
      const isMigratedBinding = legacyMigrationAssessment.kind === "migrated";
      const isLegacyReadOnlyBinding =
        legacyMigrationAssessment.kind === "non-convertible";
      const parentExpressionTitle = isMigratedBinding
        ? "Parent Contribution Formula"
        : "Authored Parent Expression";
      const storedParentContributionExpression =
        readParentBlendExpressionFromPipelineMetadata(
          pipelineMetadataV1 as Record<string, unknown> | null | undefined,
          input.id,
        ) ?? resolvedCurrentPipelineConfig.parentBlend.expression;
      const displayedParentExpression = isMigratedBinding
        ? isAutoParentBlendExpression(
            storedParentContributionExpression,
            resolvedParentContributionSources,
          )
          ? canonicalParentContributionSources.length > 0
            ? buildDefaultParentContributionFormula(
                canonicalParentContributionSources,
              )
            : ""
          : storedParentContributionExpression
        : (parentBinding?.expression ?? "");

      const applyPipelineMetadataPatchForInput = (
        targetInputId: string,
        patch: PipelineMetadataPatch,
      ) => {
        applyInputBindingPatch((previous) => {
          const sourceInput = standardInputsById.get(targetInputId);
          if (!sourceInput) {
            return previous;
          }
          const existingBinding =
            previous[targetInputId] ??
            createDefaultParentBinding(bindingTargetFromInput(sourceInput));
          const nextMetadata = mergePipelineMetadata(
            (existingBinding.metadata ?? undefined) as
              | Record<string, unknown>
              | undefined,
            patch,
          );
          const previousMetadataSignature = JSON.stringify(
            existingBinding.metadata ?? null,
          );
          const nextMetadataSignature = JSON.stringify(nextMetadata);
          if (
            previous[targetInputId] &&
            previousMetadataSignature === nextMetadataSignature
          ) {
            return previous;
          }
          return {
            ...previous,
            [targetInputId]: {
              ...existingBinding,
              metadata: nextMetadata,
            },
          };
        });
      };

      const applyPipelineMetadataPatch = (patch: PipelineMetadataPatch) => {
        applyPipelineMetadataPatchForInput(input.id, patch);
      };

      const handlePipelineDirectEnabledChange = (enabled: boolean) => {
        if (isLockedFromFaceInspector) {
          return;
        }
        applyPipelineMetadataPatch({
          directInputEnabled: enabled,
        });
      };
      const handlePipelineOverrideEnabledChange = (enabled: boolean) => {
        applyPipelineMetadataPatch({
          overrideEnabled: enabled,
        });
        stageRuntimeGraphPathValue(overrideEnabledPath, enabled ? 1 : 0);
      };
      const handlePipelineOverrideValueChange = (nextValue: number) => {
        const clampedValue = clampToRange(
          nextValue,
          input.range.min,
          input.range.max,
        );
        applyPipelineMetadataPatch({
          overrideValue: clampedValue,
        });
        stageRuntimeGraphPathValue(overrideValuePath, clampedValue);
      };
      const handlePipelineClampEnabledChange = (enabled: boolean) => {
        applyPipelineMetadataPatch({
          clampEnabled: enabled,
        });
      };
      const handlePipelineParentContributionExpressionChange = (
        expression: string,
      ) => {
        const trimmedExpression = expression.trim();
        applyPipelineMetadataPatch({
          parentBlendExpression:
            trimmedExpression.length > 0 ? trimmedExpression : null,
        });
      };
      const updatePipelineLink = (
        linkId: string,
        parentInputId: string,
        childInputId: string,
        patch: {
          scale?: number;
          offset?: number;
          enabled?: boolean;
          expression?: string | null;
        },
      ) => {
        const normalizedExpression =
          patch.expression === undefined
            ? undefined
            : patch.expression && patch.expression.trim().length > 0
              ? patch.expression.trim()
              : null;
        const currentState = bindingAuthoringStore.getState();
        const previousParentVariables =
          resolveParentContributionSourcesForInput({
            childInputId,
            pipelineMetadata: currentState.pipelineMetadataV1,
          });
        const currentVariable =
          expressionVariableByInputId.get(parentInputId) ?? "P1";
        const nextVariable =
          normalizedExpression !== undefined
            ? resolveRigPipelineV1FormulaVariable({
                alias: currentVariable,
                expression: normalizedExpression,
                fallbackAlias: currentVariable,
              })
            : currentVariable;
        const linkUpserts = {
          [linkId]: {
            parentInputId,
            childInputId,
            ...patch,
            ...(normalizedExpression !== undefined
              ? { expression: normalizedExpression }
              : {}),
          },
        };
        // Link records are owned by child input to avoid conflicting duplicates.
        applyPipelineMetadataPatchForInput(childInputId, {
          linkUpserts,
        });
        if (normalizedExpression !== undefined) {
          queueParentBlendExpressionSync({
            childInputId,
            previousParentVariables,
            linkUpserts,
            manualNotice:
              currentVariable !== nextVariable
                ? "Parent contribution formula uses a custom expression and was not rewritten. Update the formula above to reflect the renamed parent variable."
                : null,
          });
        }
      };
      const handleMigrateLegacyBinding = () => {
        const migrationPlan = planLegacyBindingPipelineMigration({
          binding: parentBinding,
          childInputId: input.id,
          defaultOffset: input.defaultValue,
          resolveInputId: (rawInputId) =>
            resolveRigMetadataInputId(rawInputId, standardInputsById),
        });
        if (!migrationPlan.canMigrate || !migrationPlan.patch) {
          return;
        }
        applyPipelineMetadataPatch(migrationPlan.patch);
        stageRuntimeGraphPathValue(overrideEnabledPath, 0);
        stageRuntimeGraphPathValue(overrideValuePath, input.defaultValue);
        setRigLifecycleMessage({
          tone: "info",
          text: "Legacy canonical self+parent binding migrated to staged pipeline metadata.",
        });
      };
      const rigDisplayMin = toDisplayValue(input.range.min, input.path);
      const rigDisplayMax = toDisplayValue(input.range.max, input.path);
      const rigDisplayDefault = toDisplayValue(input.defaultValue, input.path);
      const rigDisplaySharedCombinedValue = toDisplayValue(
        sharedRigCombinedValue,
        input.path,
      );
      const rigDisplayStep = resolveDisplayStep(
        input.range.min,
        input.range.max,
        input.path,
      );
      const rigMetadataStep = usesDegreeDisplay(input.path) ? "0.5" : "0.01";
      return (
        <div className="p-2 flex flex-col gap-4 min-h-0 flex-1">
          <div className="mx-1 rounded-md border border-border-default/50 bg-bg-panel/45 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-text-muted">
              Runtime path
            </div>
            <code className="mt-0.5 block break-all font-mono text-[10px] leading-snug text-text-primary">
              {directInputRuntimePath}
            </code>
          </div>
          <InspectorHeader
            name={input.label || input.id}
            path={
              input.path ? formatStandardRigInputDisplayPath(input.path) : ""
            }
            typeLabel="Rig"
            id={input.id}
            onNameChange={(name) => {
              handleUpdateStandardInput(input.id, { label: name });
              setRigLifecycleMessage(null);
            }}
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
                    ? "Delete custom driver"
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
          {renderRigScopeTabs(showReferenceRigTab)}
          {showReferenceRigTab ? (
            <div className="mx-1 mb-2 flex flex-col gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-2">
              <span className="text-[10px] uppercase tracking-wider text-cyan-100">
                Both Faces Value
              </span>
              <div className="flex items-center gap-2">
                <Slider
                  value={rigDisplaySharedCombinedValue}
                  min={rigDisplayMin}
                  max={rigDisplayMax}
                  step={rigDisplayStep}
                  defaultValue={rigDisplayDefault}
                  fillMode="value"
                  className="flex-1"
                  onChange={(nextValue) =>
                    handleSharedRigValueChange(
                      fromDisplayValue(
                        typeof nextValue === "number"
                          ? nextValue
                          : (nextValue[0] ?? 0),
                        input.path,
                      ),
                    )
                  }
                />
                <NumberField
                  value={rigDisplaySharedCombinedValue}
                  min={rigDisplayMin}
                  max={rigDisplayMax}
                  step={rigDisplayStep}
                  size="sm"
                  className="w-[108px]"
                  allowScrub={false}
                  onChange={(nextValue) =>
                    handleSharedRigValueChange(
                      fromDisplayValue(nextValue, input.path),
                    )
                  }
                />
              </div>
              {referenceSharedValue !== null &&
              Math.abs(value - referenceSharedValue) > SYNC_VALUE_EPSILON ? (
                <span className="text-[10px] text-amber-100">
                  Faces are currently controlled individually. Set this slider
                  to re-sync both.
                </span>
              ) : null}
            </div>
          ) : null}
          <CollapsibleGroup
            title="Driver Metadata"
            subtitle={`Default ${rigDisplayDefault.toFixed(3)} · Range ${rigDisplayMin.toFixed(3)}..${rigDisplayMax.toFixed(3)}`}
            defaultCollapsed={true}
            className="mb-0"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">
                  Input Path
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
              <div className="flex flex-col gap-2">
                <Input
                  size="sm"
                  value={rigPathDraft}
                  onChange={(event) => setRigPathDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigPathDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigPathDraft(input.path ?? "");
                      setRigLifecycleMessage(null);
                    }
                  }}
                  className="w-full bg-bg-input/80 border-border-default/80 font-mono text-[11px] text-text-primary"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[10px] whitespace-nowrap"
                    onClick={handleApplyRigPathDraft}
                  >
                    Apply Path
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] whitespace-nowrap"
                    onClick={() => {
                      setRigPathDraft(input.path ?? "");
                      setRigLifecycleMessage(null);
                    }}
                  >
                    Reset Path
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wide">
                  Default
                </span>
                <Input
                  size="sm"
                  type="number"
                  step={rigMetadataStep}
                  value={rigDefaultDraft}
                  onChange={(event) => setRigDefaultDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigDefaultDraft(
                        formatDraftDisplayNumber(
                          input.defaultValue ?? 0,
                          input.path,
                        ),
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
                  step={rigMetadataStep}
                  value={rigRangeMinDraft}
                  onChange={(event) => setRigRangeMinDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigRangeMinDraft(
                        formatDraftDisplayNumber(
                          input.range.min ?? -1,
                          input.path,
                        ),
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
                  step={rigMetadataStep}
                  value={rigRangeMaxDraft}
                  onChange={(event) => setRigRangeMaxDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleApplyRigMetadataDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRigRangeMaxDraft(
                        formatDraftDisplayNumber(
                          input.range.max ?? 1,
                          input.path,
                        ),
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
                  setRigDefaultDraft(
                    formatDraftDisplayNumber(input.defaultValue, input.path),
                  );
                  setRigRangeMinDraft(
                    formatDraftDisplayNumber(input.range.min, input.path),
                  );
                  setRigRangeMaxDraft(
                    formatDraftDisplayNumber(input.range.max, input.path),
                  );
                  setRigPathDraft(input.path ?? "");
                  setRigLifecycleMessage(null);
                }}
              >
                Reset Draft
              </Button>
              {!isRemovableCustomInput && (
                <span className="text-[10px] text-amber-200/90">
                  Deletion is disabled for system-managed drivers.
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
          </CollapsibleGroup>
          <VariablePipelineStages
            parentExpression={displayedParentExpression}
            parentExpressionTitle={parentExpressionTitle}
            parentExpressionReadOnly={isLegacyReadOnlyBinding}
            parentExpressionReadOnlyReason={
              isLegacyReadOnlyBinding ? legacyMigrationAssessment.reason : null
            }
            parentExpressionAttentionKey={
              parentExpressionAttention?.inputId === input.id
                ? parentExpressionAttention.nonce
                : 0
            }
            onParentExpressionChange={
              isMigratedBinding
                ? handlePipelineParentContributionExpressionChange
                : (expression) =>
                    handleParentBindingExpressionChange(input.id, expression)
            }
            onAddParent={() => {
              setRigLinkSelectorMode("parent");
              setShowSelector(true);
            }}
            compiledEquation={compiledPipelineEquation}
            parents={parentRigChainItems.map((entry) => ({
              id: entry.key,
              label: entry.label,
              expressionVariable: entry.expressionVariable,
              kind: entry.kind,
              onInspect: entry.onClick,
              onUnlink: () => {
                const shouldDelete =
                  typeof window === "undefined" ||
                  window.confirm(
                    `Delete parent link "${entry.label}"?\n\nThis removes the connection and cleans staged pipeline metadata.`,
                  );
                if (!shouldDelete) {
                  return;
                }
                removeParentLinkForInput(input.id, entry.inputId);
              },
              directControl: {
                value: entry.parentDirectValue,
                defaultValue:
                  standardInputsById.get(entry.inputId)?.defaultValue ??
                  entry.parentDirectValue,
                min: entry.parentDirectMin,
                max: entry.parentDirectMax,
                path: standardInputsById.get(entry.inputId)?.path ?? null,
                onValueChange: (nextValue) =>
                  handleInputValueChange(
                    entry.inputId,
                    clampToRange(
                      nextValue,
                      entry.parentDirectMin,
                      entry.parentDirectMax,
                    ),
                  ),
              },
              linkControl: {
                enabled: entry.linkEnabled,
                scale: entry.linkScale,
                offset: entry.linkOffset,
                onEnabledChange: (enabled) =>
                  updatePipelineLink(entry.linkId, entry.inputId, input.id, {
                    enabled,
                  }),
                onScaleChange: (scale) =>
                  updatePipelineLink(entry.linkId, entry.inputId, input.id, {
                    scale,
                  }),
                onOffsetChange: (offset) =>
                  updatePipelineLink(entry.linkId, entry.inputId, input.id, {
                    offset,
                  }),
              },
              parentFormula:
                entry.linkExpression ??
                buildDefaultParentVariableFormula(entry.expressionVariable),
              parentFormulaDefault: buildDefaultParentVariableFormula(
                entry.expressionVariable,
              ),
              onParentFormulaChange: (expression) =>
                updatePipelineLink(entry.linkId, entry.inputId, input.id, {
                  expression:
                    expression.trim().length > 0 ? expression.trim() : null,
                }),
            }))}
            children={drivenChainItems.map((entry) => ({
              id: entry.key,
              label: entry.label,
              kind: entry.kind,
              onInspect: entry.onClick,
              onUnlink: entry.drivenInputId
                ? () => {
                    const drivenInputId = entry.drivenInputId;
                    if (drivenInputId) {
                      const shouldDelete =
                        typeof window === "undefined" ||
                        window.confirm(
                          `Delete child link "${entry.label}"?\n\nThis removes the connection and cleans staged pipeline metadata.`,
                        );
                      if (!shouldDelete) {
                        return;
                      }
                      removeDrivenVariableLink(drivenInputId);
                    }
                  }
                : undefined,
              ...(entry.drivenInputId && entry.linkId
                ? (() => {
                    const childInputId = entry.drivenInputId;
                    const linkId = entry.linkId;
                    return {
                      linkControl: {
                        enabled: entry.linkEnabled ?? true,
                        scale: entry.linkScale ?? 1,
                        offset: entry.linkOffset ?? 0,
                        onEnabledChange: (enabled: boolean) =>
                          updatePipelineLink(linkId, input.id, childInputId, {
                            enabled,
                          }),
                        onScaleChange: (scale: number) =>
                          updatePipelineLink(linkId, input.id, childInputId, {
                            scale,
                          }),
                        onOffsetChange: (offset: number) =>
                          updatePipelineLink(linkId, input.id, childInputId, {
                            offset,
                          }),
                      },
                    };
                  })()
                : {}),
            }))}
            poses={linkedPoseStageItems}
            diagnostics={pipelineDiagnostics}
            directInputEnabled={effectiveDirectInputEnabled}
            directInputPath={directInputRuntimePath}
            rotationDisplayPath={input.path}
            rotationDisplayMode={rotationDisplayMode}
            directValue={value}
            directDefaultValue={input.defaultValue}
            directMin={input.range.min}
            directMax={input.range.max}
            directControlDisabled={!isDirectRigControlAvailable}
            directControlReason={directRigControlReason}
            onEnableLocalControl={
              isLockedFromFaceInspector || isDirectRigControlAvailable
                ? undefined
                : () => handleEnableParentLocalControl(input.id)
            }
            onDirectInputEnabledChange={handlePipelineDirectEnabledChange}
            onDirectValueChange={(nextValue) =>
              handleInputValueChange(
                input.id,
                clampToRange(nextValue, input.range.min, input.range.max),
              )
            }
            onDirectReset={() =>
              handleInputValueChange(input.id, input.defaultValue)
            }
            overrideEnabled={pipelineStageSettings.overrideEnabled}
            overrideValue={pipelineStageSettings.overrideValue}
            overrideMin={input.range.min}
            overrideMax={input.range.max}
            onOverrideEnabledChange={handlePipelineOverrideEnabledChange}
            onOverrideValueChange={handlePipelineOverrideValueChange}
            clampEnabled={pipelineStageSettings.clampEnabled}
            onClampEnabledChange={handlePipelineClampEnabledChange}
            onMigrateLegacyBinding={
              legacyMigrationAssessment.kind === "convertible"
                ? handleMigrateLegacyBinding
                : undefined
            }
            onAddChild={() => {
              setRigLinkSelectorMode("child");
              setShowSelector(true);
            }}
            // Clamp editing is intentionally hidden here because mutating it
            // still breaks the authored driver pipeline for this inspector flow.
            showClampStage={false}
          />
          {sharedLink && (
            <div className="rounded border border-border-default/60 bg-bg-panel/40 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Shared Driver Link
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
              {!hasReferenceFaceFile && (
                <span className="text-[10px] text-text-muted">
                  Load a reference face to activate shared sync.
                </span>
              )}
            </div>
          )}
          <Modal
            open={showSelector}
            onClose={() => setShowSelector(false)}
            title={
              rigLinkSelectorMode === "parent"
                ? "Select Driver or Property to Use as Parent"
                : "Select Driver or Property to Drive"
            }
            maxWidth="md"
          >
            <VariableSelector
              onSelect={
                rigLinkSelectorMode === "parent"
                  ? handleAddRigParentVariable
                  : handleAddRigDrivenVariable
              }
              onCancel={() => setShowSelector(false)}
            />
          </Modal>
        </div>
      );
    }
  }

  if (inspectorMode === "rig" && selectedReferenceRigInput) {
    const linkedMainRigInputId =
      mainRigInputIdByPath.get(
        normalizeStandardRigInputPath(selectedReferenceRigInput.path),
      ) ?? null;
    return renderReferenceRigInspector({
      input: selectedReferenceRigInput,
      linkedMainRigInputId,
    });
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

import type { KeyboardEvent, ReactNode } from "react";
import { useMemo } from "react";
import { Activity, RotateCcw, Trash2, X } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { EmptyState } from "../ui/EmptyState";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { AUTHORING_COMPILE_TARGETS } from "../../state/graphRuntimeStore";
import { cn } from "../../utils/cn";
import type {
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PoseScopedNeutralDefinition,
} from "../../poseRig/types";
import type {
  BlendStageInspectorSelection,
  PoseGroupInspectorSelection,
} from "../../types/poseGroupInspector";
import { parsePoseWeightInputSourceId } from "../../poseRig/utils";
import MgNodeInspector from "../../motiongraph/components/MgNodeInspector";
import {
  useAnimationStore,
  type AnimationCurveSelection,
  type AnimationKeyframe,
  type AnimationTimeDisplayMode,
  type AnimationTrack,
} from "../../state/animationStore";
import type { ActiveInspectorTarget } from "../../utils/inspectorSelection";
import {
  formatKeyframeTime,
  framesToSeconds,
  secondsToFrames,
} from "../../utils/animationTimeDisplay";
import {
  buildPoseGroupCompositionPreview,
  buildPoseStageCompositionPreview,
  type PoseGroupCompositionChannel,
  type PoseStageCompositionChannel,
} from "./poseCompositionPreview";
import { InspectorContent } from "./InspectorContent";

interface InspectorPanelProps {
  activeInspectorTarget?: ActiveInspectorTarget | null;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
  onSelectPoseGroup?: (selection: PoseGroupInspectorSelection | null) => void;
  selectedBlendStage?: BlendStageInspectorSelection | null;
  onSelectBlendStage?: (selection: BlendStageInspectorSelection | null) => void;
  selectedAnimationTarget?: AnimationInspectorSelection | null;
  onRenameAnimationTarget?: (targetId: string, nextName: string) => void;
  onUpdateAnimationTargetDuration?: (
    targetId: string,
    nextDuration: number,
  ) => void;
  onInspectAnimationTrack?: (trackId: string) => void;
  onInspectAnimationInput?: (inputId: string) => void;
  selectedProgramTarget?: ProgramInspectorSelection | null;
  onRenameProgramTarget?: (targetId: string, nextName: string) => void;
  onInspectProgramNode?: (nodeId: string) => void;
  onInspectProgramInput?: (inputId: string) => void;
  hasReferenceFaceFile?: boolean;
  onClosePanel?: () => void;
}

export interface AnimationInspectorTrackSelection {
  id: string;
  label: string;
  channel: string;
  keyframeCount: number;
  inputId: string | null;
  inputLabel: string | null;
}

export interface AnimationInspectorSelection {
  targetId: string;
  name: string;
  source: "authored" | "imported";
  duration: number;
  trackCount: number;
  tracks: readonly AnimationInspectorTrackSelection[];
}

export interface ProgramInspectorNodeSelection {
  id: string;
  label: string;
  kind: "input" | "output";
}

export interface ProgramInspectorIoSelection {
  path: string;
  label: string;
  inputId: string | null;
  tag?: string | null;
}

export interface ProgramInspectorSelection {
  targetId: string;
  name: string;
  source: "authored" | "imported";
  nodeCount: number;
  edgeCount: number;
  inputCount: number;
  outputCount: number;
  nodes: readonly ProgramInspectorNodeSelection[];
  inputs: readonly ProgramInspectorIoSelection[];
  outputs: readonly ProgramInspectorIoSelection[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

type AnimationHandle = { x: number; y: number };
type AnimationSegmentInspectorModel = {
  segmentIndex: number;
  start: AnimationKeyframe;
  end: AnimationKeyframe;
  interpolation: AnimationTrack["interpolation"];
  outHandle: AnimationHandle;
  inHandle: AnimationHandle;
};
type AnimationSegmentHandleSide = "out" | "in";

const ANIMATION_HANDLE_EPSILON = 1e-6;
const ANIMATION_CUBIC_EASE_HANDLE_X = 0.65;
const ANIMATION_STEP_HOLD_HANDLE_X = 0.98;

function quantizeAnimationHandleValue(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeAnimationHandle(value: unknown): AnimationHandle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<AnimationHandle>;
  const x = Number(record.x);
  const y = Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: quantizeAnimationHandleValue(x),
    y: quantizeAnimationHandleValue(y),
  };
}

function resolveAnimationPresetHandles(
  interpolation: AnimationTrack["interpolation"],
  start: AnimationKeyframe,
  end: AnimationKeyframe,
): { outHandle: AnimationHandle; inHandle: AnimationHandle } {
  const span = Math.max(end.time - start.time, ANIMATION_HANDLE_EPSILON);
  const valueDelta = end.value - start.value;
  if (interpolation === "linear") {
    return {
      outHandle: { x: span / 3, y: valueDelta / 3 },
      inHandle: { x: -span / 3, y: -valueDelta / 3 },
    };
  }
  if (interpolation === "step") {
    return {
      outHandle: { x: span * ANIMATION_STEP_HOLD_HANDLE_X, y: 0 },
      inHandle: {
        x: -span * (1 - ANIMATION_STEP_HOLD_HANDLE_X),
        y: -valueDelta,
      },
    };
  }
  return {
    outHandle: { x: span * ANIMATION_CUBIC_EASE_HANDLE_X, y: 0 },
    inHandle: { x: -span * ANIMATION_CUBIC_EASE_HANDLE_X, y: 0 },
  };
}

function resolveAnimationSegmentInspectorModel(
  keyframes: ReadonlyArray<AnimationKeyframe>,
  trackInterpolation: AnimationTrack["interpolation"],
  segmentIndex: number,
): AnimationSegmentInspectorModel | null {
  const start = keyframes[segmentIndex];
  const end = keyframes[segmentIndex + 1];
  if (!start || !end || end.time <= start.time + ANIMATION_HANDLE_EPSILON) {
    return null;
  }
  const interpolation = start.interpolation ?? trackInterpolation;
  const presetHandles = resolveAnimationPresetHandles(
    interpolation,
    start,
    end,
  );
  const outHandle =
    interpolation === "spline"
      ? (normalizeAnimationHandle(start.outHandle) ??
        (typeof start.outTangent === "number"
          ? {
              x: (end.time - start.time) / 3,
              y: (start.outTangent * (end.time - start.time)) / 3,
            }
          : null) ??
        presetHandles.outHandle)
      : presetHandles.outHandle;
  const inHandle =
    interpolation === "spline"
      ? (normalizeAnimationHandle(end.inHandle) ??
        (typeof end.inTangent === "number"
          ? {
              x: -(end.time - start.time) / 3,
              y: (-end.inTangent * (end.time - start.time)) / 3,
            }
          : null) ??
        presetHandles.inHandle)
      : presetHandles.inHandle;
  return {
    segmentIndex,
    start,
    end,
    interpolation,
    outHandle: {
      x: quantizeAnimationHandleValue(outHandle.x),
      y: quantizeAnimationHandleValue(outHandle.y),
    },
    inHandle: {
      x: quantizeAnimationHandleValue(inHandle.x),
      y: quantizeAnimationHandleValue(inHandle.y),
    },
  };
}

function resolveSelectedAnimationSegmentInspectorModel(
  selection: AnimationCurveSelection | null,
  keyframes: ReadonlyArray<AnimationKeyframe>,
  trackInterpolation: AnimationTrack["interpolation"],
): AnimationSegmentInspectorModel | null {
  if (selection?.kind !== "segment" && selection?.kind !== "handle") {
    return null;
  }
  return resolveAnimationSegmentInspectorModel(
    keyframes,
    trackInterpolation,
    selection.segmentIndex,
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePoseGroupPath(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function blendStageLabel(
  stage: PoseIrBlendStageDefinition,
  index: number,
): string {
  const trimmed = stage.name?.trim();
  if (trimmed) {
    return trimmed;
  }
  return `Stage ${index + 1}`;
}

function resolveNeutralSourceType(
  neutral: PoseScopedNeutralDefinition | undefined,
): "inherit" | "pose-reference" | "direct-values" {
  return neutral?.sourceType ?? "inherit";
}

function clampToInputRange(
  input:
    | {
        range?: {
          min: number;
          max: number;
        };
      }
    | undefined,
  value: number,
): number {
  if (!isFiniteNumber(value)) {
    return 0;
  }
  if (!input?.range) {
    return value;
  }
  const min = isFiniteNumber(input.range.min) ? input.range.min : value;
  const max = isFiniteNumber(input.range.max) ? input.range.max : value;
  return Math.max(min, Math.min(max, value));
}

function resolveSliderStep(min: number, max: number): number {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    return 0.01;
  }
  const span = Math.abs(max - min);
  if (span <= 0) {
    return 0.01;
  }
  const candidate = span / 200;
  return Math.max(0.0001, Math.min(0.1, candidate));
}

function sortInputIds(
  inputIds: Iterable<string>,
  orderByInputId: Map<string, number>,
): string[] {
  return Array.from(new Set(inputIds)).sort((left, right) => {
    const leftIndex = orderByInputId.get(left);
    const rightIndex = orderByInputId.get(right);
    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== undefined) {
      return -1;
    }
    if (rightIndex !== undefined) {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function stageSourceToken(source: PoseIrStageSource): string {
  return `${source.kind}:${source.id}`;
}

function resolveAnimationTimeFieldLabel(
  mode: AnimationTimeDisplayMode,
): string {
  return mode === "frames" ? "Frame" : "Time";
}

function handleNameFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function commitInspectorNameChange(
  currentName: string,
  onCommit: ((nextName: string) => void) | undefined,
  rawValue: string,
) {
  if (!onCommit) {
    return;
  }
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === currentName) {
    return;
  }
  onCommit(trimmed);
}

function InspectorSection({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count?: number;
  emptyMessage?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {title}
        </span>
        {typeof count === "number" ? (
          <span className="text-[10px] text-text-muted font-mono">{count}</span>
        ) : null}
      </div>
      {count === 0 && emptyMessage ? (
        <p className="text-[10px] text-text-muted">{emptyMessage}</p>
      ) : (
        children
      )}
    </div>
  );
}

function InspectorEntryButton({
  title,
  meta,
  onClick,
  action,
}: {
  title: string;
  meta: string;
  onClick?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-border-default/50 bg-bg-input/35 px-2 py-1.5">
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 text-left transition-colors",
          onClick
            ? "hover:text-text-primary text-text-secondary"
            : "cursor-default text-text-secondary",
        )}
        onClick={onClick}
        disabled={!onClick}
      >
        <div className="truncate text-[10px] font-semibold text-text-primary">
          {title}
        </div>
        <div className="truncate font-mono text-[10px] text-text-muted">
          {meta}
        </div>
      </button>
      {action}
    </div>
  );
}

function AuthoringCompileStatusBar() {
  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const graphWarning = useGraphRuntime((state) => state.graphWarning);
  const graphError = useGraphRuntime((state) => state.graphError);
  const authoringCompileTargets = useGraphRuntime(
    (state) => state.authoringCompileTargets,
  );
  const targetStatusMessages = AUTHORING_COMPILE_TARGETS.map(
    (target) => authoringCompileTargets[target]?.message,
  ).filter(Boolean);
  const statusTone =
    graphStatus === "ready"
      ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
      : graphStatus === "loading"
        ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
        : graphStatus === "error"
          ? "text-red-300 border-red-500/40 bg-red-500/10"
          : "text-text-muted border-border-default/50 bg-bg-panel/30";
  const resolveCompileTone = (
    status: (typeof authoringCompileTargets)[keyof typeof authoringCompileTargets]["status"],
  ) =>
    status === "registered"
      ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
      : status === "compiling" || status === "dirty" || status === "compiled"
        ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
        : status === "runtime-error"
          ? "text-red-300 border-red-500/40 bg-red-500/10"
          : "text-text-muted border-border-default/50 bg-bg-panel/30";
  const formatTargetLabel = (
    target: (typeof AUTHORING_COMPILE_TARGETS)[number],
    status: (typeof authoringCompileTargets)[keyof typeof authoringCompileTargets]["status"],
  ) => {
    const targetLabel =
      target === "runtime-graph"
        ? "Rig graph"
        : target === "motiongraph"
          ? "Program"
          : "Animation";
    const statusLabel =
      status === "dirty"
        ? "editing"
        : status === "compiling"
          ? "loading"
          : status === "compiled"
            ? "loaded"
            : status === "runtime-error"
              ? "runtime error"
              : status;
    return `${targetLabel} ${statusLabel}`;
  };
  const activeTargetStates = AUTHORING_COMPILE_TARGETS.map((target) => ({
    target,
    state: authoringCompileTargets[target],
  })).filter(({ state }) => state.status !== "idle");

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap px-2 py-1 border-b border-border-default/40"
      data-testid="authoring-compile-status-bar"
    >
      <span
        data-testid="authoring-graph-status-chip"
        className={cn(
          "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
          statusTone,
        )}
      >
        Modules {graphStatus}
      </span>
      {activeTargetStates.map(({ target, state }) => (
        <span
          key={target}
          data-testid={`authoring-compile-target-${target}`}
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide",
            resolveCompileTone(state.status),
          )}
        >
          {formatTargetLabel(target, state.status)}
        </span>
      ))}
      {targetStatusMessages[0] ? (
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 truncate max-w-[260px]">
          {targetStatusMessages[0]}
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
    </div>
  );
}

export function InspectorPanel({
  activeInspectorTarget = null,
  selectedPoseGroup = null,
  onSelectPoseGroup,
  selectedBlendStage = null,
  onSelectBlendStage,
  selectedAnimationTarget = null,
  onRenameAnimationTarget,
  onUpdateAnimationTargetDuration,
  onInspectAnimationTrack,
  onInspectAnimationInput,
  selectedProgramTarget = null,
  onRenameProgramTarget,
  onInspectProgramNode,
  onInspectProgramInput,
  hasReferenceFaceFile = false,
  onClosePanel,
}: InspectorPanelProps) {
  const {
    poses,
    neutralInputs,
    poseConfigDraft,
    blendMode,
    setPoseGroupBlendMode,
    setPoseGroupNeutralSource,
    clearPoseGroupNeutralSource,
    blendStages,
    setBlendStageMode,
    setBlendStageSources,
    setBlendStageNeutralSource,
    clearBlendStageNeutralSource,
    selectPose,
    selectedPoseId,
    standardInputs,
  } = usePoseRig();
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const animationTracks = useAnimationStore((state) => state.tracks);
  const selectedAnimationTrackId = useAnimationStore(
    (state) => state.selectedTrackId,
  );
  const selectedAnimationKeyframeId = useAnimationStore(
    (state) => state.selectedKeyframeId,
  );
  const selectedAnimationCurveItem = useAnimationStore(
    (state) => state.selectedCurveItem,
  );
  const setAnimationTrackInterpolation = useAnimationStore(
    (state) => state.setTrackInterpolation,
  );
  const updateAnimationKeyframe = useAnimationStore(
    (state) => state.updateKeyframe,
  );
  const removeAnimationTrack = useAnimationStore((state) => state.removeTrack);
  const removeAnimationKeyframe = useAnimationStore(
    (state) => state.removeKeyframe,
  );
  const selectAnimationTrack = useAnimationStore((state) => state.selectTrack);
  const selectAnimationKeyframe = useAnimationStore(
    (state) => state.selectKeyframe,
  );
  const selectAnimationCurveItem = useAnimationStore(
    (state) => state.selectCurveItem,
  );
  const animationTimeDisplayMode = useAnimationStore(
    (state) => state.timeDisplayMode,
  );

  const poseLookup = useMemo(() => {
    const lookup = new Map<string, PoseDefinition>();
    poses.forEach((pose) => lookup.set(pose.id, pose));
    return lookup;
  }, [poses]);

  const authoringInputById = useMemo(() => {
    const lookup = new Map<string, (typeof standardInputs)[number]>();
    standardInputs.forEach((input) => {
      lookup.set(input.id, input);
    });
    return lookup;
  }, [standardInputs]);

  const authoringInputOrderById = useMemo(() => {
    const order = new Map<string, number>();
    standardInputs.forEach((input, index) => {
      order.set(input.id, index);
    });
    return order;
  }, [standardInputs]);

  const activePoseGroupPoses = useMemo(() => {
    if (!selectedPoseGroup) {
      return [] as PoseDefinition[];
    }
    return selectedPoseGroup.poseIds
      .map((poseId) => poseLookup.get(poseId))
      .filter((pose): pose is PoseDefinition => Boolean(pose));
  }, [selectedPoseGroup, poseLookup]);

  const poseGroupsFromConfig = useMemo(
    () => (poseConfigDraft?.poseGroups ?? []) as PoseGroupDefinition[],
    [poseConfigDraft?.poseGroups],
  );

  const activePoseGroupConfig = useMemo(() => {
    if (!selectedPoseGroup?.groupId) {
      return null;
    }
    return (
      poseGroupsFromConfig.find(
        (group) => group.id === selectedPoseGroup.groupId,
      ) ?? null
    );
  }, [poseGroupsFromConfig, selectedPoseGroup?.groupId]);

  const activePoseGroupBlendMode = useMemo(() => {
    if (!selectedPoseGroup?.groupId || !poseConfigDraft?.poseGroups) {
      return blendMode;
    }
    const configuredGroup = poseConfigDraft.poseGroups.find(
      (group) => group.id === selectedPoseGroup.groupId,
    );
    return configuredGroup?.blendMode ?? blendMode;
  }, [blendMode, poseConfigDraft?.poseGroups, selectedPoseGroup?.groupId]);

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

  const poseWeightsByPoseId = useMemo(() => {
    const weights: Record<string, number> = {};
    poses.forEach((pose) => {
      const inputId = poseWeightInputIdByPoseId.get(pose.id);
      const stored = inputId ? inputValues[inputId] : undefined;
      if (isFiniteNumber(stored)) {
        weights[pose.id] = clamp01(stored);
        return;
      }
      weights[pose.id] = selectedPoseId === pose.id ? 1 : 0;
    });
    return weights;
  }, [inputValues, poseWeightInputIdByPoseId, poses, selectedPoseId]);

  const poseGroupWeights = useMemo(() => {
    if (!selectedPoseGroup) {
      return {} as Record<string, number>;
    }
    const next: Record<string, number> = {};
    selectedPoseGroup.poseIds.forEach((poseId) => {
      next[poseId] = clamp01(poseWeightsByPoseId[poseId] ?? 0);
    });
    return next;
  }, [poseWeightsByPoseId, selectedPoseGroup]);

  const resolveNeutralValue = (inputId: string) => {
    const neutral = neutralInputs[inputId];
    if (isFiniteNumber(neutral)) {
      return neutral;
    }
    const fallback = standardInputsById.get(inputId)?.defaultValue;
    if (isFiniteNumber(fallback)) {
      return fallback;
    }
    return 0;
  };

  const clampInputValue = (inputId: string, value: number) => {
    const input = standardInputsById.get(inputId);
    return clampToInputRange(input, value);
  };

  const applyPoseGroupPreview = (
    groupPoses: PoseDefinition[],
    weights: Record<string, number>,
  ) => {
    const updates: Record<string, number> = {};
    managedStandardInputs.forEach((entry) => {
      updates[entry.input.id] = resolveNeutralValue(entry.input.id);
    });

    const affectedInputs = new Set<string>();
    groupPoses.forEach((pose) => {
      Object.keys(pose.values).forEach((inputId) =>
        affectedInputs.add(inputId),
      );
    });

    affectedInputs.forEach((inputId) => {
      const neutral = resolveNeutralValue(inputId);
      let totalWeight = 0;
      let totalWeightedDelta = 0;
      groupPoses.forEach((pose) => {
        const weight = clamp01(weights[pose.id] ?? 0);
        if (weight <= 0) {
          return;
        }
        const target = pose.values[inputId];
        const poseValue = isFiniteNumber(target) ? target : neutral;
        const delta = poseValue - neutral;
        if (Math.abs(delta) < 1e-6) {
          return;
        }
        totalWeight += weight;
        totalWeightedDelta += delta * weight;
      });

      let nextValue = neutral;
      if (activePoseGroupBlendMode === "additive") {
        nextValue = neutral + totalWeightedDelta;
      } else if (totalWeight > 0) {
        nextValue = neutral + totalWeightedDelta / Math.max(totalWeight, 1);
      }
      updates[inputId] = clampInputValue(inputId, nextValue);
    });

    applyStandardInputBatch(updates, { replace: true });
  };

  const groupTotalWeight = useMemo(
    () =>
      activePoseGroupPoses.reduce(
        (sum, pose) => sum + clamp01(poseGroupWeights[pose.id] ?? 0),
        0,
      ),
    [activePoseGroupPoses, poseGroupWeights],
  );

  const handlePoseGroupWeightChange = (poseId: string, nextWeight: number) => {
    const clamped = clamp01(nextWeight);
    const poseWeightInputId = poseWeightInputIdByPoseId.get(poseId);
    if (poseWeightInputId) {
      handleInputValueChange(poseWeightInputId, clamped);
      return;
    }
    const next = {
      ...poseGroupWeights,
      [poseId]: clamped,
    };
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const handlePoseGroupReset = () => {
    const canonicalUpdates: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      const poseWeightInputId = poseWeightInputIdByPoseId.get(pose.id);
      if (poseWeightInputId) {
        canonicalUpdates[poseWeightInputId] = 0;
      }
    });
    if (Object.keys(canonicalUpdates).length > 0) {
      applyStandardInputBatch(canonicalUpdates);
      return;
    }
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = 0;
    });
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const handlePoseGroupSolo = (poseId: string) => {
    const canonicalUpdates: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      const poseWeightInputId = poseWeightInputIdByPoseId.get(pose.id);
      if (poseWeightInputId) {
        canonicalUpdates[poseWeightInputId] = pose.id === poseId ? 1 : 0;
      }
    });
    if (Object.keys(canonicalUpdates).length > 0) {
      applyStandardInputBatch(canonicalUpdates);
      return;
    }
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = pose.id === poseId ? 1 : 0;
    });
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const defaultPoseReferenceId = poses[0]?.id ?? null;
  const activeGroupNeutral = activePoseGroupConfig?.neutral;
  const activeGroupNeutralSourceType =
    resolveNeutralSourceType(activeGroupNeutral);

  const setActiveGroupNeutralSourceType = (
    sourceType: "inherit" | "pose-reference" | "direct-values",
  ) => {
    const groupId = selectedPoseGroup?.groupId;
    if (!groupId) {
      return;
    }
    if (sourceType === "inherit") {
      setPoseGroupNeutralSource(groupId, { sourceType: "inherit" });
      return;
    }
    if (sourceType === "pose-reference") {
      const currentPoseId =
        activeGroupNeutral?.sourceType === "pose-reference"
          ? activeGroupNeutral.poseId
          : null;
      const poseId =
        (currentPoseId && poseLookup.has(currentPoseId)
          ? currentPoseId
          : defaultPoseReferenceId) ?? null;
      if (!poseId) {
        return;
      }
      setPoseGroupNeutralSource(groupId, {
        sourceType: "pose-reference",
        poseId,
      });
      return;
    }

    const nextValues =
      activeGroupNeutral?.sourceType === "direct-values"
        ? { ...activeGroupNeutral.values }
        : {};
    setPoseGroupNeutralSource(groupId, {
      sourceType: "direct-values",
      values: nextValues,
    });
  };

  const setActiveGroupNeutralPoseReference = (poseId: string) => {
    const groupId = selectedPoseGroup?.groupId;
    if (!groupId || !poseLookup.has(poseId)) {
      return;
    }
    setPoseGroupNeutralSource(groupId, {
      sourceType: "pose-reference",
      poseId,
    });
  };

  const activeBlendStageDefinitions = useMemo(
    () => (Array.isArray(blendStages) ? blendStages : []),
    [blendStages],
  );

  const selectedStageIndex = useMemo(() => {
    if (!selectedBlendStage) {
      return -1;
    }
    return activeBlendStageDefinitions.findIndex(
      (stage) => stage.id === selectedBlendStage.id,
    );
  }, [activeBlendStageDefinitions, selectedBlendStage]);

  const selectedStageDefinition =
    selectedStageIndex >= 0
      ? activeBlendStageDefinitions[selectedStageIndex]
      : null;

  const setActiveGroupNeutralDirectValue = (inputId: string, value: number) => {
    const groupId = selectedPoseGroup?.groupId;
    if (!groupId) {
      return;
    }
    const input = authoringInputById.get(inputId);
    if (!input) {
      return;
    }
    const clamped = clampToInputRange(input, value);
    const baseValues =
      activeGroupNeutral?.sourceType === "direct-values"
        ? activeGroupNeutral.values
        : {};
    setPoseGroupNeutralSource(groupId, {
      sourceType: "direct-values",
      values: {
        ...baseValues,
        [inputId]: clamped,
      },
    });
  };

  const groupCompositionPreview = useMemo(() => {
    if (!selectedPoseGroup) {
      return null;
    }
    return buildPoseGroupCompositionPreview({
      standardInputs,
      neutralInputs,
      poses,
      poseWeights: poseWeightsByPoseId,
      group: {
        id: selectedPoseGroup.groupId ?? selectedPoseGroup.groupPath,
        label: selectedPoseGroup.label,
        blendMode: activePoseGroupBlendMode,
        poseIds: selectedPoseGroup.poseIds,
        neutral: activeGroupNeutral,
      },
    });
  }, [
    activeGroupNeutral,
    activePoseGroupBlendMode,
    neutralInputs,
    poseWeightsByPoseId,
    poses,
    selectedPoseGroup,
    standardInputs,
  ]);

  const groupPreviewChannelByInputId = useMemo(() => {
    const map = new Map<string, PoseGroupCompositionChannel>();
    groupCompositionPreview?.channels.forEach((channel) => {
      map.set(channel.inputId, channel);
    });
    return map;
  }, [groupCompositionPreview]);

  const groupNeutralEditableInputIds = useMemo(() => {
    const ids = new Set<string>();
    activePoseGroupPoses.forEach((pose) => {
      Object.keys(pose.values).forEach((inputId) => ids.add(inputId));
    });
    if (activeGroupNeutralSourceType === "direct-values") {
      standardInputs.forEach((input) => ids.add(input.id));
    }
    if (activeGroupNeutral?.sourceType === "direct-values") {
      Object.keys(activeGroupNeutral.values).forEach((inputId) =>
        ids.add(inputId),
      );
    }
    groupCompositionPreview?.channels.forEach((channel) =>
      ids.add(channel.inputId),
    );
    return sortInputIds(ids, authoringInputOrderById).filter((inputId) =>
      authoringInputById.has(inputId),
    );
  }, [
    activeGroupNeutral,
    activeGroupNeutralSourceType,
    activePoseGroupPoses,
    authoringInputById,
    authoringInputOrderById,
    groupCompositionPreview,
    standardInputs,
  ]);

  const activeStageNeutral = selectedStageDefinition?.neutral;
  const activeStageNeutralSourceType =
    resolveNeutralSourceType(activeStageNeutral);

  const stageGroupOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string }>();
    poseGroupsFromConfig.forEach((group) => {
      const id = group.id?.trim();
      if (!id || options.has(id)) {
        return;
      }
      const path =
        normalizePoseGroupPath(group.path) ||
        normalizePoseGroupPath(group.name) ||
        normalizePoseGroupPath(group.id) ||
        id;
      options.set(id, {
        id,
        label: path,
      });
    });
    return Array.from(options.values());
  }, [poseGroupsFromConfig]);

  const priorStageOptions = useMemo(
    () => activeBlendStageDefinitions.slice(0, Math.max(0, selectedStageIndex)),
    [activeBlendStageDefinitions, selectedStageIndex],
  );

  const selectedStageGroupSourceIds = useMemo(
    () =>
      new Set(
        (selectedStageDefinition?.sources ?? [])
          .filter((source) => source.kind === "group")
          .map((source) => source.id),
      ),
    [selectedStageDefinition?.sources],
  );

  const selectedStageStageSourceIds = useMemo(
    () =>
      new Set(
        (selectedStageDefinition?.sources ?? [])
          .filter((source) => source.kind === "stage")
          .map((source) => source.id),
      ),
    [selectedStageDefinition?.sources],
  );

  const toggleStageSource = (source: PoseIrStageSource) => {
    if (!selectedStageDefinition) {
      return;
    }
    const hasSource = selectedStageDefinition.sources.some(
      (entry) => entry.kind === source.kind && entry.id === source.id,
    );
    const nextSources = hasSource
      ? selectedStageDefinition.sources.filter(
          (entry) => !(entry.kind === source.kind && entry.id === source.id),
        )
      : [...selectedStageDefinition.sources, source];
    const dedupedSources: PoseIrStageSource[] = [];
    const seen = new Set<string>();
    nextSources.forEach((entry) => {
      const key = stageSourceToken(entry);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      dedupedSources.push(entry);
    });
    setBlendStageSources(selectedStageDefinition.id, dedupedSources);
  };

  const setActiveStageNeutralSourceType = (
    sourceType: "inherit" | "pose-reference" | "direct-values",
  ) => {
    if (!selectedStageDefinition) {
      return;
    }
    if (sourceType === "inherit") {
      setBlendStageNeutralSource(selectedStageDefinition.id, {
        sourceType: "inherit",
      });
      return;
    }
    if (sourceType === "pose-reference") {
      const currentPoseId =
        activeStageNeutral?.sourceType === "pose-reference"
          ? activeStageNeutral.poseId
          : null;
      const poseId =
        (currentPoseId && poseLookup.has(currentPoseId)
          ? currentPoseId
          : defaultPoseReferenceId) ?? null;
      if (!poseId) {
        return;
      }
      setBlendStageNeutralSource(selectedStageDefinition.id, {
        sourceType: "pose-reference",
        poseId,
      });
      return;
    }
    const nextValues =
      activeStageNeutral?.sourceType === "direct-values"
        ? { ...activeStageNeutral.values }
        : {};
    setBlendStageNeutralSource(selectedStageDefinition.id, {
      sourceType: "direct-values",
      values: nextValues,
    });
  };

  const setActiveStageNeutralPoseReference = (poseId: string) => {
    if (!selectedStageDefinition || !poseLookup.has(poseId)) {
      return;
    }
    setBlendStageNeutralSource(selectedStageDefinition.id, {
      sourceType: "pose-reference",
      poseId,
    });
  };

  const setActiveStageNeutralDirectValue = (inputId: string, value: number) => {
    if (!selectedStageDefinition) {
      return;
    }
    const input = authoringInputById.get(inputId);
    if (!input) {
      return;
    }
    const clamped = clampToInputRange(input, value);
    const baseValues =
      activeStageNeutral?.sourceType === "direct-values"
        ? activeStageNeutral.values
        : {};
    setBlendStageNeutralSource(selectedStageDefinition.id, {
      sourceType: "direct-values",
      values: {
        ...baseValues,
        [inputId]: clamped,
      },
    });
  };

  const stageCompositionPreview = useMemo(() => {
    if (!selectedBlendStage) {
      return null;
    }
    return buildPoseStageCompositionPreview({
      standardInputs,
      neutralInputs,
      poses,
      poseWeights: poseWeightsByPoseId,
      poseGroups: poseConfigDraft?.poseGroups,
      blendStages: activeBlendStageDefinitions,
      defaultGroupBlendMode: blendMode,
      stageId: selectedBlendStage.id,
    });
  }, [
    activeBlendStageDefinitions,
    blendMode,
    neutralInputs,
    poseConfigDraft?.poseGroups,
    poseWeightsByPoseId,
    poses,
    selectedBlendStage,
    standardInputs,
  ]);

  const stagePreviewChannelByInputId = useMemo(() => {
    const map = new Map<string, PoseStageCompositionChannel>();
    stageCompositionPreview?.channels.forEach((channel) => {
      map.set(channel.inputId, channel);
    });
    return map;
  }, [stageCompositionPreview]);

  const stageNeutralEditableInputIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeStageNeutralSourceType === "direct-values") {
      standardInputs.forEach((input) => ids.add(input.id));
    }
    stageCompositionPreview?.channels.forEach((channel) =>
      ids.add(channel.inputId),
    );
    if (activeStageNeutral?.sourceType === "direct-values") {
      Object.keys(activeStageNeutral.values).forEach((inputId) =>
        ids.add(inputId),
      );
    }
    return sortInputIds(ids, authoringInputOrderById).filter((inputId) =>
      authoringInputById.has(inputId),
    );
  }, [
    activeStageNeutral,
    activeStageNeutralSourceType,
    authoringInputById,
    authoringInputOrderById,
    stageCompositionPreview,
    standardInputs,
  ]);

  const selectedAnimationTrack = useMemo(
    () =>
      selectedAnimationTrackId
        ? (animationTracks.find(
            (track) => track.id === selectedAnimationTrackId,
          ) ?? null)
        : null,
    [animationTracks, selectedAnimationTrackId],
  );
  const selectedAnimationKeyframe = useMemo(() => {
    if (!selectedAnimationTrack) {
      return null;
    }
    const keyframeId =
      selectedAnimationCurveItem?.kind === "keyframe"
        ? selectedAnimationCurveItem.keyframeId
        : selectedAnimationCurveItem
          ? null
          : selectedAnimationKeyframeId;
    if (!keyframeId) {
      return null;
    }
    return (
      selectedAnimationTrack.keyframes.find(
        (keyframe) => keyframe.id === keyframeId,
      ) ?? null
    );
  }, [
    selectedAnimationCurveItem,
    selectedAnimationKeyframeId,
    selectedAnimationTrack,
  ]);
  const selectedAnimationTrackKeyframes = useMemo(() => {
    if (!selectedAnimationTrack) {
      return [];
    }
    return [...selectedAnimationTrack.keyframes].sort((left, right) => {
      if (left.time !== right.time) {
        return left.time - right.time;
      }
      return left.id.localeCompare(right.id);
    });
  }, [selectedAnimationTrack]);
  const selectedAnimationKeyframeIndex = useMemo(() => {
    if (!selectedAnimationKeyframe) {
      return -1;
    }
    return selectedAnimationTrackKeyframes.findIndex(
      (keyframe) => keyframe.id === selectedAnimationKeyframe.id,
    );
  }, [selectedAnimationKeyframe, selectedAnimationTrackKeyframes]);
  const selectedAnimationIncomingSegment = useMemo(() => {
    if (!selectedAnimationTrack || selectedAnimationKeyframeIndex <= 0) {
      return null;
    }
    return resolveAnimationSegmentInspectorModel(
      selectedAnimationTrackKeyframes,
      selectedAnimationTrack.interpolation,
      selectedAnimationKeyframeIndex - 1,
    );
  }, [
    selectedAnimationKeyframeIndex,
    selectedAnimationTrack,
    selectedAnimationTrackKeyframes,
  ]);
  const selectedAnimationOutgoingSegment = useMemo(() => {
    if (
      !selectedAnimationTrack ||
      selectedAnimationKeyframeIndex < 0 ||
      selectedAnimationKeyframeIndex >=
        selectedAnimationTrackKeyframes.length - 1
    ) {
      return null;
    }
    return resolveAnimationSegmentInspectorModel(
      selectedAnimationTrackKeyframes,
      selectedAnimationTrack.interpolation,
      selectedAnimationKeyframeIndex,
    );
  }, [
    selectedAnimationKeyframeIndex,
    selectedAnimationTrack,
    selectedAnimationTrackKeyframes,
  ]);
  const selectedAnimationSegment = useMemo(() => {
    if (!selectedAnimationTrack) {
      return null;
    }
    return resolveSelectedAnimationSegmentInspectorModel(
      selectedAnimationCurveItem,
      selectedAnimationTrackKeyframes,
      selectedAnimationTrack.interpolation,
    );
  }, [
    selectedAnimationCurveItem,
    selectedAnimationTrack,
    selectedAnimationTrackKeyframes,
  ]);
  const selectedAnimationHandleSide: AnimationSegmentHandleSide | null =
    selectedAnimationCurveItem?.kind === "handle"
      ? selectedAnimationCurveItem.side
      : null;
  const selectedAnimationInput = useMemo(() => {
    if (!selectedAnimationTrack) {
      return undefined;
    }
    return standardInputsById.get(selectedAnimationTrack.variableId);
  }, [selectedAnimationTrack, standardInputsById]);
  const selectedAnimationValueRange = useMemo(() => {
    const min = selectedAnimationInput?.range?.min;
    const max = selectedAnimationInput?.range?.max;
    if (isFiniteNumber(min) && isFiniteNumber(max) && max >= min) {
      return { min, max };
    }
    return { min: -1, max: 1 };
  }, [selectedAnimationInput]);
  const selectedAnimationValueStep = useMemo(
    () =>
      resolveSliderStep(
        selectedAnimationValueRange.min,
        selectedAnimationValueRange.max,
      ),
    [selectedAnimationValueRange.max, selectedAnimationValueRange.min],
  );
  const selectedAnimationKeyframeTimeFieldValue = useMemo(() => {
    if (!selectedAnimationKeyframe) {
      return 0;
    }
    if (animationTimeDisplayMode === "frames") {
      return secondsToFrames(selectedAnimationKeyframe.time);
    }
    return selectedAnimationKeyframe.time;
  }, [animationTimeDisplayMode, selectedAnimationKeyframe]);
  const selectedAnimationTimeFieldStep =
    animationTimeDisplayMode === "frames" ? 1 : 0.1;
  const selectedAnimationTimeFieldLabel = resolveAnimationTimeFieldLabel(
    animationTimeDisplayMode,
  );
  const commitAnimationSegmentMode = (
    segment: AnimationSegmentInspectorModel,
    interpolation: AnimationTrack["interpolation"],
  ) => {
    const handles =
      interpolation === "spline"
        ? {
            outHandle: segment.outHandle,
            inHandle: segment.inHandle,
          }
        : resolveAnimationPresetHandles(
            interpolation,
            segment.start,
            segment.end,
          );
    updateAnimationKeyframe(selectedAnimationTrack!.id, segment.start.id, {
      interpolation,
      outHandle: {
        x: quantizeAnimationHandleValue(handles.outHandle.x),
        y: quantizeAnimationHandleValue(handles.outHandle.y),
      },
      outTangent: undefined,
    });
    updateAnimationKeyframe(selectedAnimationTrack!.id, segment.end.id, {
      inHandle: {
        x: quantizeAnimationHandleValue(handles.inHandle.x),
        y: quantizeAnimationHandleValue(handles.inHandle.y),
      },
      inTangent: undefined,
    });
  };
  const commitAnimationSegmentHandle = (
    segment: AnimationSegmentInspectorModel,
    side: "out" | "in",
    axis: "x" | "y",
    value: number,
  ) => {
    if (!Number.isFinite(value)) {
      return;
    }
    const nextValue = quantizeAnimationHandleValue(value);
    if (side === "out") {
      updateAnimationKeyframe(selectedAnimationTrack!.id, segment.start.id, {
        interpolation: "spline",
        outHandle: {
          ...segment.outHandle,
          [axis]: nextValue,
        },
        outTangent: undefined,
      });
      return;
    }
    updateAnimationKeyframe(selectedAnimationTrack!.id, segment.start.id, {
      interpolation: "spline",
      outTangent: undefined,
    });
    updateAnimationKeyframe(selectedAnimationTrack!.id, segment.end.id, {
      inHandle: {
        ...segment.inHandle,
        [axis]: nextValue,
      },
      inTangent: undefined,
    });
  };
  const renderAnimationHandleFields = ({
    title,
    segment,
    handleSide,
    testIdPrefix,
    selected = false,
  }: {
    title: string;
    segment: AnimationSegmentInspectorModel | null;
    handleSide: AnimationSegmentHandleSide;
    testIdPrefix: string;
    selected?: boolean;
  }) => {
    if (!segment) {
      return (
        <div className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5 text-[10px] text-text-muted">
          No {title.toLowerCase()}.
        </div>
      );
    }
    const handle = handleSide === "out" ? segment.outHandle : segment.inHandle;
    return (
      <div
        className={cn(
          "rounded border bg-bg-input/25 px-2 py-2",
          selected
            ? "border-accent/70 shadow-[0_0_0_1px_rgba(45,212,191,0.25)]"
            : "border-border-default/50",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {title}
          </span>
          <span className="font-mono text-[9px] text-text-muted">
            {formatKeyframeTime(segment.start.time, animationTimeDisplayMode)} -
            {formatKeyframeTime(segment.end.time, animationTimeDisplayMode)}
          </span>
        </div>
        <div className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">
            Handle
          </span>
          <input
            type="number"
            data-testid={`${testIdPrefix}-x-input`}
            step="0.01"
            className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
            value={handle.x}
            onChange={(event) =>
              commitAnimationSegmentHandle(
                segment,
                handleSide,
                "x",
                Number.parseFloat(event.target.value),
              )
            }
            aria-label={`${title} handle x`}
          />
          <input
            type="number"
            data-testid={`${testIdPrefix}-y-input`}
            step="0.01"
            className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
            value={handle.y}
            onChange={(event) =>
              commitAnimationSegmentHandle(
                segment,
                handleSide,
                "y",
                Number.parseFloat(event.target.value),
              )
            }
            aria-label={`${title} handle y`}
          />
        </div>
      </div>
    );
  };

  const renderAnimationSegmentInspector = (
    segment: AnimationSegmentInspectorModel | null,
    selectedHandleSide: AnimationSegmentHandleSide | null,
  ) => {
    if (!segment) {
      return (
        <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 text-[10px] text-text-muted">
          Select a segment or handle in the timeline to inspect interpolation
          controls.
        </div>
      );
    }
    return (
      <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {selectedHandleSide ? "Handle" : "Segment"}
          </span>
          <span className="font-mono text-[9px] text-text-muted">
            {formatKeyframeTime(segment.start.time, animationTimeDisplayMode)} -
            {formatKeyframeTime(segment.end.time, animationTimeDisplayMode)}
          </span>
        </div>
        <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">
            Mode
          </span>
          <select
            data-testid="animation-segment-mode-select"
            className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
            value={segment.interpolation}
            onChange={(event) =>
              commitAnimationSegmentMode(
                segment,
                event.target.value as AnimationTrack["interpolation"],
              )
            }
          >
            <option value="linear">Linear</option>
            <option value="step">Step</option>
            <option value="cubic">Cubic</option>
            <option value="spline">Custom spline</option>
          </select>
        </div>
        {selectedHandleSide ? (
          <div className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-accent">
            Selected {selectedHandleSide === "out" ? "outgoing" : "incoming"}{" "}
            handle
          </div>
        ) : null}
        {renderAnimationHandleFields({
          title: "Outgoing Handle",
          segment,
          handleSide: "out",
          testIdPrefix: "animation-segment-out-handle",
          selected: selectedHandleSide === "out",
        })}
        {renderAnimationHandleFields({
          title: "Incoming Handle",
          segment,
          handleSide: "in",
          testIdPrefix: "animation-segment-in-handle",
          selected: selectedHandleSide === "in",
        })}
      </div>
    );
  };

  const activeInspectorKind = activeInspectorTarget?.kind ?? null;
  const showPoseGroupInspector =
    activeInspectorKind === "pose-group" && Boolean(selectedPoseGroup);
  const showBlendStageInspector =
    activeInspectorKind === "blend-stage" && Boolean(selectedBlendStage);
  const showMotionGraphInspector = activeInspectorKind === "motiongraph-node";
  const showAnimationInspector =
    activeInspectorKind === "animation-track" &&
    Boolean(selectedAnimationTrack);
  const showAnimationTargetInspector =
    activeInspectorKind === "animation-target" &&
    Boolean(selectedAnimationTarget);
  const showProgramTargetInspector =
    activeInspectorKind === "program-target" && Boolean(selectedProgramTarget);
  const showDedicatedInspector =
    showPoseGroupInspector || showBlendStageInspector;
  const panelTitle = showPoseGroupInspector
    ? "Pose Group Inspector"
    : showBlendStageInspector
      ? "Blend Stage Inspector"
      : showProgramTargetInspector
        ? "Program Inspector"
        : showAnimationTargetInspector
          ? "Animation Inspector"
          : showMotionGraphInspector
            ? "Procedural Animation Programming Inspector"
            : showAnimationInspector
              ? "Animation Inspector"
              : "Inspector";
  const panelDescription = showDedicatedInspector
    ? "Author composition and inspect live output behavior."
    : showProgramTargetInspector
      ? "Inspect and edit the selected procedural animation program."
      : showAnimationTargetInspector
        ? "Inspect and edit the selected animation clip."
        : showMotionGraphInspector
          ? "Inspect and edit the selected procedural animation programming node."
          : showAnimationInspector
            ? "Inspect and edit the selected animation track or keyframe."
            : "View and edit selected object properties.";

  return (
    <Panel
      data-testid="inspector-panel"
      title={panelTitle}
      description={panelDescription}
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={
        onClosePanel ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-text-secondary hover:text-text-primary"
            onClick={onClosePanel}
            title="Hide panel"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col h-full min-h-0">
        <AuthoringCompileStatusBar />
        {!showDedicatedInspector && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {showProgramTargetInspector && selectedProgramTarget ? (
              <div className="flex flex-col gap-2 p-2">
                <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        Name
                      </div>
                      <div className="text-[10px] font-mono text-text-muted">
                        {selectedProgramTarget.source === "authored"
                          ? "Authored program"
                          : "Imported program"}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-text-muted">
                      {selectedProgramTarget.nodeCount} nodes ·{" "}
                      {selectedProgramTarget.edgeCount} edges
                    </div>
                  </div>
                  <Input
                    key={selectedProgramTarget.targetId}
                    size="sm"
                    defaultValue={selectedProgramTarget.name}
                    className="h-7 text-[11px]"
                    onBlur={(event) =>
                      commitInspectorNameChange(
                        selectedProgramTarget.name,
                        (nextName) =>
                          onRenameProgramTarget?.(
                            selectedProgramTarget.targetId,
                            nextName,
                          ),
                        event.target.value,
                      )
                    }
                    onKeyDown={handleNameFieldKeyDown}
                  />
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-text-muted">
                    <div>Inputs: {selectedProgramTarget.inputCount}</div>
                    <div>Outputs: {selectedProgramTarget.outputCount}</div>
                  </div>
                </div>

                <InspectorSection
                  title="I/O Nodes"
                  count={selectedProgramTarget.nodes.length}
                  emptyMessage="No input or output nodes are exposed by this program."
                >
                  <div className="flex flex-col gap-1.5">
                    {selectedProgramTarget.nodes.map((node) => (
                      <InspectorEntryButton
                        key={node.id}
                        title={node.label}
                        meta={
                          node.kind === "input" ? "Input node" : "Output node"
                        }
                        onClick={
                          onInspectProgramNode
                            ? () => onInspectProgramNode(node.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </InspectorSection>

                <InspectorSection
                  title="Inputs"
                  count={selectedProgramTarget.inputs.length}
                  emptyMessage="No runtime inputs are exposed by this program."
                >
                  <div className="flex flex-col gap-1.5">
                    {selectedProgramTarget.inputs.map((entry) => (
                      <InspectorEntryButton
                        key={entry.path}
                        title={entry.label}
                        meta={entry.path}
                        action={
                          entry.inputId && onInspectProgramInput ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                onInspectProgramInput(entry.inputId!)
                              }
                            >
                              Driver
                            </Button>
                          ) : entry.tag ? (
                            <span className="text-[10px] font-mono text-text-muted">
                              {entry.tag}
                            </span>
                          ) : null
                        }
                      />
                    ))}
                  </div>
                </InspectorSection>

                <InspectorSection
                  title="Outputs"
                  count={selectedProgramTarget.outputs.length}
                  emptyMessage="No runtime outputs are exposed by this program."
                >
                  <div className="flex flex-col gap-1.5">
                    {selectedProgramTarget.outputs.map((entry) => (
                      <InspectorEntryButton
                        key={entry.path}
                        title={entry.label}
                        meta={entry.path}
                        action={
                          entry.inputId && onInspectProgramInput ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                onInspectProgramInput(entry.inputId!)
                              }
                            >
                              Driver
                            </Button>
                          ) : entry.tag ? (
                            <span className="text-[10px] font-mono text-text-muted">
                              {entry.tag}
                            </span>
                          ) : null
                        }
                      />
                    ))}
                  </div>
                </InspectorSection>
              </div>
            ) : showMotionGraphInspector ? (
              <MgNodeInspector />
            ) : showAnimationTargetInspector && selectedAnimationTarget ? (
              <div className="flex flex-col gap-2 p-2">
                <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        Name
                      </div>
                      <div className="text-[10px] font-mono text-text-muted">
                        {selectedAnimationTarget.source === "authored"
                          ? "Authored clip"
                          : "Imported clip"}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-text-muted">
                      {selectedAnimationTarget.trackCount} tracks ·{" "}
                      {selectedAnimationTarget.duration.toFixed(2)}s
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        Clip Name
                      </div>
                      <Input
                        key={selectedAnimationTarget.targetId}
                        size="sm"
                        defaultValue={selectedAnimationTarget.name}
                        className="h-7 text-[11px]"
                        onBlur={(event) =>
                          commitInspectorNameChange(
                            selectedAnimationTarget.name,
                            (nextName) =>
                              onRenameAnimationTarget?.(
                                selectedAnimationTarget.targetId,
                                nextName,
                              ),
                            event.target.value,
                          )
                        }
                        onKeyDown={handleNameFieldKeyDown}
                      />
                    </div>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        Duration
                      </span>
                      <NumberField
                        key={`${selectedAnimationTarget.targetId}:duration`}
                        value={selectedAnimationTarget.duration}
                        min={0}
                        step={0.01}
                        size="sm"
                        allowScrub={false}
                        commitMode="blur"
                        format={{
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        }}
                        onChange={(nextDuration) =>
                          onUpdateAnimationTargetDuration?.(
                            selectedAnimationTarget.targetId,
                            nextDuration,
                          )
                        }
                        className="text-[11px]"
                      />
                    </label>
                  </div>
                </div>

                <InspectorSection
                  title="Tracks"
                  count={selectedAnimationTarget.tracks.length}
                  emptyMessage="No tracks yet for this animation."
                >
                  <div className="flex flex-col gap-1.5">
                    {selectedAnimationTarget.tracks.map((track) => (
                      <InspectorEntryButton
                        key={track.id}
                        title={track.label}
                        meta={`${track.channel} · ${track.keyframeCount} keyframes`}
                        onClick={
                          onInspectAnimationTrack
                            ? () => onInspectAnimationTrack(track.id)
                            : undefined
                        }
                        action={
                          track.inputId && onInspectAnimationInput ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                onInspectAnimationInput(track.inputId!)
                              }
                            >
                              {track.inputLabel ?? "Driver"}
                            </Button>
                          ) : null
                        }
                      />
                    ))}
                  </div>
                </InspectorSection>
              </div>
            ) : showAnimationInspector && selectedAnimationTrack ? (
              <div className="flex flex-col gap-2 p-2">
                <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-text-primary truncate">
                        {selectedAnimationTrack.label}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono truncate">
                        {selectedAnimationTrack.channel}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => {
                          selectAnimationTrack(null);
                          selectAnimationCurveItem(null);
                        }}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-color-danger"
                        onClick={() => {
                          removeAnimationTrack(selectedAnimationTrack.id);
                        }}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Track
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                      Interp
                    </span>
                    <select
                      data-testid="animation-track-interpolation-select"
                      className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
                      value={selectedAnimationTrack.interpolation}
                      onChange={(event) =>
                        setAnimationTrackInterpolation(
                          selectedAnimationTrack.id,
                          event.target
                            .value as typeof selectedAnimationTrack.interpolation,
                        )
                      }
                    >
                      <option value="linear">Linear</option>
                      <option value="step">Step</option>
                      <option value="cubic">Cubic</option>
                      <option value="spline">Spline</option>
                    </select>
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    Keyframes: {selectedAnimationTrack.keyframes.length}
                  </div>
                </div>
                <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">
                      Keyframes
                    </span>
                    <span className="text-[10px] text-text-muted font-mono">
                      {selectedAnimationTrackKeyframes.length}
                    </span>
                  </div>
                  {selectedAnimationTrackKeyframes.length === 0 ? (
                    <p className="text-[10px] text-text-muted">
                      No keyframes yet for this track.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {selectedAnimationTrackKeyframes.map((keyframe) => {
                        const isActive =
                          selectedAnimationCurveItem?.kind === "keyframe" &&
                          selectedAnimationCurveItem.keyframeId === keyframe.id;
                        return (
                          <button
                            key={keyframe.id}
                            type="button"
                            data-testid="animation-keyframe-item"
                            data-keyframe-id={keyframe.id}
                            className={cn(
                              "w-full rounded border px-2 py-1.5 text-left text-[10px] font-mono transition-colors",
                              isActive
                                ? "border-accent/70 bg-accent/15 text-text-primary"
                                : "border-border-default/50 bg-bg-input/35 text-text-secondary hover:bg-bg-hover/70 hover:text-text-primary",
                            )}
                            onClick={() => selectAnimationKeyframe(keyframe.id)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                t=
                                {formatKeyframeTime(
                                  keyframe.time,
                                  animationTimeDisplayMode,
                                )}
                              </span>
                              <span>v={keyframe.value.toFixed(4)}</span>
                            </div>
                            <div className="mt-0.5 text-[9px] uppercase tracking-wider text-text-muted">
                              {keyframe.interpolation
                                ? `Interp: ${keyframe.interpolation}`
                                : `Track: ${selectedAnimationTrack.interpolation}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedAnimationSegment ? (
                  renderAnimationSegmentInspector(
                    selectedAnimationSegment,
                    selectedAnimationHandleSide,
                  )
                ) : selectedAnimationKeyframe ? (
                  <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        Keyframe
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-color-danger"
                        onClick={() =>
                          removeAnimationKeyframe(
                            selectedAnimationTrack.id,
                            selectedAnimationKeyframe.id,
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Key
                      </Button>
                    </div>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        {selectedAnimationTimeFieldLabel}
                      </span>
                      <input
                        type="number"
                        data-testid="animation-keyframe-time-input"
                        step={selectedAnimationTimeFieldStep}
                        className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
                        value={selectedAnimationKeyframeTimeFieldValue}
                        onChange={(event) => {
                          const nextValue = Number.parseFloat(
                            event.target.value,
                          );
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }
                          const nextTimeSeconds =
                            animationTimeDisplayMode === "frames"
                              ? framesToSeconds(Math.round(nextValue))
                              : nextValue;
                          updateAnimationKeyframe(
                            selectedAnimationTrack.id,
                            selectedAnimationKeyframe.id,
                            {
                              time: nextTimeSeconds,
                            },
                          );
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        Value
                      </span>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={selectedAnimationKeyframe.value}
                          min={selectedAnimationValueRange.min}
                          max={selectedAnimationValueRange.max}
                          step={selectedAnimationValueStep}
                          fillMode="value"
                          onChange={(nextValue) => {
                            const numericValue =
                              typeof nextValue === "number"
                                ? nextValue
                                : nextValue[0];
                            if (!Number.isFinite(numericValue)) {
                              return;
                            }
                            updateAnimationKeyframe(
                              selectedAnimationTrack.id,
                              selectedAnimationKeyframe.id,
                              {
                                value: clampToInputRange(
                                  selectedAnimationInput,
                                  numericValue,
                                ),
                              },
                            );
                          }}
                        />
                        <input
                          type="number"
                          data-testid="animation-keyframe-value-input"
                          step={selectedAnimationValueStep}
                          min={selectedAnimationValueRange.min}
                          max={selectedAnimationValueRange.max}
                          className="h-7 w-[88px] rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
                          value={selectedAnimationKeyframe.value}
                          onChange={(event) => {
                            const nextValue = Number.parseFloat(
                              event.target.value,
                            );
                            if (!Number.isFinite(nextValue)) {
                              return;
                            }
                            updateAnimationKeyframe(
                              selectedAnimationTrack.id,
                              selectedAnimationKeyframe.id,
                              {
                                value: clampToInputRange(
                                  selectedAnimationInput,
                                  nextValue,
                                ),
                              },
                            );
                          }}
                        />
                      </div>
                    </div>
                    {renderAnimationHandleFields({
                      title: "Incoming Handle",
                      segment: selectedAnimationIncomingSegment,
                      handleSide: "in",
                      testIdPrefix: "animation-keyframe-in-handle",
                    })}
                    {renderAnimationHandleFields({
                      title: "Outgoing Handle",
                      segment: selectedAnimationOutgoingSegment,
                      handleSide: "out",
                      testIdPrefix: "animation-keyframe-out-handle",
                    })}
                  </div>
                ) : (
                  <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 text-[10px] text-text-muted">
                    Select a keyframe, segment, or handle in the timeline to
                    inspect animation controls.
                  </div>
                )}
              </div>
            ) : (
              <InspectorContent hasReferenceFaceFile={hasReferenceFaceFile} />
            )}
          </div>
        )}
        {showPoseGroupInspector && selectedPoseGroup && (
          <div className="px-2 pb-2 flex flex-col gap-2 min-h-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-text-primary truncate">
                  Pose Group Inspector · {selectedPoseGroup.label}
                </div>
                <div className="text-[10px] text-text-muted font-mono truncate">
                  /{selectedPoseGroup.groupPath}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onSelectPoseGroup?.(null)}
                title="Close Pose Group Inspector"
              >
                Close
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded border border-border-default/60 bg-bg-panel/40 px-2 py-1.5">
              <span className="text-[10px] text-text-muted">
                Blend mode:{" "}
                <span className="font-mono">
                  {activePoseGroupBlendMode}
                  {!selectedPoseGroup?.groupId ? " (global fallback)" : ""}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant={
                    activePoseGroupBlendMode === "average"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activePoseGroupBlendMode === "average" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedPoseGroup?.groupId ||
                    activePoseGroupBlendMode === "average"
                  }
                  onClick={() =>
                    selectedPoseGroup?.groupId &&
                    setPoseGroupBlendMode(selectedPoseGroup.groupId, "average")
                  }
                >
                  Average
                </Button>
                <Button
                  variant={
                    activePoseGroupBlendMode === "additive"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activePoseGroupBlendMode === "additive" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedPoseGroup?.groupId ||
                    activePoseGroupBlendMode === "additive"
                  }
                  onClick={() =>
                    selectedPoseGroup?.groupId &&
                    setPoseGroupBlendMode(selectedPoseGroup.groupId, "additive")
                  }
                >
                  Additive
                </Button>
                <span className="text-[10px] text-text-muted font-mono">
                  Weight: {groupTotalWeight.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[10px]"
                  onClick={handlePoseGroupReset}
                  title="Reset all pose weights in this group"
                >
                  <RotateCcw size={11} />
                  Reset
                </Button>
              </div>
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Pose Weights
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {activePoseGroupPoses.length} poses
                </span>
              </div>
              {activePoseGroupPoses.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {activePoseGroupPoses.map((pose) => {
                    const weight = clamp01(poseGroupWeights[pose.id] ?? 0);
                    const poseWeightInputId =
                      poseWeightInputIdByPoseId.get(pose.id) ?? null;
                    const poseWeightDefault = poseWeightInputId
                      ? (authoringInputById.get(poseWeightInputId)
                          ?.defaultValue ?? 0)
                      : 0;
                    return (
                      <div
                        key={pose.id}
                        className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 inspector-row-hit-target">
                          <div className="min-w-0 w-[120px] shrink-0">
                            <div className="text-[11px] text-text-primary truncate">
                              {pose.name}
                            </div>
                            <div className="text-[9px] text-text-muted font-mono truncate">
                              {pose.id}
                            </div>
                          </div>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={weight}
                            defaultValue={poseWeightDefault}
                            fillMode="value"
                            className="flex-1 min-w-[120px]"
                            onChange={(value) =>
                              handlePoseGroupWeightChange(
                                pose.id,
                                value as number,
                              )
                            }
                          />
                          <div className="inspector-numeric-control w-[72px] shrink-0">
                            <NumberField
                              size="sm"
                              value={weight}
                              allowScrub={false}
                              className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-[10px]"
                              onChange={(value) =>
                                handlePoseGroupWeightChange(pose.id, value)
                              }
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handlePoseGroupSolo(pose.id)}
                              title="Solo this pose at 100%"
                            >
                              Solo
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => {
                                onSelectPoseGroup?.(null);
                                selectPose(pose.id);
                                handlePoseGroupSolo(pose.id);
                              }}
                              title="Select and play this pose"
                            >
                              Play
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Activity}
                  iconSize={16}
                  title="No Poses In Group"
                  description="This group no longer contains pose entries."
                  className="py-3"
                />
              )}
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Neutral Source
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={!selectedPoseGroup.groupId}
                  onClick={() =>
                    selectedPoseGroup.groupId &&
                    clearPoseGroupNeutralSource(selectedPoseGroup.groupId)
                  }
                  title="Reset to inherited neutral"
                >
                  Reset
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={
                    activeGroupNeutralSourceType === "inherit"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeGroupNeutralSourceType === "inherit" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedPoseGroup.groupId ||
                    activeGroupNeutralSourceType === "inherit"
                  }
                  onClick={() => setActiveGroupNeutralSourceType("inherit")}
                >
                  Inherit
                </Button>
                <Button
                  variant={
                    activeGroupNeutralSourceType === "pose-reference"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeGroupNeutralSourceType === "pose-reference" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedPoseGroup.groupId ||
                    poses.length === 0 ||
                    activeGroupNeutralSourceType === "pose-reference"
                  }
                  onClick={() =>
                    setActiveGroupNeutralSourceType("pose-reference")
                  }
                >
                  Pose Reference
                </Button>
                <Button
                  variant={
                    activeGroupNeutralSourceType === "direct-values"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeGroupNeutralSourceType === "direct-values" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedPoseGroup.groupId ||
                    activeGroupNeutralSourceType === "direct-values"
                  }
                  onClick={() =>
                    setActiveGroupNeutralSourceType("direct-values")
                  }
                >
                  Direct Values
                </Button>
              </div>

              {activeGroupNeutralSourceType === "pose-reference" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">Pose</span>
                  <select
                    className="h-7 min-w-0 flex-1 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
                    value={
                      activeGroupNeutral?.sourceType === "pose-reference"
                        ? activeGroupNeutral.poseId
                        : (defaultPoseReferenceId ?? "")
                    }
                    onChange={(event) =>
                      setActiveGroupNeutralPoseReference(event.target.value)
                    }
                  >
                    {poses.map((pose) => (
                      <option key={pose.id} value={pose.id}>
                        {pose.name} ({pose.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeGroupNeutralSourceType === "direct-values" && (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {groupNeutralEditableInputIds.length === 0 ? (
                    <span className="text-[10px] text-text-muted">
                      No channels available for direct neutral editing.
                    </span>
                  ) : (
                    groupNeutralEditableInputIds.map((inputId) => {
                      const input = authoringInputById.get(inputId);
                      if (!input) {
                        return null;
                      }
                      const directValue =
                        activeGroupNeutral?.sourceType === "direct-values" &&
                        isFiniteNumber(activeGroupNeutral.values[inputId])
                          ? clampToInputRange(
                              input,
                              activeGroupNeutral.values[inputId],
                            )
                          : (groupPreviewChannelByInputId.get(inputId)?.neutral
                              .value ?? resolveNeutralValue(inputId));
                      return (
                        <div
                          key={inputId}
                          className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-text-primary truncate">
                              {input.label}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono truncate">
                              {inputId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Slider
                              min={input.range.min}
                              max={input.range.max}
                              step={0.0001}
                              value={directValue}
                              defaultValue={input.defaultValue}
                              className="flex-1"
                              fillMode="value"
                              onChange={(value) =>
                                setActiveGroupNeutralDirectValue(
                                  inputId,
                                  value as number,
                                )
                              }
                            />
                            <div className="inspector-numeric-control w-[88px]">
                              <NumberField
                                size="sm"
                                min={input.range.min}
                                max={input.range.max}
                                step={0.0001}
                                value={directValue}
                                allowScrub={false}
                                className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-[10px]"
                                onChange={(value) =>
                                  setActiveGroupNeutralDirectValue(
                                    inputId,
                                    value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <div className="text-[10px] text-text-muted">
                Effective neutral:{" "}
                <span className="font-mono text-text-primary">
                  {groupCompositionPreview?.neutral.detail ?? "Global neutral"}
                </span>
              </div>
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Composition Outputs
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {groupCompositionPreview?.channels.length ?? 0} channels
                </span>
              </div>
              {groupCompositionPreview &&
              groupCompositionPreview.channels.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-1.5">
                  {groupCompositionPreview.channels.map((channel) => {
                    const contributionSummary = channel.contributions
                      .filter(
                        (contribution) =>
                          contribution.hasAuthoredValue ||
                          contribution.activity > 0 ||
                          Math.abs(contribution.delta) >= 1e-6,
                      )
                      .map(
                        (contribution) =>
                          `${contribution.poseName}: w ${contribution.weight.toFixed(2)}, Δ ${contribution.delta.toFixed(4)}, wΔ ${contribution.weightedDelta.toFixed(4)}`,
                      )
                      .join(" · ");
                    return (
                      <div
                        key={channel.inputId}
                        className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-text-primary truncate">
                            {channel.label}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono whitespace-nowrap">
                            out {channel.effectiveValue.toFixed(4)} · Δ{" "}
                            {channel.delta.toFixed(4)}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-muted font-mono truncate">
                          {channel.inputId}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">
                          neutral {channel.neutral.value.toFixed(4)} · activity{" "}
                          {channel.maxActivity.toFixed(3)}
                        </div>
                        <div className="text-[10px] text-text-muted truncate">
                          neutral source: {channel.neutral.detail}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {contributionSummary || "No active contributions."}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-text-muted">
                  No composed group channels at current live pose weights.
                </div>
              )}
            </div>
          </div>
        )}
        {showBlendStageInspector && selectedBlendStage && (
          <div className="px-2 pb-2 flex flex-col gap-2 min-h-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-text-primary truncate">
                  Blend Stage Inspector · {selectedBlendStage.label}
                </div>
                <div className="text-[10px] text-text-muted font-mono truncate">
                  {selectedBlendStage.id}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onSelectBlendStage?.(null)}
                title="Close Blend Stage Inspector"
              >
                Close
              </Button>
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Stage Settings
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {selectedStageDefinition?.id ?? selectedBlendStage.id}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted">Mode</span>
                <Button
                  variant={
                    selectedStageDefinition?.mode === "average"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    selectedStageDefinition?.mode === "average" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedStageDefinition ||
                    selectedStageDefinition.mode === "average"
                  }
                  onClick={() =>
                    selectedStageDefinition &&
                    setBlendStageMode(selectedStageDefinition.id, "average")
                  }
                >
                  Average
                </Button>
                <Button
                  variant={
                    selectedStageDefinition?.mode === "add"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    selectedStageDefinition?.mode === "add" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedStageDefinition ||
                    selectedStageDefinition.mode === "add"
                  }
                  onClick={() =>
                    selectedStageDefinition &&
                    setBlendStageMode(selectedStageDefinition.id, "add")
                  }
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">
                  Group Sources
                </span>
                <div className="flex flex-wrap gap-1">
                  {stageGroupOptions.length === 0 ? (
                    <span className="text-[10px] text-text-muted">
                      No configured groups.
                    </span>
                  ) : (
                    stageGroupOptions.map((group) => {
                      const selected = selectedStageGroupSourceIds.has(
                        group.id,
                      );
                      return (
                        <button
                          key={group.id}
                          type="button"
                          className={cn(
                            "text-[10px] px-2 py-1 rounded border transition-colors disabled:cursor-default",
                            selected
                              ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/15"
                              : "border-border-default text-text-muted hover:border-border-default/80 hover:text-text-primary",
                          )}
                          aria-pressed={selected}
                          disabled={!selectedStageDefinition}
                          onClick={() =>
                            toggleStageSource({
                              kind: "group",
                              id: group.id,
                            })
                          }
                        >
                          {group.label}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">
                  Prior Stage Sources
                </span>
                <div className="flex flex-wrap gap-1">
                  {priorStageOptions.length === 0 ? (
                    <span className="text-[10px] text-text-muted">
                      No prior stages.
                    </span>
                  ) : (
                    priorStageOptions.map((stage, index) => {
                      const selected = selectedStageStageSourceIds.has(
                        stage.id,
                      );
                      const foundStageOrderIndex =
                        activeBlendStageDefinitions.findIndex(
                          (candidate) => candidate.id === stage.id,
                        );
                      const stageOrderIndex =
                        foundStageOrderIndex >= 0
                          ? foundStageOrderIndex
                          : index;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          className={cn(
                            "text-[10px] px-2 py-1 rounded border transition-colors disabled:cursor-default",
                            selected
                              ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/15"
                              : "border-border-default text-text-muted hover:border-border-default/80 hover:text-text-primary",
                          )}
                          aria-pressed={selected}
                          disabled={!selectedStageDefinition}
                          onClick={() =>
                            toggleStageSource({
                              kind: "stage",
                              id: stage.id,
                            })
                          }
                        >
                          {blendStageLabel(stage, stageOrderIndex)}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Neutral Source
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={!selectedStageDefinition}
                  onClick={() =>
                    selectedStageDefinition &&
                    clearBlendStageNeutralSource(selectedStageDefinition.id)
                  }
                  title="Reset to inherited neutral"
                >
                  Reset
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={
                    activeStageNeutralSourceType === "inherit"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeStageNeutralSourceType === "inherit" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedStageDefinition ||
                    activeStageNeutralSourceType === "inherit"
                  }
                  onClick={() => setActiveStageNeutralSourceType("inherit")}
                >
                  Inherit
                </Button>
                <Button
                  variant={
                    activeStageNeutralSourceType === "pose-reference"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeStageNeutralSourceType === "pose-reference" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedStageDefinition ||
                    poses.length === 0 ||
                    activeStageNeutralSourceType === "pose-reference"
                  }
                  onClick={() =>
                    setActiveStageNeutralSourceType("pose-reference")
                  }
                >
                  Pose Reference
                </Button>
                <Button
                  variant={
                    activeStageNeutralSourceType === "direct-values"
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className={cn(
                    "h-6 px-2 text-[10px] disabled:cursor-default",
                    activeStageNeutralSourceType === "direct-values" &&
                      "disabled:opacity-100",
                  )}
                  disabled={
                    !selectedStageDefinition ||
                    activeStageNeutralSourceType === "direct-values"
                  }
                  onClick={() =>
                    setActiveStageNeutralSourceType("direct-values")
                  }
                >
                  Direct Values
                </Button>
              </div>

              {activeStageNeutralSourceType === "pose-reference" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">Pose</span>
                  <select
                    className="h-7 min-w-0 flex-1 rounded border border-border-default/70 bg-bg-input/80 px-2 text-[10px] text-text-primary font-mono"
                    value={
                      activeStageNeutral?.sourceType === "pose-reference"
                        ? activeStageNeutral.poseId
                        : (defaultPoseReferenceId ?? "")
                    }
                    onChange={(event) =>
                      setActiveStageNeutralPoseReference(event.target.value)
                    }
                  >
                    {poses.map((pose) => (
                      <option key={pose.id} value={pose.id}>
                        {pose.name} ({pose.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeStageNeutralSourceType === "direct-values" && (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {stageNeutralEditableInputIds.length === 0 ? (
                    <span className="text-[10px] text-text-muted">
                      No channels available for direct neutral editing.
                    </span>
                  ) : (
                    stageNeutralEditableInputIds.map((inputId) => {
                      const input = authoringInputById.get(inputId);
                      if (!input) {
                        return null;
                      }
                      const directValue =
                        activeStageNeutral?.sourceType === "direct-values" &&
                        isFiniteNumber(activeStageNeutral.values[inputId])
                          ? clampToInputRange(
                              input,
                              activeStageNeutral.values[inputId],
                            )
                          : (stagePreviewChannelByInputId.get(inputId)?.neutral
                              .value ?? resolveNeutralValue(inputId));
                      return (
                        <div
                          key={inputId}
                          className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-text-primary truncate">
                              {input.label}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono truncate">
                              {inputId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Slider
                              min={input.range.min}
                              max={input.range.max}
                              step={0.0001}
                              value={directValue}
                              defaultValue={input.defaultValue}
                              className="flex-1"
                              fillMode="value"
                              onChange={(value) =>
                                setActiveStageNeutralDirectValue(
                                  inputId,
                                  value as number,
                                )
                              }
                            />
                            <div className="inspector-numeric-control w-[88px]">
                              <NumberField
                                size="sm"
                                min={input.range.min}
                                max={input.range.max}
                                step={0.0001}
                                value={directValue}
                                allowScrub={false}
                                className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-[10px]"
                                onChange={(value) =>
                                  setActiveStageNeutralDirectValue(
                                    inputId,
                                    value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <div className="text-[10px] text-text-muted">
                Effective neutral:{" "}
                <span className="font-mono text-text-primary">
                  {stageCompositionPreview?.neutral.detail ?? "Global neutral"}
                </span>
              </div>
            </div>

            <div className="rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2 min-h-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Composition Outputs
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {stageCompositionPreview?.channels.length ?? 0} channels
                </span>
              </div>
              {stageCompositionPreview &&
              stageCompositionPreview.channels.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-1.5">
                  {stageCompositionPreview.channels.map((channel) => {
                    const sourceSummary = channel.contributions
                      .map(
                        (contribution) =>
                          `${contribution.sourceKind}:${contribution.sourceLabel} · Δ ${contribution.delta.toFixed(4)} · act ${contribution.activity.toFixed(3)}`,
                      )
                      .join(" · ");
                    return (
                      <div
                        key={channel.inputId}
                        className="rounded border border-border-default/50 bg-bg-panel/25 px-2 py-1.5 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-text-primary truncate">
                            {channel.label}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono whitespace-nowrap">
                            out {channel.effectiveValue.toFixed(4)} · Δ{" "}
                            {channel.delta.toFixed(4)}
                          </span>
                        </div>
                        <div className="text-[10px] text-text-muted font-mono truncate">
                          {channel.inputId}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">
                          neutral {channel.neutral.value.toFixed(4)} · activity{" "}
                          {channel.activity.toFixed(3)}
                        </div>
                        <div className="text-[10px] text-text-muted truncate">
                          neutral source: {channel.neutral.detail}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {sourceSummary ||
                            "No active stage-source contributions."}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-text-muted">
                  No composed stage channels at current live pose weights.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

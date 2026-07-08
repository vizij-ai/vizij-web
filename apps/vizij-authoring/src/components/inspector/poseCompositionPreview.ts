import type { StandardRigInput } from "@vizij/utils";
import { resolvePoseMembership } from "../../poseRig/groupMembership";
import type {
  PoseBlendMode,
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrBlendStageDefinition,
  PoseScopedNeutralDefinition,
  PoseScopedNeutralSourceType,
  StandardInputId,
} from "../../poseRig/types";

const DELTA_EPSILON = 0.000001;

type NeutralSourceType = PoseScopedNeutralSourceType | "global";
type NeutralChannelOrigin = "global" | "inherit" | "scoped" | "fallback";

type NeutralChannelDetail = {
  value: number;
  origin: NeutralChannelOrigin;
  detail: string;
};

type ResolvedNeutralRecord = {
  sourceType: NeutralSourceType;
  detail: string;
  lowerDetail: string | null;
  values: Record<StandardInputId, number>;
  channels: Record<StandardInputId, NeutralChannelDetail>;
};

type LayerSignal = {
  value: number;
  delta: number;
  activity: number;
};

export interface PoseCompositionNeutralSummary {
  sourceType: NeutralSourceType;
  detail: string;
  lowerDetail: string | null;
}

export interface PoseCompositionNeutralChannelSummary {
  value: number;
  origin: NeutralChannelOrigin;
  detail: string;
}

export interface PoseGroupCompositionContribution {
  poseId: string;
  poseName: string;
  weight: number;
  value: number;
  delta: number;
  activity: number;
  weightedDelta: number;
  hasAuthoredValue: boolean;
}

export interface PoseGroupCompositionChannel {
  inputId: StandardInputId;
  label: string;
  path: string;
  effectiveValue: number;
  delta: number;
  neutral: PoseCompositionNeutralChannelSummary;
  totalActivity: number;
  maxActivity: number;
  weightedDeltaSum: number;
  contributions: PoseGroupCompositionContribution[];
}

export interface PoseGroupCompositionPreview {
  groupId: string;
  groupLabel: string;
  blendMode: PoseBlendMode;
  neutral: PoseCompositionNeutralSummary;
  channels: PoseGroupCompositionChannel[];
}

export interface PoseGroupPreviewTarget {
  id: string;
  label: string;
  blendMode: PoseBlendMode;
  poseIds: string[];
  neutral?: PoseScopedNeutralDefinition;
}

export interface PoseGroupCompositionPreviewArgs {
  standardInputs: StandardRigInput[];
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  poseWeights: Record<string, number>;
  group: PoseGroupPreviewTarget;
}

export interface PoseStageSourceContribution {
  sourceKind: "group" | "stage";
  sourceId: string;
  sourceLabel: string;
  value: number;
  delta: number;
  activity: number;
  weightedDelta: number;
}

export interface PoseStageCompositionChannel {
  inputId: StandardInputId;
  label: string;
  path: string;
  effectiveValue: number;
  delta: number;
  neutral: PoseCompositionNeutralChannelSummary;
  activity: number;
  contributions: PoseStageSourceContribution[];
}

export interface PoseStageCompositionPreview {
  stageId: string;
  stageLabel: string;
  mode: "average" | "add";
  neutral: PoseCompositionNeutralSummary;
  channels: PoseStageCompositionChannel[];
}

export interface PoseStageCompositionPreviewArgs {
  standardInputs: StandardRigInput[];
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  poseWeights: Record<string, number>;
  poseGroups?: PoseGroupDefinition[];
  blendStages?: PoseIrBlendStageDefinition[];
  defaultGroupBlendMode: PoseBlendMode;
  stageId: string;
}

export function resolveEffectiveNeutralRecord(args: {
  standardInputs: StandardRigInput[];
  lowerRecord: Record<StandardInputId, number>;
  lowerDetail: string;
  scopedNeutral: PoseScopedNeutralDefinition | undefined;
  poses: PoseDefinition[];
}): {
  summary: PoseCompositionNeutralSummary;
  values: Record<StandardInputId, number>;
  channels: Record<StandardInputId, PoseCompositionNeutralChannelSummary>;
} {
  const poseById = new Map(args.poses.map((pose) => [pose.id, pose]));
  const lowerChannels: Record<StandardInputId, NeutralChannelDetail> =
    Object.create(null) as Record<StandardInputId, NeutralChannelDetail>;

  args.standardInputs.forEach((input) => {
    const inputId = input.id as StandardInputId;
    const value = clampInputValue(input, args.lowerRecord[inputId] ?? 0);
    lowerChannels[inputId] = {
      value,
      origin: "inherit",
      detail: args.lowerDetail,
    };
  });

  const resolved = resolveScopedNeutralRecord({
    standardInputs: args.standardInputs,
    scopedNeutral: args.scopedNeutral,
    lower: {
      sourceType: "inherit",
      detail: args.lowerDetail,
      lowerDetail: null,
      values: args.lowerRecord,
      channels: lowerChannels,
    },
    poseById,
  });

  return {
    summary: {
      sourceType: resolved.sourceType,
      detail: resolved.detail,
      lowerDetail: resolved.lowerDetail,
    },
    values: resolved.values,
    channels: convertNeutralChannels(resolved.channels),
  };
}

export function buildPoseGroupCompositionPreview(
  args: PoseGroupCompositionPreviewArgs,
): PoseGroupCompositionPreview {
  const poseById = new Map(args.poses.map((pose) => [pose.id, pose]));
  const globalNeutral = buildGlobalNeutralRecord(
    args.standardInputs,
    args.neutralInputs,
  );
  const groupEvaluation = evaluateGroupTarget({
    standardInputs: args.standardInputs,
    poseById,
    poseWeights: args.poseWeights,
    group: args.group,
    globalNeutral,
  });

  return {
    groupId: args.group.id,
    groupLabel: args.group.label,
    blendMode: args.group.blendMode,
    neutral: {
      sourceType: groupEvaluation.neutral.sourceType,
      detail: groupEvaluation.neutral.detail,
      lowerDetail: groupEvaluation.neutral.lowerDetail,
    },
    channels: groupEvaluation.channels,
  };
}

export function buildPoseStageCompositionPreview(
  args: PoseStageCompositionPreviewArgs,
): PoseStageCompositionPreview | null {
  const stageDefinitions = Array.isArray(args.blendStages)
    ? args.blendStages
    : [];
  const stageIndex = stageDefinitions.findIndex(
    (stage) => stage.id === args.stageId,
  );
  if (stageIndex < 0) {
    return null;
  }

  const poseById = new Map(args.poses.map((pose) => [pose.id, pose]));
  const globalNeutral = buildGlobalNeutralRecord(
    args.standardInputs,
    args.neutralInputs,
  );

  const groups = resolveConfiguredGroups({
    poses: args.poses,
    poseGroups: args.poseGroups,
    defaultBlendMode: args.defaultGroupBlendMode,
  });
  const groupEvaluations = new Map<string, GroupEvaluation>();
  groups.forEach((group) => {
    groupEvaluations.set(
      group.id,
      evaluateGroupTarget({
        standardInputs: args.standardInputs,
        poseById,
        poseWeights: args.poseWeights,
        group,
        globalNeutral,
      }),
    );
  });

  const stageLabelById = new Map<string, string>();
  stageDefinitions.forEach((stage, index) => {
    const label =
      typeof stage.name === "string" && stage.name.trim().length > 0
        ? stage.name.trim()
        : `Stage ${index + 1}`;
    stageLabelById.set(stage.id, label);
  });
  const groupLabelById = new Map<string, string>();
  groups.forEach((group) => {
    groupLabelById.set(group.id, group.label);
  });

  const stageNeutralById = new Map<string, ResolvedNeutralRecord>();
  const stageChannelsById = new Map<
    string,
    Map<
      StandardInputId,
      {
        signal: LayerSignal;
        contributions: PoseStageSourceContribution[];
      }
    >
  >();

  stageDefinitions.forEach((stage) => {
    const lowerNeutral =
      stage.sources
        .map((source) => {
          if (source.kind === "group") {
            return groupEvaluations.get(source.id)?.neutral ?? null;
          }
          return stageNeutralById.get(source.id) ?? null;
        })
        .find((entry): entry is ResolvedNeutralRecord => entry !== null) ??
      globalNeutral;

    const stageNeutral = resolveScopedNeutralRecord({
      standardInputs: args.standardInputs,
      scopedNeutral: stage.neutral,
      lower: lowerNeutral,
      poseById,
    });
    stageNeutralById.set(stage.id, stageNeutral);

    const channelMap = new Map<
      StandardInputId,
      {
        signal: LayerSignal;
        contributions: PoseStageSourceContribution[];
      }
    >();

    args.standardInputs.forEach((input) => {
      const inputId = input.id as StandardInputId;
      const stageNeutralValue = stageNeutral.values[inputId] ?? 0;
      const sourceContributions = stage.sources
        .map((source): PoseStageSourceContribution | null => {
          const sourceSignal =
            source.kind === "group"
              ? (groupEvaluations.get(source.id)?.signalsByInputId.get(inputId)
                  ?.signal ?? null)
              : (stageChannelsById.get(source.id)?.get(inputId)?.signal ??
                null);
          if (!sourceSignal) {
            return null;
          }
          const delta = sourceSignal.value - stageNeutralValue;
          return {
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel:
              source.kind === "group"
                ? (groupLabelById.get(source.id) ?? source.id)
                : (stageLabelById.get(source.id) ?? source.id),
            value: sourceSignal.value,
            delta,
            activity: sourceSignal.activity,
            weightedDelta: delta * sourceSignal.activity,
          };
        })
        .filter(
          (contribution): contribution is PoseStageSourceContribution =>
            contribution !== null,
        );

      if (sourceContributions.length === 0) {
        return;
      }

      let signal: LayerSignal;
      if (sourceContributions.length === 1) {
        const [single] = sourceContributions;
        signal = {
          value: single.value,
          delta: single.delta,
          activity: single.activity,
        };
      } else if (stage.mode === "add") {
        const totalDelta = sourceContributions.reduce(
          (sum, contribution) => sum + contribution.delta,
          0,
        );
        signal = {
          value: stageNeutralValue + totalDelta,
          delta: totalDelta,
          activity: sourceContributions.reduce(
            (sum, contribution) => sum + contribution.activity,
            0,
          ),
        };
      } else {
        const weightedDeltaSum = sourceContributions.reduce(
          (sum, contribution) => sum + contribution.weightedDelta,
          0,
        );
        const totalActivity = sourceContributions.reduce(
          (sum, contribution) => sum + contribution.activity,
          0,
        );
        const maxActivity = sourceContributions.reduce(
          (max, contribution) => Math.max(max, contribution.activity),
          0,
        );
        const averagedDelta =
          computeNormalizedWeightedAverage(
            weightedDeltaSum,
            totalActivity,
            maxActivity,
          ) ?? 0;
        signal = {
          value: stageNeutralValue + averagedDelta,
          delta: averagedDelta,
          activity: maxActivity,
        };
      }

      channelMap.set(inputId, {
        signal,
        contributions: sourceContributions,
      });
    });

    stageChannelsById.set(stage.id, channelMap);
  });

  const selectedStage = stageDefinitions[stageIndex] ?? null;
  if (!selectedStage) {
    return null;
  }

  const stageNeutral = stageNeutralById.get(selectedStage.id) ?? globalNeutral;
  const stageChannels = stageChannelsById.get(selectedStage.id) ?? new Map();
  const explicitNeutralInputIds = collectScopedNeutralInputIds(
    selectedStage.neutral,
    poseById,
  );

  const channels: PoseStageCompositionChannel[] = [];
  args.standardInputs.forEach((input) => {
    const inputId = input.id as StandardInputId;
    const evaluated = stageChannels.get(inputId);
    const include = Boolean(evaluated) || explicitNeutralInputIds.has(inputId);
    if (!include) {
      return;
    }
    const signal = evaluated?.signal;
    const effectiveValue = signal?.value ?? stageNeutral.values[inputId] ?? 0;
    const neutralChannel = stageNeutral.channels[inputId];
    channels.push({
      inputId,
      label: input.label,
      path: input.path,
      effectiveValue,
      delta: signal?.delta ?? 0,
      activity: signal?.activity ?? 0,
      neutral: neutralChannel
        ? {
            value: neutralChannel.value,
            origin: neutralChannel.origin,
            detail: neutralChannel.detail,
          }
        : {
            value: stageNeutral.values[inputId] ?? 0,
            origin: "fallback",
            detail: stageNeutral.detail,
          },
      contributions: evaluated?.contributions ?? [],
    });
  });

  return {
    stageId: selectedStage.id,
    stageLabel: stageLabelById.get(selectedStage.id) ?? selectedStage.id,
    mode: selectedStage.mode,
    neutral: {
      sourceType: stageNeutral.sourceType,
      detail: stageNeutral.detail,
      lowerDetail: stageNeutral.lowerDetail,
    },
    channels,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampInputValue(input: StandardRigInput, value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const min = Number.isFinite(input.range.min) ? input.range.min : value;
  const max = Number.isFinite(input.range.max) ? input.range.max : value;
  return Math.max(min, Math.min(max, value));
}

function computeNormalizedWeightedAverage(
  weightedSum: number,
  totalWeight: number,
  maxEffectiveWeight: number,
): number | null {
  if (
    !Number.isFinite(weightedSum) ||
    !Number.isFinite(totalWeight) ||
    !Number.isFinite(maxEffectiveWeight) ||
    totalWeight <= 0 ||
    maxEffectiveWeight <= 0
  ) {
    return null;
  }
  const denominator = totalWeight / maxEffectiveWeight;
  if (Math.abs(denominator) <= Number.EPSILON) {
    return null;
  }
  return weightedSum / denominator;
}

function buildGlobalNeutralRecord(
  standardInputs: StandardRigInput[],
  neutralInputs: Record<StandardInputId, number>,
): ResolvedNeutralRecord {
  const values = Object.create(null) as Record<StandardInputId, number>;
  const channels = Object.create(null) as Record<
    StandardInputId,
    NeutralChannelDetail
  >;

  standardInputs.forEach((input) => {
    const inputId = input.id as StandardInputId;
    const hasExplicit = Number.isFinite(neutralInputs[inputId]);
    const fallback = Number.isFinite(input.defaultValue)
      ? input.defaultValue
      : 0;
    const value = clampInputValue(
      input,
      hasExplicit ? neutralInputs[inputId]! : fallback,
    );
    values[inputId] = value;
    channels[inputId] = {
      value,
      origin: hasExplicit ? "global" : "fallback",
      detail: hasExplicit ? "Global neutral" : "Input default fallback",
    };
  });

  return {
    sourceType: "global",
    detail: "Global neutral",
    lowerDetail: null,
    values,
    channels,
  };
}

function resolveScopedNeutralRecord(args: {
  standardInputs: StandardRigInput[];
  scopedNeutral: PoseScopedNeutralDefinition | undefined;
  lower: ResolvedNeutralRecord;
  poseById: Map<string, PoseDefinition>;
}): ResolvedNeutralRecord {
  const { standardInputs, scopedNeutral, lower, poseById } = args;
  if (!scopedNeutral || scopedNeutral.sourceType === "inherit") {
    const values = Object.create(null) as Record<StandardInputId, number>;
    const channels = Object.create(null) as Record<
      StandardInputId,
      NeutralChannelDetail
    >;
    standardInputs.forEach((input) => {
      const inputId = input.id as StandardInputId;
      const base = lower.channels[inputId];
      const value = clampInputValue(input, lower.values[inputId] ?? 0);
      values[inputId] = value;
      channels[inputId] = {
        value,
        origin: "inherit",
        detail: base ? `Inherit · ${base.detail}` : `Inherit · ${lower.detail}`,
      };
    });
    return {
      sourceType: "inherit",
      detail: `Inherit (${lower.detail})`,
      lowerDetail: lower.detail,
      values,
      channels,
    };
  }

  const poseReference =
    scopedNeutral.sourceType === "pose-reference"
      ? poseById.get(scopedNeutral.poseId)
      : null;
  const scopedDetail =
    scopedNeutral.sourceType === "pose-reference"
      ? poseReference
        ? `Pose reference: ${poseReference.name} (${poseReference.id})`
        : `Pose reference: ${scopedNeutral.poseId} (missing)`
      : "Direct values";

  const values = Object.create(null) as Record<StandardInputId, number>;
  const channels = Object.create(null) as Record<
    StandardInputId,
    NeutralChannelDetail
  >;

  standardInputs.forEach((input) => {
    const inputId = input.id as StandardInputId;
    const fallbackValue = clampInputValue(input, lower.values[inputId] ?? 0);
    const scopedValue =
      scopedNeutral.sourceType === "pose-reference"
        ? poseReference?.values[inputId]
        : scopedNeutral.values[inputId];

    if (Number.isFinite(scopedValue)) {
      const value = clampInputValue(input, scopedValue as number);
      values[inputId] = value;
      channels[inputId] = {
        value,
        origin: "scoped",
        detail: scopedDetail,
      };
      return;
    }

    const lowerChannel = lower.channels[inputId];
    values[inputId] = fallbackValue;
    channels[inputId] = {
      value: fallbackValue,
      origin: "fallback",
      detail: lowerChannel
        ? `Fallback · ${lowerChannel.detail}`
        : `Fallback · ${lower.detail}`,
    };
  });

  return {
    sourceType: scopedNeutral.sourceType,
    detail: scopedDetail,
    lowerDetail: lower.detail,
    values,
    channels,
  };
}

function collectScopedNeutralInputIds(
  scopedNeutral: PoseScopedNeutralDefinition | undefined,
  poseById: Map<string, PoseDefinition>,
): Set<StandardInputId> {
  if (!scopedNeutral || scopedNeutral.sourceType === "inherit") {
    return new Set();
  }
  if (scopedNeutral.sourceType === "pose-reference") {
    const pose = poseById.get(scopedNeutral.poseId);
    if (!pose) {
      return new Set();
    }
    return new Set(
      Object.entries(pose.values)
        .filter(([, value]) => Number.isFinite(value))
        .map(([inputId]) => inputId as StandardInputId),
    );
  }
  return new Set(
    Object.entries(scopedNeutral.values)
      .filter(([, value]) => Number.isFinite(value))
      .map(([inputId]) => inputId as StandardInputId),
  );
}

interface GroupEvaluation {
  neutral: ResolvedNeutralRecord;
  channels: PoseGroupCompositionChannel[];
  signalsByInputId: Map<
    StandardInputId,
    {
      signal: LayerSignal | null;
      hasAuthored: boolean;
    }
  >;
}

function evaluateGroupTarget(args: {
  standardInputs: StandardRigInput[];
  poseById: Map<string, PoseDefinition>;
  poseWeights: Record<string, number>;
  group: PoseGroupPreviewTarget;
  globalNeutral: ResolvedNeutralRecord;
}): GroupEvaluation {
  const { standardInputs, poseById, poseWeights, group, globalNeutral } = args;
  const neutral = resolveScopedNeutralRecord({
    standardInputs,
    scopedNeutral: group.neutral,
    lower: globalNeutral,
    poseById,
  });
  const explicitNeutralInputIds = collectScopedNeutralInputIds(
    group.neutral,
    poseById,
  );

  const channels: PoseGroupCompositionChannel[] = [];
  const signalsByInputId = new Map<
    StandardInputId,
    {
      signal: LayerSignal | null;
      hasAuthored: boolean;
    }
  >();

  standardInputs.forEach((input) => {
    const inputId = input.id as StandardInputId;
    const neutralValue = neutral.values[inputId] ?? 0;
    const contributions: PoseGroupCompositionContribution[] = group.poseIds.map(
      (poseId) => {
        const pose = poseById.get(poseId);
        const rawValue = pose?.values[inputId];
        const hasAuthoredValue = Number.isFinite(rawValue);
        const value = hasAuthoredValue
          ? clampInputValue(input, rawValue as number)
          : neutralValue;
        const delta = value - neutralValue;
        const hasDelta = Math.abs(delta) >= DELTA_EPSILON;
        const weight = clamp01(poseWeights[poseId] ?? 0);
        const activity = hasDelta ? weight : 0;
        return {
          poseId,
          poseName: pose?.name ?? poseId,
          weight,
          value,
          delta,
          activity,
          weightedDelta: delta * activity,
          hasAuthoredValue,
        };
      },
    );

    const weightedDeltaSum = contributions.reduce(
      (sum, contribution) => sum + contribution.weightedDelta,
      0,
    );
    const totalActivity = contributions.reduce(
      (sum, contribution) => sum + contribution.activity,
      0,
    );
    const maxActivity = contributions.reduce(
      (max, contribution) => Math.max(max, contribution.activity),
      0,
    );
    const hasDeltaPotential = contributions.some(
      (contribution) => Math.abs(contribution.delta) >= DELTA_EPSILON,
    );
    const hasAuthored = contributions.some(
      (contribution) => contribution.hasAuthoredValue,
    );

    let effectiveValue = neutralValue;
    if (group.blendMode === "additive") {
      effectiveValue = neutralValue + weightedDeltaSum;
    } else {
      const averagedDelta =
        computeNormalizedWeightedAverage(
          weightedDeltaSum,
          totalActivity,
          maxActivity,
        ) ?? 0;
      effectiveValue = neutralValue + averagedDelta;
    }

    const signal = hasDeltaPotential
      ? {
          value: effectiveValue,
          delta: effectiveValue - neutralValue,
          activity: maxActivity,
        }
      : null;

    signalsByInputId.set(inputId, {
      signal,
      hasAuthored,
    });

    const include =
      hasDeltaPotential || hasAuthored || explicitNeutralInputIds.has(inputId);
    if (!include) {
      return;
    }

    const neutralChannel = neutral.channels[inputId];
    channels.push({
      inputId,
      label: input.label,
      path: input.path,
      effectiveValue,
      delta: effectiveValue - neutralValue,
      neutral: neutralChannel
        ? {
            value: neutralChannel.value,
            origin: neutralChannel.origin,
            detail: neutralChannel.detail,
          }
        : {
            value: neutralValue,
            origin: "fallback",
            detail: neutral.detail,
          },
      totalActivity,
      maxActivity,
      weightedDeltaSum,
      contributions,
    });
  });

  return {
    neutral,
    channels,
    signalsByInputId,
  };
}

function resolveConfiguredGroups(args: {
  poses: PoseDefinition[];
  poseGroups: PoseGroupDefinition[] | undefined;
  defaultBlendMode: PoseBlendMode;
}): PoseGroupPreviewTarget[] {
  const configured = Array.isArray(args.poseGroups) ? args.poseGroups : [];
  const groups: PoseGroupPreviewTarget[] = [];
  configured.forEach((group) => {
    const groupId = group.id?.trim();
    if (!groupId) {
      return;
    }
    const label =
      group.path?.trim() || group.name?.trim() || groupId || "Unnamed Group";
    groups.push({
      id: groupId,
      label,
      blendMode:
        group.blendMode === "additive" || group.blendMode === "average"
          ? group.blendMode
          : args.defaultBlendMode,
      neutral: group.neutral,
      poseIds: [],
    });
  });

  const groupById = new Map(groups.map((group) => [group.id, group]));
  args.poses.forEach((pose) => {
    const membership = resolvePoseMembership(pose, configured);
    membership.groupIds.forEach((groupId) => {
      const target = groupById.get(groupId);
      if (!target) {
        return;
      }
      if (!target.poseIds.includes(pose.id)) {
        target.poseIds.push(pose.id);
      }
    });
  });

  return groups;
}

function convertNeutralChannels(
  channels: Record<StandardInputId, NeutralChannelDetail>,
): Record<StandardInputId, PoseCompositionNeutralChannelSummary> {
  const next = Object.create(null) as Record<
    StandardInputId,
    PoseCompositionNeutralChannelSummary
  >;
  Object.entries(channels).forEach(([inputId, detail]) => {
    next[inputId as StandardInputId] = {
      value: detail.value,
      origin: detail.origin,
      detail: detail.detail,
    };
  });
  return next;
}

import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import {
  buildPoseControlRelativePath,
  buildPoseWeightPathMap,
  buildRigInputPath,
  createNeutralInputs,
} from "./utils";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "./groupMembership";
import type {
  PoseBlendMode,
  PoseCrossGroupChannelOverride,
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrBlendStageDefinition,
  PoseRigIrFile,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
} from "./types";

type EdgeSpec = NonNullable<GraphSpec["edges"]>[number];

function buildRecordValue(fields: Record<string, number>): any {
  const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  return {
    record: {
      values: {
        record: Object.fromEntries(
          entries.map(([key, value]) => [key, { float: value }]),
        ),
      },
    },
  };
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function getNeutralValue(
  input: StandardRigInput,
  neutralInputs: Record<StandardInputId, number>,
): number {
  const stored = neutralInputs[input.id];
  if (stored !== undefined) {
    return stored;
  }
  const fallback = Number.isFinite(input.defaultValue) ? input.defaultValue : 0;
  return fallback;
}

function clampValueForInput(input: StandardRigInput, value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const { min, max } = input.range;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function createPoseInputNode(pose: PoseDefinition, path: string): NodeSpec {
  return {
    id: `pose_${sanitizeId(pose.id)}`,
    type: "input",
    params: {
      path,
      value: { float: 0 },
    },
  };
}

interface ResolvedPoseGroup {
  id: string;
  path: string;
  name: string;
  blendMode: PoseBlendMode;
  poseIds: string[];
}

interface BlendSignalRef {
  nodeId: string;
  output?: string;
}

interface BlendSignalLayer {
  valueNodeId: string;
  deltaNodeId: string;
  activity: BlendSignalRef;
}

function resolvePoseGroups(
  poses: PoseDefinition[],
  poseGroups: PoseGroupDefinition[] | undefined,
  defaultGroupBlendMode: PoseBlendMode,
): ResolvedPoseGroup[] {
  const groups: ResolvedPoseGroup[] = [];
  const byId = new Map<string, ResolvedPoseGroup>();
  const byPath = new Map<string, ResolvedPoseGroup>();

  (poseGroups ?? []).forEach((group) => {
    if (!group || typeof group !== "object") {
      return;
    }
    const path =
      normalizePoseGroupPath(group.path ?? group.name ?? group.id) ?? "default";
    if (byPath.has(path)) {
      return;
    }
    const id = sanitizePoseGroupId(group.id, path);
    const normalized: ResolvedPoseGroup = {
      id,
      path,
      name:
        typeof group.name === "string" && group.name.trim().length > 0
          ? group.name.trim()
          : humanizePoseGroupName(path),
      blendMode:
        group.blendMode === "additive" || group.blendMode === "average"
          ? group.blendMode
          : defaultGroupBlendMode,
      poseIds: [],
    };
    groups.push(normalized);
    byPath.set(path, normalized);
    byId.set(id, normalized);
  });

  poses.forEach((pose) => {
    const membership = resolvePoseMembership(pose, groups);
    const membershipIds =
      membership.groupIds.length > 0
        ? membership.groupIds
        : [sanitizePoseGroupId(null, "default")];

    membershipIds.forEach((groupId) => {
      const resolvedPath = membership.groupPathsById[groupId] ?? null;
      const path = resolvedPath ?? normalizePoseGroupPath(groupId) ?? "default";
      const normalizedId = sanitizePoseGroupId(groupId, path);
      const existing = byId.get(normalizedId) ?? byPath.get(path);
      if (existing) {
        if (!existing.poseIds.includes(pose.id)) {
          existing.poseIds.push(pose.id);
        }
        if (!byId.has(existing.id)) {
          byId.set(existing.id, existing);
        }
        if (!byPath.has(existing.path)) {
          byPath.set(existing.path, existing);
        }
        return;
      }
      const normalized: ResolvedPoseGroup = {
        id: normalizedId,
        path,
        name: humanizePoseGroupName(path),
        blendMode: defaultGroupBlendMode,
        poseIds: [pose.id],
      };
      groups.push(normalized);
      byPath.set(path, normalized);
      byId.set(normalized.id, normalized);
    });
  });

  return groups.filter((group) => group.poseIds.length > 0);
}

function normalizeBlendStagesForCompile(
  blendStages: unknown,
  orderedGroupIds: string[],
): PoseIrBlendStageDefinition[] | undefined {
  if (!Array.isArray(blendStages) || blendStages.length === 0) {
    return undefined;
  }

  const knownGroupIds = new Set(orderedGroupIds);
  const knownStageIds = new Set<string>();
  const normalizedStages: PoseIrBlendStageDefinition[] = [];

  blendStages.forEach((stage) => {
    if (!stage || typeof stage !== "object") {
      return;
    }
    const stageId = typeof stage.id === "string" ? stage.id.trim() : "";
    if (!stageId || knownStageIds.has(stageId)) {
      return;
    }
    const stageMode = stage.mode === "add" || stage.mode === "average";
    if (!stageMode) {
      return;
    }
    const stageSources = Array.isArray(stage.sources) ? stage.sources : [];
    const seenSourceKeys = new Set<string>();
    const sources = stageSources
      .map((source: any) => {
        if (!source || typeof source !== "object") {
          return null;
        }
        const sourceKind = source.kind;
        const sourceId = typeof source.id === "string" ? source.id.trim() : "";
        if (!sourceId) {
          return null;
        }
        if (sourceKind === "group") {
          if (!knownGroupIds.has(sourceId)) {
            return null;
          }
        } else if (sourceKind === "stage") {
          if (sourceId === stageId || !knownStageIds.has(sourceId)) {
            return null;
          }
        } else {
          return null;
        }
        const sourceKey = `${sourceKind}:${sourceId}`;
        if (seenSourceKeys.has(sourceKey)) {
          return null;
        }
        seenSourceKeys.add(sourceKey);
        return {
          kind: sourceKind,
          id: sourceId,
        };
      })
      .filter(
        (source: any): source is { kind: "group" | "stage"; id: string } =>
          source !== null,
      );

    if (sources.length === 0) {
      return;
    }

    normalizedStages.push({
      id: stageId,
      name:
        typeof stage.name === "string" && stage.name.trim().length > 0
          ? stage.name.trim()
          : undefined,
      mode: stage.mode,
      sources,
    });
    knownStageIds.add(stageId);
  });

  if (normalizedStages.length === 0) {
    return undefined;
  }
  return normalizedStages;
}

function normalizeCrossGroupChannelOverridesForCompile(
  overrides: unknown,
  orderedGroupIds: string[],
  fallbackMode: PoseBlendMode,
): Record<string, PoseCrossGroupChannelOverride> | undefined {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return undefined;
  }
  const knownGroupIds = new Set(orderedGroupIds);
  const normalizedEntries = new Map<string, PoseCrossGroupChannelOverride>();
  Object.entries(overrides as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([rawInputId, override]) => {
      const inputId = rawInputId.trim();
      if (!inputId) {
        return;
      }
      if (
        !override ||
        typeof override !== "object" ||
        Array.isArray(override)
      ) {
        return;
      }
      const modeCandidate = (override as { mode?: unknown }).mode;
      const mode: PoseCrossGroupChannelOverride["mode"] =
        modeCandidate === "priority"
          ? "priority"
          : modeCandidate === "additive" || modeCandidate === "add"
            ? "additive"
            : modeCandidate === "average"
              ? "average"
              : fallbackMode;
      const tieBreak =
        (override as { tieBreak?: unknown }).tieBreak === "group-id"
          ? "group-id"
          : "group-order";
      const priorityOrderCandidate = (override as { priorityOrder?: unknown })
        .priorityOrder;
      let priorityOrder: string[] | undefined;
      if (Array.isArray(priorityOrderCandidate)) {
        const seenGroups = new Set<string>();
        const normalizedPriorityOrder: string[] = [];
        priorityOrderCandidate.forEach((groupId) => {
          if (typeof groupId !== "string" || groupId.trim().length === 0) {
            return;
          }
          const trimmedGroupId = groupId.trim();
          if (!knownGroupIds.has(trimmedGroupId)) {
            return;
          }
          if (seenGroups.has(trimmedGroupId)) {
            return;
          }
          seenGroups.add(trimmedGroupId);
          normalizedPriorityOrder.push(trimmedGroupId);
        });
        if (normalizedPriorityOrder.length > 0) {
          priorityOrder = normalizedPriorityOrder;
        }
      }
      if (mode !== "priority") {
        priorityOrder = undefined;
      }
      normalizedEntries.set(inputId, {
        mode,
        tieBreak,
        ...(priorityOrder ? { priorityOrder } : {}),
      });
    });
  if (normalizedEntries.size === 0) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries);
}

interface OrderedPriorityLayer {
  groupId: string;
  order: number;
  layer: BlendSignalLayer;
}

function orderPriorityLayersForCompile(options: {
  layersByGroupId: Map<string, BlendSignalLayer>;
  activeGroupOrderById: Map<string, number>;
  override: PoseCrossGroupChannelOverride;
}): OrderedPriorityLayer[] {
  const { layersByGroupId, activeGroupOrderById, override } = options;
  const explicitPriorityOrder = new Map<string, number>(
    (override.priorityOrder ?? []).map((groupId, index) => [groupId, index]),
  );

  return Array.from(layersByGroupId.entries())
    .map(([groupId, layer]) => ({
      groupId,
      order: activeGroupOrderById.get(groupId) ?? Number.MAX_SAFE_INTEGER,
      layer,
    }))
    .sort((left, right) => {
      const leftPriority =
        explicitPriorityOrder.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority =
        explicitPriorityOrder.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (override.tieBreak === "group-id") {
        return left.groupId.localeCompare(right.groupId);
      }
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.groupId.localeCompare(right.groupId);
    });
}

function pushEdgeFromSignalRef(
  edges: EdgeSpec[],
  from: BlendSignalRef,
  to: { nodeId: string; input: string },
): void {
  edges.push({
    from: from.output
      ? { node_id: from.nodeId, output: from.output }
      : { node_id: from.nodeId },
    to: { node_id: to.nodeId, input: to.input },
  });
}

function buildAddStageSignal(options: {
  nodePrefix: string;
  sources: BlendSignalLayer[];
  neutralNodeId: string;
  inputId: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}): BlendSignalLayer {
  const { nodePrefix, sources, neutralNodeId, inputId, nodes, edges } = options;
  let runningDeltaRef: BlendSignalRef = { nodeId: sources[0].deltaNodeId };
  sources.slice(1).forEach((source, index) => {
    const addNodeId = `${nodePrefix}_delta_add_${index + 2}`;
    nodes.push({
      id: addNodeId,
      type: "add",
    });
    edges.push(
      {
        from: { node_id: runningDeltaRef.nodeId },
        to: { node_id: addNodeId, input: "a" },
      },
      {
        from: { node_id: source.deltaNodeId },
        to: { node_id: addNodeId, input: "b" },
      },
    );
    runningDeltaRef = { nodeId: addNodeId };
  });

  let runningActivityRef: BlendSignalRef = sources[0].activity;
  sources.slice(1).forEach((source, index) => {
    const addNodeId = `${nodePrefix}_activity_add_${index + 2}`;
    nodes.push({
      id: addNodeId,
      type: "add",
    });
    pushEdgeFromSignalRef(edges, runningActivityRef, {
      nodeId: addNodeId,
      input: "a",
    });
    pushEdgeFromSignalRef(edges, source.activity, {
      nodeId: addNodeId,
      input: "b",
    });
    runningActivityRef = { nodeId: addNodeId };
  });

  const applyNodeId = `${nodePrefix}_apply`;
  nodes.push({
    id: applyNodeId,
    type: "add",
  });
  edges.push(
    {
      from: { node_id: runningDeltaRef.nodeId },
      to: { node_id: applyNodeId, input: "a" },
    },
    {
      from: { node_id: neutralNodeId },
      to: { node_id: applyNodeId, input: "b" },
      selector: [{ field: "values" }, { field: inputId }],
    },
  );

  return {
    valueNodeId: applyNodeId,
    deltaNodeId: runningDeltaRef.nodeId,
    activity: runningActivityRef,
  };
}

function buildAverageStageSignal(options: {
  nodePrefix: string;
  sources: BlendSignalLayer[];
  neutralNodeId: string;
  inputId: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}): BlendSignalLayer {
  const { nodePrefix, sources, neutralNodeId, inputId, nodes, edges } = options;
  const valuesJoinNodeId = `${nodePrefix}_values_join`;
  const weightsJoinNodeId = `${nodePrefix}_weights_join`;
  const maskNodeId = `${nodePrefix}_mask`;
  const wsNodeId = `${nodePrefix}_ws`;
  const overlayNodeId = `${nodePrefix}_overlay`;
  const deltaNodeId = `${nodePrefix}_delta`;

  nodes.push({
    id: valuesJoinNodeId,
    type: "join",
  });
  nodes.push({
    id: weightsJoinNodeId,
    type: "join",
  });
  nodes.push({
    id: maskNodeId,
    type: "constant",
    params: {
      value: { vector: sources.map(() => 1) },
    },
  });
  nodes.push({
    id: wsNodeId,
    type: "weightedsumvector",
  });
  nodes.push({
    id: overlayNodeId,
    type: "blendweightedaverageoverlay",
  });
  nodes.push({
    id: deltaNodeId,
    type: "subtract",
  });

  sources.forEach((source, index) => {
    edges.push({
      from: { node_id: source.deltaNodeId },
      to: { node_id: valuesJoinNodeId, input: `operand_${index + 1}` },
    });
    pushEdgeFromSignalRef(edges, source.activity, {
      nodeId: weightsJoinNodeId,
      input: `operand_${index + 1}`,
    });
  });

  edges.push(
    {
      from: { node_id: valuesJoinNodeId },
      to: { node_id: wsNodeId, input: "values" },
    },
    {
      from: { node_id: weightsJoinNodeId },
      to: { node_id: wsNodeId, input: "weights" },
    },
    {
      from: { node_id: maskNodeId },
      to: { node_id: wsNodeId, input: "masks" },
    },
    {
      from: { node_id: wsNodeId, output: "total_weighted_sum" },
      to: { node_id: overlayNodeId, input: "total_weighted_sum" },
    },
    {
      from: { node_id: wsNodeId, output: "total_weight" },
      to: { node_id: overlayNodeId, input: "total_weight" },
    },
    {
      from: { node_id: wsNodeId, output: "max_effective_weight" },
      to: { node_id: overlayNodeId, input: "max_effective_weight" },
    },
    {
      from: { node_id: neutralNodeId },
      to: { node_id: overlayNodeId, input: "base" },
      selector: [{ field: "values" }, { field: inputId }],
    },
    {
      from: { node_id: overlayNodeId },
      to: { node_id: deltaNodeId, input: "lhs" },
    },
    {
      from: { node_id: neutralNodeId },
      to: { node_id: deltaNodeId, input: "rhs" },
      selector: [{ field: "values" }, { field: inputId }],
    },
  );

  return {
    valueNodeId: overlayNodeId,
    deltaNodeId,
    activity: {
      nodeId: wsNodeId,
      output: "max_effective_weight",
    },
  };
}

function buildPriorityCrossGroupSignal(options: {
  nodePrefix: string;
  orderedLayers: OrderedPriorityLayer[];
  neutralNodeId: string;
  inputId: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}): BlendSignalLayer | null {
  const { nodePrefix, orderedLayers, neutralNodeId, inputId, nodes, edges } =
    options;
  if (orderedLayers.length === 0) {
    return null;
  }
  if (orderedLayers.length === 1) {
    return orderedLayers[0].layer;
  }

  let runningSignal = orderedLayers[orderedLayers.length - 1]!.layer;
  for (let index = orderedLayers.length - 2; index >= 0; index -= 1) {
    const prioritized = orderedLayers[index]!;
    const step = orderedLayers.length - index;
    const stepPrefix = `${nodePrefix}_${step}_${sanitizeId(prioritized.groupId)}`;
    const deltaFromBaseNodeId = `${stepPrefix}_delta_from_base`;
    const valuesJoinNodeId = `${stepPrefix}_values_join`;
    const weightsJoinNodeId = `${stepPrefix}_weights_join`;
    const maskNodeId = `${stepPrefix}_mask`;
    const wsNodeId = `${stepPrefix}_ws`;
    const overlayNodeId = `${stepPrefix}_overlay`;
    const deltaFromNeutralNodeId = `${stepPrefix}_delta`;

    nodes.push(
      {
        id: deltaFromBaseNodeId,
        type: "subtract",
      },
      {
        id: valuesJoinNodeId,
        type: "join",
      },
      {
        id: weightsJoinNodeId,
        type: "join",
      },
      {
        id: maskNodeId,
        type: "constant",
        params: {
          value: { vector: [1] },
        },
      },
      {
        id: wsNodeId,
        type: "weightedsumvector",
      },
      {
        id: overlayNodeId,
        type: "blendweightedaverageoverlay",
      },
      {
        id: deltaFromNeutralNodeId,
        type: "subtract",
      },
    );

    edges.push(
      {
        from: { node_id: prioritized.layer.valueNodeId },
        to: { node_id: deltaFromBaseNodeId, input: "lhs" },
      },
      {
        from: { node_id: runningSignal.valueNodeId },
        to: { node_id: deltaFromBaseNodeId, input: "rhs" },
      },
      {
        from: { node_id: deltaFromBaseNodeId },
        to: { node_id: valuesJoinNodeId, input: "operand_1" },
      },
    );
    pushEdgeFromSignalRef(edges, prioritized.layer.activity, {
      nodeId: weightsJoinNodeId,
      input: "operand_1",
    });

    edges.push(
      {
        from: { node_id: valuesJoinNodeId },
        to: { node_id: wsNodeId, input: "values" },
      },
      {
        from: { node_id: weightsJoinNodeId },
        to: { node_id: wsNodeId, input: "weights" },
      },
      {
        from: { node_id: maskNodeId },
        to: { node_id: wsNodeId, input: "masks" },
      },
      {
        from: { node_id: wsNodeId, output: "total_weighted_sum" },
        to: { node_id: overlayNodeId, input: "total_weighted_sum" },
      },
      {
        from: { node_id: wsNodeId, output: "total_weight" },
        to: { node_id: overlayNodeId, input: "total_weight" },
      },
      {
        from: { node_id: wsNodeId, output: "max_effective_weight" },
        to: { node_id: overlayNodeId, input: "max_effective_weight" },
      },
      {
        from: { node_id: runningSignal.valueNodeId },
        to: { node_id: overlayNodeId, input: "base" },
      },
      {
        from: { node_id: overlayNodeId },
        to: { node_id: deltaFromNeutralNodeId, input: "lhs" },
      },
      {
        from: { node_id: neutralNodeId },
        to: { node_id: deltaFromNeutralNodeId, input: "rhs" },
        selector: [{ field: "values" }, { field: inputId }],
      },
    );

    runningSignal = {
      valueNodeId: overlayNodeId,
      deltaNodeId: deltaFromNeutralNodeId,
      activity: prioritized.layer.activity,
    };
  }

  return runningSignal;
}

function buildBlendStageChain(options: {
  blendStages: PoseIrBlendStageDefinition[];
  inputId: string;
  neutralNodeId: string;
  activeGroupLayersById: Map<string, BlendSignalLayer>;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
}): BlendSignalLayer | null {
  const {
    blendStages,
    inputId,
    neutralNodeId,
    activeGroupLayersById,
    nodes,
    edges,
  } = options;
  if (blendStages.length === 0) {
    return null;
  }

  const stageSignalsById = new Map<string, BlendSignalLayer>();
  let lastStageSignal: BlendSignalLayer | null = null;

  blendStages.forEach((stage, stageIndex) => {
    const sources = stage.sources
      .map((source) =>
        source.kind === "group"
          ? (activeGroupLayersById.get(source.id) ?? null)
          : (stageSignalsById.get(source.id) ?? null),
      )
      .filter((source): source is BlendSignalLayer => source !== null);

    if (sources.length === 0) {
      return;
    }
    const stagePrefix = `pose_stage_${sanitizeId(inputId)}_${stageIndex + 1}_${sanitizeId(stage.id)}`;

    let stageSignal: BlendSignalLayer;
    if (sources.length === 1) {
      stageSignal = sources[0];
    } else if (stage.mode === "add") {
      stageSignal = buildAddStageSignal({
        nodePrefix: stagePrefix,
        sources,
        neutralNodeId,
        inputId,
        nodes,
        edges,
      });
    } else {
      stageSignal = buildAverageStageSignal({
        nodePrefix: stagePrefix,
        sources,
        neutralNodeId,
        inputId,
        nodes,
        edges,
      });
    }

    stageSignalsById.set(stage.id, stageSignal);
    lastStageSignal = stageSignal;
  });

  return lastStageSignal;
}

export function buildPoseGraphSpec(options: {
  faceId: string | null;
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  standardInputs: StandardRigInput[];
  poseGroups?: PoseGroupDefinition[];
  defaultGroupBlendMode?: PoseBlendMode;
  crossGroupBlendMode?: PoseBlendMode;
  crossGroupChannelOverrides?: unknown;
  blendStages?: PoseIrBlendStageDefinition[];
  blendMode?: "average" | "additive";
  rigKind?: "generic" | "face-specific";
}): { spec: GraphSpec; summary: PoseRigGraphSummary } {
  const { faceId, neutralInputs, poses, standardInputs } = options;
  const defaultGroupBlendMode =
    options.defaultGroupBlendMode ?? options.blendMode ?? "average";
  const crossGroupBlendMode = options.crossGroupBlendMode ?? "additive";
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  const trimmedFaceId = faceId?.trim();
  const faceSegment =
    options.rigKind === "generic"
      ? "standard"
      : trimmedFaceId && trimmedFaceId.length > 0
        ? trimmedFaceId
        : "face";

  const poseWeightPathMap = buildPoseWeightPathMap(poses, faceId);
  const poseInputs = new Map<string, string>();
  const allowedPoseInputPaths = new Set<string>();
  const resolvedGroups = resolvePoseGroups(
    poses,
    options.poseGroups,
    defaultGroupBlendMode,
  );
  const blendStages = normalizeBlendStagesForCompile(
    options.blendStages,
    resolvedGroups.map((group) => group.id),
  );
  const crossGroupChannelOverrides =
    normalizeCrossGroupChannelOverridesForCompile(
      options.crossGroupChannelOverrides,
      resolvedGroups.map((group) => group.id),
      crossGroupBlendMode,
    );
  const poseById = new Map(poses.map((pose) => [pose.id, pose]));

  poses.forEach((pose) => {
    const recordFields: Record<string, number> = {};
    standardInputs.forEach((input) => {
      const value = clampValueForInput(
        input,
        pose.values[input.id] ?? neutralInputs[input.id] ?? 0,
      );
      recordFields[input.id] = value;
    });
    const nodeId = `pose_record_${sanitizeId(pose.id)}`;
    nodes.push({
      id: nodeId,
      type: "constant",
      params: {
        value: buildRecordValue(recordFields),
      },
    });

    const poseWeightPath =
      poseWeightPathMap.get(pose.id)?.absolutePath ??
      buildRigInputPath(faceSegment, `/poses/${sanitizeId(pose.id)}.weight`);
    allowedPoseInputPaths.add(poseWeightPath);
    const inputNode = createPoseInputNode(pose, poseWeightPath);
    nodes.push(inputNode);
    poseInputs.set(pose.id, inputNode.id);
  });

  const groupWeightJoinIds = new Map<string, string>();
  resolvedGroups.forEach((group, groupIndex) => {
    const weightsJoinId = `pose_weights_group_${groupIndex + 1}_${sanitizeId(group.id)}`;
    nodes.push({
      id: weightsJoinId,
      type: "join",
    });
    group.poseIds.forEach((poseId, index) => {
      const poseInputNodeId = poseInputs.get(poseId);
      if (!poseInputNodeId) {
        return;
      }
      edges.push({
        from: { node_id: poseInputNodeId },
        to: { node_id: weightsJoinId, input: `operand_${index + 1}` },
      });
    });
    groupWeightJoinIds.set(group.id, weightsJoinId);
  });

  const neutralRecordFields: Record<string, number> = {};
  standardInputs.forEach((input) => {
    const value = clampValueForInput(
      input,
      getNeutralValue(input, neutralInputs),
    );
    neutralRecordFields[input.id] = value;
  });

  const neutralNodeId = "pose_neutral_record";
  nodes.push({
    id: neutralNodeId,
    type: "constant",
    params: {
      value: buildRecordValue(neutralRecordFields),
    },
  });

  const summary: PoseRigGraphSummary = {
    inputs: [],
    outputs: [],
  };

  standardInputs.forEach((input) => {
    const seenGroupSignals = new Set<string>();
    const neutral = getNeutralValue(input, neutralInputs);
    const neutralValue = clampValueForInput(input, neutral);

    const contributions: PoseRigGraphSummary["inputs"][number]["contributions"] =
      [];

    const activeGroupLayers: BlendSignalLayer[] = [];
    const activeGroupLayersById = new Map<string, BlendSignalLayer>();
    const activeGroupOrderById = new Map<string, number>();

    resolvedGroups.forEach((group, groupIndex) => {
      const deltas: number[] = [];
      const masks: number[] = [];
      let hasContribution = false;

      group.poseIds.forEach((poseId) => {
        const pose = poseById.get(poseId);
        if (!pose) {
          return;
        }
        const poseValueRaw = pose.values[input.id];
        const poseValue = clampValueForInput(
          input,
          poseValueRaw === undefined ? neutralValue : poseValueRaw,
        );
        const delta = poseValue - neutralValue;
        const isActive = Math.abs(delta) >= 1e-6;
        deltas.push(delta);
        masks.push(isActive ? 1 : 0);
        if (isActive) {
          hasContribution = true;
          contributions.push({
            poseId: pose.id,
            poseName: pose.name,
            value: poseValue,
            delta,
          });
        }
      });

      if (!hasContribution || deltas.length === 0) {
        return;
      }

      const groupSignalKey = `${group.id}:${input.id}`;
      if (seenGroupSignals.has(groupSignalKey)) {
        throw new Error(
          `Duplicate pose-group signal generated for group "${group.id}" and input "${input.id}".`,
        );
      }
      seenGroupSignals.add(groupSignalKey);

      const groupSuffix = `${sanitizeId(input.id)}_${groupIndex + 1}_${sanitizeId(group.id)}`;
      const deltaNodeId = `pose_group_delta_values_${groupSuffix}`;
      nodes.push({
        id: deltaNodeId,
        type: "constant",
        params: {
          value: { vector: deltas },
        },
      });

      const maskNodeId = `pose_group_mask_${groupSuffix}`;
      nodes.push({
        id: maskNodeId,
        type: "constant",
        params: {
          value: { vector: masks },
        },
      });

      const wsNodeId = `pose_group_ws_${groupSuffix}`;
      nodes.push({
        id: wsNodeId,
        type: "weightedsumvector",
      });

      edges.push(
        {
          from: { node_id: deltaNodeId },
          to: { node_id: wsNodeId, input: "values" },
        },
        {
          from: { node_id: maskNodeId },
          to: { node_id: wsNodeId, input: "masks" },
        },
      );
      const groupWeightsJoinId = groupWeightJoinIds.get(group.id);
      if (groupWeightsJoinId) {
        edges.push({
          from: { node_id: groupWeightsJoinId },
          to: { node_id: wsNodeId, input: "weights" },
        });
      }

      if (group.blendMode === "additive") {
        const addNodeId = `pose_group_add_${groupSuffix}`;
        nodes.push({
          id: addNodeId,
          type: "add",
        });
        edges.push(
          {
            from: { node_id: wsNodeId, output: "total_weighted_sum" },
            to: { node_id: addNodeId, input: "a" },
          },
          {
            from: { node_id: neutralNodeId },
            to: { node_id: addNodeId, input: "b" },
            selector: [{ field: "values" }, { field: input.id }],
          },
        );

        const deltaFromNeutralNodeId = `pose_group_delta_${groupSuffix}`;
        nodes.push({
          id: deltaFromNeutralNodeId,
          type: "subtract",
        });
        edges.push(
          {
            from: { node_id: addNodeId },
            to: { node_id: deltaFromNeutralNodeId, input: "lhs" },
          },
          {
            from: { node_id: neutralNodeId },
            to: { node_id: deltaFromNeutralNodeId, input: "rhs" },
            selector: [{ field: "values" }, { field: input.id }],
          },
        );

        const layer: BlendSignalLayer = {
          valueNodeId: addNodeId,
          deltaNodeId: deltaFromNeutralNodeId,
          activity: {
            nodeId: wsNodeId,
            output: "max_effective_weight",
          },
        };
        activeGroupLayers.push(layer);
        activeGroupLayersById.set(group.id, layer);
        activeGroupOrderById.set(group.id, groupIndex);
      } else {
        const overlayNodeId = `pose_group_overlay_${groupSuffix}`;
        nodes.push({
          id: overlayNodeId,
          type: "blendweightedaverageoverlay",
        });
        edges.push(
          {
            from: { node_id: wsNodeId, output: "total_weighted_sum" },
            to: { node_id: overlayNodeId, input: "total_weighted_sum" },
          },
          {
            from: { node_id: wsNodeId, output: "total_weight" },
            to: { node_id: overlayNodeId, input: "total_weight" },
          },
          {
            from: { node_id: wsNodeId, output: "max_effective_weight" },
            to: { node_id: overlayNodeId, input: "max_effective_weight" },
          },
          {
            from: { node_id: neutralNodeId },
            to: { node_id: overlayNodeId, input: "base" },
            selector: [{ field: "values" }, { field: input.id }],
          },
        );

        const deltaFromNeutralNodeId = `pose_group_delta_${groupSuffix}`;
        nodes.push({
          id: deltaFromNeutralNodeId,
          type: "subtract",
        });
        edges.push(
          {
            from: { node_id: overlayNodeId },
            to: { node_id: deltaFromNeutralNodeId, input: "lhs" },
          },
          {
            from: { node_id: neutralNodeId },
            to: { node_id: deltaFromNeutralNodeId, input: "rhs" },
            selector: [{ field: "values" }, { field: input.id }],
          },
        );

        const layer: BlendSignalLayer = {
          valueNodeId: overlayNodeId,
          deltaNodeId: deltaFromNeutralNodeId,
          activity: {
            nodeId: wsNodeId,
            output: "max_effective_weight",
          },
        };
        activeGroupLayers.push(layer);
        activeGroupLayersById.set(group.id, layer);
        activeGroupOrderById.set(group.id, groupIndex);
      }
    });

    if (contributions.length === 0) {
      return;
    }

    const typedPath = buildRigInputPath(
      faceSegment,
      buildPoseControlRelativePath(input.id),
    );
    const outputNodeId = `out_${sanitizeId(input.id)}`;
    const hasBlendStages = Boolean(blendStages && blendStages.length > 0);
    const crossGroupMode =
      crossGroupChannelOverrides?.[input.id]?.mode ?? crossGroupBlendMode;
    if (!hasBlendStages) {
      nodes.push({
        id: outputNodeId,
        type: "output",
        params: { path: typedPath },
      });
    }

    let finalSignal: BlendSignalLayer | null = null;
    if (hasBlendStages) {
      finalSignal = buildBlendStageChain({
        blendStages: blendStages!,
        inputId: input.id,
        neutralNodeId,
        activeGroupLayersById,
        nodes,
        edges,
      });
      if (!finalSignal) {
        return;
      }
    } else if (crossGroupMode === "priority") {
      const override = crossGroupChannelOverrides?.[input.id] ?? {
        mode: "priority",
        tieBreak: "group-order",
      };
      const orderedPriorityLayers = orderPriorityLayersForCompile({
        layersByGroupId: activeGroupLayersById,
        activeGroupOrderById,
        override,
      });
      finalSignal = buildPriorityCrossGroupSignal({
        nodePrefix: `pose_priority_${sanitizeId(input.id)}`,
        orderedLayers: orderedPriorityLayers,
        neutralNodeId,
        inputId: input.id,
        nodes,
        edges,
      });
      if (!finalSignal) {
        return;
      }
    } else if (activeGroupLayers.length === 1) {
      finalSignal = activeGroupLayers[0];
    } else if (crossGroupMode === "additive") {
      let runningDeltaNodeId = activeGroupLayers[0]?.deltaNodeId ?? null;
      activeGroupLayers.slice(1).forEach((layer, index) => {
        if (!runningDeltaNodeId) {
          runningDeltaNodeId = layer.deltaNodeId;
          return;
        }
        const addNodeId = `pose_cross_add_${sanitizeId(input.id)}_${index + 2}`;
        nodes.push({
          id: addNodeId,
          type: "add",
        });
        edges.push(
          {
            from: { node_id: runningDeltaNodeId },
            to: { node_id: addNodeId, input: "a" },
          },
          {
            from: { node_id: layer.deltaNodeId },
            to: { node_id: addNodeId, input: "b" },
          },
        );
        runningDeltaNodeId = addNodeId;
      });
      if (runningDeltaNodeId) {
        const addNeutralNodeId = `pose_cross_apply_${sanitizeId(input.id)}`;
        nodes.push({
          id: addNeutralNodeId,
          type: "add",
        });
        edges.push(
          {
            from: { node_id: runningDeltaNodeId },
            to: { node_id: addNeutralNodeId, input: "a" },
          },
          {
            from: { node_id: neutralNodeId },
            to: { node_id: addNeutralNodeId, input: "b" },
            selector: [{ field: "values" }, { field: input.id }],
          },
        );
        finalSignal = {
          valueNodeId: addNeutralNodeId,
          deltaNodeId: runningDeltaNodeId,
          activity: activeGroupLayers[0]?.activity ?? {
            nodeId: runningDeltaNodeId,
          },
        };
      }
    } else {
      const valuesJoinNodeId = `pose_cross_values_join_${sanitizeId(input.id)}`;
      const weightsJoinNodeId = `pose_cross_weights_join_${sanitizeId(input.id)}`;
      const maskNodeId = `pose_cross_mask_${sanitizeId(input.id)}`;
      const wsNodeId = `pose_cross_ws_${sanitizeId(input.id)}`;
      const overlayNodeId = `pose_cross_overlay_${sanitizeId(input.id)}`;
      nodes.push({
        id: valuesJoinNodeId,
        type: "join",
      });
      nodes.push({
        id: weightsJoinNodeId,
        type: "join",
      });
      nodes.push({
        id: maskNodeId,
        type: "constant",
        params: {
          value: { vector: activeGroupLayers.map(() => 1) },
        },
      });
      nodes.push({
        id: wsNodeId,
        type: "weightedsumvector",
      });
      nodes.push({
        id: overlayNodeId,
        type: "blendweightedaverageoverlay",
      });

      activeGroupLayers.forEach((layer, index) => {
        edges.push(
          {
            from: { node_id: layer.deltaNodeId },
            to: {
              node_id: valuesJoinNodeId,
              input: `operand_${index + 1}`,
            },
          },
          {
            from: layer.activity.output
              ? {
                  node_id: layer.activity.nodeId,
                  output: layer.activity.output,
                }
              : {
                  node_id: layer.activity.nodeId,
                },
            to: {
              node_id: weightsJoinNodeId,
              input: `operand_${index + 1}`,
            },
          },
        );
      });

      edges.push(
        {
          from: { node_id: valuesJoinNodeId },
          to: { node_id: wsNodeId, input: "values" },
        },
        {
          from: { node_id: weightsJoinNodeId },
          to: { node_id: wsNodeId, input: "weights" },
        },
        {
          from: { node_id: maskNodeId },
          to: { node_id: wsNodeId, input: "masks" },
        },
        {
          from: { node_id: wsNodeId, output: "total_weighted_sum" },
          to: { node_id: overlayNodeId, input: "total_weighted_sum" },
        },
        {
          from: { node_id: wsNodeId, output: "total_weight" },
          to: { node_id: overlayNodeId, input: "total_weight" },
        },
        {
          from: { node_id: wsNodeId, output: "max_effective_weight" },
          to: { node_id: overlayNodeId, input: "max_effective_weight" },
        },
        {
          from: { node_id: neutralNodeId },
          to: { node_id: overlayNodeId, input: "base" },
          selector: [{ field: "values" }, { field: input.id }],
        },
      );

      finalSignal = {
        valueNodeId: overlayNodeId,
        deltaNodeId: overlayNodeId,
        activity: {
          nodeId: wsNodeId,
          output: "max_effective_weight",
        },
      };
    }

    if (!finalSignal) {
      return;
    }

    if (hasBlendStages) {
      nodes.push({
        id: outputNodeId,
        type: "output",
        params: { path: typedPath },
      });
    }

    edges.push({
      from: { node_id: finalSignal.valueNodeId },
      to: { node_id: outputNodeId, input: "in" },
    });

    summary.inputs.push({
      id: input.id,
      path: typedPath,
      neutral: neutralValue,
      contributions,
    });
    summary.outputs.push(typedPath);
  });

  const spec: GraphSpec = {
    nodes,
    edges: edges.length ? edges : undefined,
  };

  nodes
    .filter((node) => node.type === "input")
    .forEach((node) => {
      const inputPath = (node.params as { path?: string } | undefined)?.path;
      if (inputPath && allowedPoseInputPaths.has(inputPath)) {
        return;
      }
      throw new Error(
        `Unexpected authored input node "${node.id}" with path "${inputPath ?? "(missing)"}".`,
      );
    });

  return { spec, summary };
}

function mapPoseIrBlendMode(mode: unknown): PoseBlendMode {
  return mode === "add" ? "additive" : "average";
}

function assertPoseIrContracts(poseIr: PoseRigIrFile): void {
  if (poseIr.contracts?.targetIds !== POSE_IR_TARGETING_CONTRACT) {
    throw new Error(
      `Pose IR target contract must be "${POSE_IR_TARGETING_CONTRACT}".`,
    );
  }
  if (
    poseIr.contracts?.syntheticNodes !== POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT
  ) {
    throw new Error(
      `Pose IR synthetic-node contract must be "${POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT}".`,
    );
  }
}

function assertCanonicalTargets(
  poseIr: PoseRigIrFile,
  standardInputs: StandardRigInput[],
): void {
  const canonicalIds = new Set(standardInputs.map((input) => input.id));
  if (canonicalIds.size === 0) {
    return;
  }

  Object.keys(poseIr.neutral?.values ?? {}).forEach((inputId) => {
    if (canonicalIds.has(inputId)) {
      return;
    }
    throw new Error(
      `Pose IR neutral input "${inputId}" is not a canonical standard input id.`,
    );
  });

  poseIr.poses.forEach((pose) => {
    Object.keys(pose.targets).forEach((inputId) => {
      if (canonicalIds.has(inputId)) {
        return;
      }
      throw new Error(
        `Pose IR target "${inputId}" in pose "${pose.name}" is not a canonical standard input id.`,
      );
    });
  });
}

export function buildPoseGraphSpecFromIr(options: {
  poseIr: PoseRigIrFile;
  standardInputs: StandardRigInput[];
  faceId?: string | null;
  rigKind?: "generic" | "face-specific";
}): { spec: GraphSpec; summary: PoseRigGraphSummary } {
  const { poseIr, standardInputs } = options;
  assertPoseIrContracts(poseIr);
  assertCanonicalTargets(poseIr, standardInputs);

  const groups = Array.isArray(poseIr.groups) ? poseIr.groups : [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const legacyPoses: PoseDefinition[] = (
    Array.isArray(poseIr.poses) ? poseIr.poses : []
  ).map((pose) => {
    const primaryGroupId = pose.groupIds[0] ?? null;
    const primaryGroupPath = primaryGroupId
      ? (groupById.get(primaryGroupId)?.path ?? null)
      : null;
    return {
      id: pose.id,
      name: pose.name,
      description: pose.description,
      groupIds: [...pose.groupIds],
      groupId: primaryGroupId,
      group: primaryGroupPath,
      values: { ...pose.targets },
      createdAt: pose.createdAt,
      updatedAt: pose.updatedAt,
    };
  });

  const legacyGroups: PoseGroupDefinition[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    path: group.path,
    blendMode: mapPoseIrBlendMode(group.intraGroupBlendMode),
  }));

  const defaultGroupBlendMode = mapPoseIrBlendMode(
    groups[0]?.intraGroupBlendMode ?? "average",
  );
  const normalizedBlendStages = normalizeBlendStagesForCompile(
    poseIr.blendStages,
    legacyGroups.map((group) => group.id),
  );
  const neutralInputs =
    poseIr.neutral?.mode === "face-default"
      ? createNeutralInputs(standardInputs)
      : {
          ...createNeutralInputs(standardInputs),
          ...(poseIr.neutral?.values ?? {}),
        };

  return buildPoseGraphSpec({
    faceId: poseIr.faceId ?? options.faceId ?? null,
    neutralInputs,
    poses: legacyPoses,
    standardInputs,
    poseGroups: legacyGroups,
    defaultGroupBlendMode,
    crossGroupBlendMode:
      poseIr.crossGroupPolicy?.mode === "add" ? "additive" : "average",
    crossGroupChannelOverrides: poseIr.crossGroupPolicy?.overrides,
    blendStages: normalizedBlendStages,
    rigKind: poseIr.rigKind ?? options.rigKind ?? "face-specific",
  });
}

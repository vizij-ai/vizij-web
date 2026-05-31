import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import { cloneDeepSafe, normalizeStandardRigInputPath } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import { buildRigInputPath } from "./posePaths";
import { ensureStandardPathInput } from "./standardInputPaths";

type EdgeSpec = NonNullable<GraphSpec["edges"]>[number];
const POSE_VALUE_EPSILON = 1e-6;

export interface PoseGraphOutputEntry {
  nodeId: string;
  path: string | null;
  inputId?: string | null;
}

export interface PoseGraphInputIdRemap {
  fromId: string;
  toId: string;
}

export type PoseGraphRemapApplyRow = {
  nodeId: string;
  suggestedPath?: string | null;
  currentInputId?: string | null;
  poseSlug?: string | null;
};

export type PoseGraphRemapApplyPlan =
  | { status: "ready"; spec: GraphSpec }
  | { status: "conflict"; message: string };

export function remapPoseGraphInputs(
  spec: GraphSpec,
  nextFaceId: string,
): void {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  nodes.forEach((node) => {
    if (node.type !== "input") {
      return;
    }
    const params = node.params as { path?: string } | undefined;
    if (!params?.path) {
      return;
    }
    const updated = replaceRigFaceSegment(params.path, nextFaceId);
    if (updated !== params.path) {
      node.params = { ...(node.params ?? {}), path: updated };
    }
  });
}

export function listPoseGraphOutputs(spec: GraphSpec): PoseGraphOutputEntry[] {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  const selectors = new Map<string, string>();
  const edges = (spec.edges ?? []) as EdgeSpec[];
  edges.forEach((edge) => {
    if (!edge || typeof edge !== "object") {
      return;
    }
    const toNode = edge.to ?? null;
    if (!toNode?.node_id) {
      return;
    }
    const segments = edge.selector ?? [];
    if (!Array.isArray(segments) || segments.length === 0) {
      return;
    }
    const last = segments[segments.length - 1];
    if (last && typeof last.field === "string") {
      selectors.set(toNode.node_id, last.field);
    }
  });

  return nodes
    .filter((node) => node.type === "output")
    .map((node) => {
      const params = node.params as { path?: string } | undefined;
      return {
        nodeId: node.id,
        path: typeof params?.path === "string" ? params.path : null,
        inputId: selectors.get(node.id) ?? null,
      };
    });
}

export function updatePoseGraphOutputPath(
  spec: GraphSpec,
  nodeId: string,
  nextPath: string,
): void {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) {
    return;
  }
  target.params = { ...(target.params ?? {}), path: nextPath };
}

export function collectPoseGraphDeltaInputs(spec: GraphSpec): Set<string> {
  const nodes = spec.nodes ?? [];
  if (!Array.isArray(nodes)) {
    throw new Error("Pose graph is missing node definitions.");
  }
  const neutralNode = nodes.find((node) => node.id === "pose_neutral_record");
  if (!neutralNode) {
    throw new Error("Pose graph did not include the neutral record node.");
  }
  const neutralInputs = extractPoseGraphRecord(neutralNode as NodeSpec);
  const activeInputs = new Set<string>();
  nodes
    .filter((node) => node.id.startsWith("pose_record_"))
    .forEach((node) => {
      const rawValues = extractPoseGraphRecord(node as NodeSpec);
      Object.entries(rawValues).forEach(([inputId, value]) => {
        const neutralValue = neutralInputs[inputId] ?? 0;
        if (Math.abs(value - neutralValue) >= POSE_VALUE_EPSILON) {
          activeInputs.add(inputId);
        }
      });
    });
  return activeInputs;
}

export function remapPoseGraphInputIds(
  spec: GraphSpec,
  remaps: PoseGraphInputIdRemap[],
): void {
  if (!spec || !Array.isArray(remaps) || remaps.length === 0) {
    return;
  }
  const map = new Map<string, string>();
  remaps.forEach(({ fromId, toId }) => {
    const trimmedFrom = fromId?.trim();
    const trimmedTo = toId?.trim();
    if (!trimmedFrom || !trimmedTo || trimmedFrom === trimmedTo) {
      return;
    }
    map.set(trimmedFrom, trimmedTo);
  });
  if (map.size === 0) {
    return;
  }

  const nodes = spec.nodes as NodeSpec[] | undefined;
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (node?.type !== "constant" || !node.params) {
        return;
      }
      const value = (node.params as { value?: unknown }).value;
      if (!value || typeof value !== "object") {
        return;
      }
      const recordContainer = (value as { record?: { values?: unknown } })
        .record;
      if (!recordContainer || typeof recordContainer !== "object") {
        return;
      }
      const values = (recordContainer as { values?: unknown }).values;
      if (!values || typeof values !== "object") {
        return;
      }
      const typedValues = values as {
        record?: Record<string, unknown>;
        entries?: Array<{ key: string; value?: unknown }>;
      };
      if (typedValues.record && typeof typedValues.record === "object") {
        const nextRecord: Record<string, unknown> = {};
        let changed = false;
        Object.entries(typedValues.record).forEach(([key, entry]) => {
          const nextKey = map.get(key) ?? key;
          if (nextKey !== key) {
            changed = true;
          }
          nextRecord[nextKey] = entry;
        });
        if (changed) {
          typedValues.record = nextRecord;
        }
      }
      if (Array.isArray(typedValues.entries)) {
        typedValues.entries.forEach((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof entry.key !== "string"
          ) {
            return;
          }
          const nextKey = map.get(entry.key);
          if (nextKey) {
            entry.key = nextKey;
          }
        });
      }
    });
  }

  const edges = spec.edges;
  if (Array.isArray(edges)) {
    edges.forEach((edge) => {
      const selector = (edge as { selector?: unknown }).selector;
      if (!Array.isArray(selector)) {
        return;
      }
      selector.forEach((segment) => {
        if (!segment || typeof segment !== "object") {
          return;
        }
        const nextField = map.get((segment as { field?: string }).field ?? "");
        if (nextField) {
          (segment as { field?: string }).field = nextField;
        }
      });
    });
  }
}

export function resolvePoseGraphSourceInputId(
  row: Pick<PoseGraphRemapApplyRow, "currentInputId" | "poseSlug">,
): string | null {
  const current = row.currentInputId?.trim();
  if (current) {
    return current;
  }
  const fallback = row.poseSlug?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

export function buildPoseGraphRemapApplyPlan(params: {
  spec: GraphSpec;
  rows: PoseGraphRemapApplyRow[];
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>;
  faceSegment: string;
}): PoseGraphRemapApplyPlan {
  const { spec, rows, standardInputsByPath, faceSegment } = params;
  const combinedRows = rows.filter((row) => row.suggestedPath);
  const targetToSourceMap = new Map<string, Set<string>>();
  const idRemaps: PoseGraphInputIdRemap[] = [];
  const assigned = new Map<string, string>();
  const outputPathUpdates: Array<{ nodeId: string; path: string }> = [];

  combinedRows.forEach((row) => {
    const desired = row.suggestedPath?.trim();
    if (!desired) {
      return;
    }

    const standardPath = ensureStandardPathInput(desired);
    const normalizedStandardPath = normalizeStandardRigInputPath(standardPath);
    const targetInput = standardInputsByPath.get(normalizedStandardPath);
    const sourceInputId = resolvePoseGraphSourceInputId(row);

    if (targetInput && sourceInputId) {
      const sourceSet = targetToSourceMap.get(targetInput.id) ?? new Set();
      sourceSet.add(sourceInputId);
      targetToSourceMap.set(targetInput.id, sourceSet);
    }

    if (
      targetInput &&
      sourceInputId &&
      targetInput.id !== sourceInputId &&
      assigned.get(sourceInputId) !== targetInput.id
    ) {
      assigned.set(sourceInputId, targetInput.id);
      idRemaps.push({ fromId: sourceInputId, toId: targetInput.id });
    }

    outputPathUpdates.push({
      nodeId: row.nodeId,
      path: buildRigInputPath(faceSegment, standardPath),
    });
  });

  const conflictingTargets = Array.from(targetToSourceMap.entries()).filter(
    ([, sourceSet]) => sourceSet.size > 1,
  );
  if (conflictingTargets.length > 0) {
    const conflictMessage = conflictingTargets
      .map(
        ([targetId, sourceSet]) =>
          `${targetId} <= ${Array.from(sourceSet).join(", ")}`,
      )
      .join("\n");
    return {
      status: "conflict",
      message: `Resolve remap conflicts before applying:\n${conflictMessage}`,
    };
  }

  const nextSpec = cloneDeepSafe(spec) as GraphSpec;
  outputPathUpdates.forEach(({ nodeId, path }) => {
    updatePoseGraphOutputPath(nextSpec, nodeId, path);
  });
  if (idRemaps.length > 0) {
    remapPoseGraphInputIds(nextSpec, idRemaps);
  }

  return { status: "ready", spec: nextSpec };
}

function replaceRigFaceSegment(path: string, nextFaceId: string): string {
  const normalized = path.trim();
  if (!normalized) {
    return path;
  }
  return normalized.replace(/rig\/(.+?)(?=\/)/, `rig/${nextFaceId}`);
}

function extractPoseGraphRecord(node: NodeSpec): Record<string, number> {
  const params = node.params as { value?: unknown } | undefined;
  const rawValue = params?.value ?? params;
  const valueEntries = resolvePoseGraphValueEntries(rawValue);
  if (!valueEntries) {
    throw new Error(
      `Constant node "${node.id}" does not contain a pose record payload.`,
    );
  }
  const result: Record<string, number> = {};
  valueEntries.forEach(([key, entry]) => {
    const maybeFloat =
      entry && typeof entry === "object" && typeof entry.float === "number"
        ? entry.float
        : undefined;
    if (typeof maybeFloat === "number" && Number.isFinite(maybeFloat)) {
      result[key] = maybeFloat;
    }
  });
  return result;
}

function resolvePoseGraphValueEntries(
  raw: unknown,
): Array<[string, { float?: number } | undefined]> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const recordContainer = (raw as { record?: unknown }).record ?? raw;
  const valuesContainer =
    recordContainer &&
    typeof recordContainer === "object" &&
    "values" in recordContainer
      ? (recordContainer as { values?: unknown }).values
      : undefined;
  const recordObject =
    valuesContainer && typeof valuesContainer === "object"
      ? (
          valuesContainer as {
            record?: Record<string, { float?: number }>;
            entries?: Array<{ key: string; value?: { float?: number } }>;
          }
        ).record
      : undefined;
  if (recordObject && typeof recordObject === "object") {
    return Object.entries(recordObject);
  }
  const entriesArray =
    valuesContainer && typeof valuesContainer === "object"
      ? (
          valuesContainer as {
            entries?: Array<{ key: string; value?: { float?: number } }>;
          }
        ).entries
      : undefined;
  if (Array.isArray(entriesArray)) {
    return entriesArray
      .filter(
        (entry) =>
          entry && typeof entry === "object" && typeof entry.key === "string",
      )
      .map((entry) => [entry.key, entry.value]);
  }
  return null;
}

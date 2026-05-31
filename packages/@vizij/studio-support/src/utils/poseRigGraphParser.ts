import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, StandardInputId } from "../types/poseRig";

export interface ParsedPoseGraph {
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  warnings: string[];
}

export interface ParsePoseGraphOptions {
  groupName?: string | null;
  dropZeroContributions?: boolean;
  allowUnknownInputs?: boolean;
}

const POSE_VALUE_EPSILON = 1e-6;

function isNodeSpec(value: unknown): value is NodeSpec {
  return Boolean(
    value && typeof value === "object" && "id" in (value as NodeSpec),
  );
}

function extractRecord(node: NodeSpec): Record<string, number> {
  const params = node.params as { value?: unknown } | undefined;
  const rawValue = params?.value ?? params;
  const valueEntries = resolveValueEntries(rawValue);
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

function resolveValueEntries(
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

export function parsePoseGraphSpec(
  spec: GraphSpec,
  standardInputs: StandardRigInput[],
  options?: ParsePoseGraphOptions,
): ParsedPoseGraph {
  const nodes = spec.nodes ?? [];
  if (!Array.isArray(nodes) || nodes.some((node) => !isNodeSpec(node))) {
    throw new Error("Pose graph is missing node definitions.");
  }

  const neutralNode = nodes.find((node) => node.id === "pose_neutral_record");
  if (!neutralNode) {
    throw new Error("Pose graph did not include the neutral record node.");
  }

  const neutralInputs = extractRecord(neutralNode);
  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const allowUnknownInputs = options?.allowUnknownInputs ?? false;
  const warnings: string[] = [];

  const poseConstants = nodes.filter((node) =>
    node.id.startsWith("pose_record_"),
  );
  if (poseConstants.length === 0) {
    return {
      neutralInputs,
      poses: [],
      warnings,
    };
  }

  const now = new Date().toISOString();
  const weightPaths = collectPoseWeightPaths(nodes);
  const groupName = options?.groupName ?? null;
  const poses: PoseDefinition[] = poseConstants.map((node) => {
    const slug = node.id.replace(/^pose_record_/, "");
    const rawValues = extractRecord(node);
    const sanitizedValues: Record<string, number> = {};
    Object.entries(rawValues).forEach(([inputId, value]) => {
      const isZero = Math.abs(value) <= POSE_VALUE_EPSILON;
      const dropZero = options?.dropZeroContributions === true;
      const knownInput = standardInputsById.has(inputId);
      if (dropZero && isZero) {
        return;
      }
      if (knownInput || allowUnknownInputs) {
        sanitizedValues[inputId] = value;
        return;
      }
      warnings.push(`Pose "${slug}" references missing input "${inputId}".`);
    });
    const weightPath = weightPaths.get(slug) ?? null;
    return {
      id: slug,
      name: derivePoseName(weightPath, slug),
      description: "",
      group: groupName,
      values: sanitizedValues,
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    neutralInputs,
    poses,
    warnings,
  };
}

function humanizePoseSlug(slug: string): string {
  const cleaned = slug.replace(/_/g, " ").trim();
  if (!cleaned) {
    return "Pose";
  }
  return cleaned
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function derivePoseName(path: string | null, slug: string): string {
  if (!path) {
    return humanizePoseSlug(slug);
  }
  const withoutRig = path.replace(/rig\/[A-Za-z0-9_-]+\//, "");
  const leaf = withoutRig.split("/").pop() ?? slug;
  const cleaned = leaf.replace(/\.weight$/i, "");
  return humanizePoseSlug(cleaned || slug);
}

function collectPoseWeightPaths(nodes: NodeSpec[]): Map<string, string> {
  const map = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.type !== "input" || !node.id.startsWith("pose_")) {
      return;
    }
    const params = node.params as { path?: string } | undefined;
    if (!params?.path) {
      return;
    }
    const slug = node.id.replace(/^pose_/, "");
    map.set(slug, params.path);
  });
  return map;
}

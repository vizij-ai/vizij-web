import type { Edge, Node } from "reactflow";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { vectorPlayground } from "@vizij/node-graph-wasm";
import { getLocalUrdfSpec } from "../assets/graph-presets";

/**
 * Minimal nodes->GraphSpec converter used by the lightweight demo.
 * Mirrors the essential behavior of demo-node-graph's nodesToSpec but
 * without any React Flow/editor dependencies.
 */
type NodeParams = Record<string, unknown> & { value?: unknown };

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number");

const omit = <
  T extends Record<string, unknown>,
  K extends readonly (keyof T)[],
>(
  obj: T,
  keys: K,
): Omit<T, K[number]> => {
  const result = { ...obj } as any;
  for (const key of keys) {
    delete result[key as string];
  }
  return result;
};

const sanitizeParams = (params: NodeParams): NodeParams => {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return {};
  return Object.fromEntries(entries) as NodeParams;
};

export const nodesToSpecMinimal = (nodes: Node[], edges: Edge[]): GraphSpec => {
  const spec: GraphSpec = { nodes: [] };

  for (const node of nodes) {
    const { id, type, data } = node;

    if (!id) continue;

    // Skip viewer nodes (UI only)
    if ((type ?? "").toLowerCase() === "viewer") continue;

    const lowerType = (type || "unknown").toLowerCase();

    const inputEdges = edges.filter((e) => e.target === id);
    const inputs: Record<string, { node_id: string; output_key: string }> = {};
    for (const edge of inputEdges) {
      const targetHandle = edge.targetHandle ?? "in";
      if (!targetHandle) continue;
      inputs[targetHandle] = {
        node_id: edge.source,
        output_key: edge.sourceHandle ?? "out",
      };
    }

    const baseParams: NodeParams = { ...(data ?? {}) } as NodeParams;
    const params = omit(baseParams, [
      "label",
      "inputs",
      "output_shapes",
    ] as const);

    if (typeof params.path === "string") {
      const trimmed = (params.path as string).trim();
      params.path = trimmed.length > 0 ? trimmed : undefined;
    }

    if (lowerType === "vectorconstant") {
      if (isNumberArray(params.value)) {
        params.value = { vector: params.value };
      }
    } else if (lowerType === "constant") {
      const v = params.value;
      if (typeof v === "number") params.value = { float: v };
      else if (typeof v === "boolean") params.value = { bool: v };
      else if (isNumberArray(v)) params.value = { vector: v };
    }

    const outputShapes =
      (data as any)?.output_shapes &&
      typeof (data as any).output_shapes === "object"
        ? ((data as any).output_shapes as Record<string, unknown>)
        : {};

    const nodeSpec = {
      id,
      type: lowerType,
      params: sanitizeParams(params),
      inputs,
      output_shapes: outputShapes,
    } as any;

    spec.nodes.push(nodeSpec);
  }

  return spec;
};

/** Get default graph spec as a runtime GraphSpec (uses wasm sample by default) */
export const getDefaultGraphSpec = (): GraphSpec => {
  try {
    return vectorPlayground as GraphSpec;
  } catch {
    // Fallback to local URDF sample if wasm samples are unavailable
    return getLocalUrdfSpec();
  }
};

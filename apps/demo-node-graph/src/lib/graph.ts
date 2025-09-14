import { type Node as RFNode, type Edge as RFEdge } from "reactflow";

/**
 * Define value types expected by the core.
 * These mirror the ValueJSON shape used by the engine.
 */
type ValueJSON = { float: number } | { bool: boolean } | { vector: number[] };

/**
 * Params object passed to the core.
 * 'value' is common but optional; other editor-specific keys are allowed.
 */
type NodeParams = Record<string, unknown> & {
  value?: number | boolean | number[] | ValueJSON;
};

interface InputConnection {
  node_id: string;
  output_key: string;
}

interface GraphNodeSpec {
  id: string;
  type: string;
  params: NodeParams;
  inputs: Record<string, InputConnection>;
}

export interface GraphSpec {
  nodes: GraphNodeSpec[];
}

/**
 * Type guard for number arrays to avoid 'any' casts.
 */
const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number");

/**
 * Create a shallow copy of an object without the specified keys.
 */
const omit = <
  T extends Record<string, unknown>,
  K extends readonly (keyof T)[],
>(
  obj: T,
  keys: K,
): Omit<T, K[number]> => {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
};

// This function converts React Flow nodes and edges to the GraphSpec format.
export const nodesToSpec = (nodes: RFNode[], edges: RFEdge[]): GraphSpec => {
  const spec: GraphSpec = { nodes: [] };

  for (const node of nodes) {
    const { type, data, id } = node;

    // Skip purely visual nodes that should not be sent to the engine
    if ((type ?? "").toLowerCase() === "viewer") {
      continue;
    }

    // Normalize node type to lowercase for the core enum (serde rename_all = "lowercase")
    const lowerType = (type || "unknown").toLowerCase();

    const inputs: Record<string, InputConnection> = {};
    const inputEdges = edges.filter((e) => e.target === id);

    for (const edge of inputEdges) {
      if (edge.targetHandle) {
        inputs[edge.targetHandle] = {
          node_id: edge.source,
          // Default to "out" when the source handle (output key) is unspecified
          output_key: edge.sourceHandle ?? "out",
        };
      }
    }

    // Sanitize params: strip UI-only fields and coerce known param shapes for the core
    const baseParams: NodeParams = { ...data } as NodeParams;

    // Remove UI-only fields that the core doesn't need while keeping strong types
    const params = omit(baseParams, ["label", "inputs"] as const);

    // Coerce initial values to match core ValueJSON where needed
    if (lowerType === "vectorconstant") {
      // Ensure vectors are encoded as { vector: [...] } to avoid accidental vec3 coercion
      if (isNumberArray(params.value)) {
        params.value = { vector: params.value };
      }
    } else if (lowerType === "constant") {
      const v = params.value;
      if (typeof v === "number") params.value = { float: v };
      else if (typeof v === "boolean") params.value = { bool: v };
      else if (isNumberArray(v)) params.value = { vector: v };
    }
    // Split.sizes remains a plain number[] (NodeParams.sizes: Option<Vec<f64>>), no wrapping required

    const nodeSpec: GraphNodeSpec = {
      id,
      type: lowerType,
      params,
      inputs,
    };

    spec.nodes.push(nodeSpec);
  }

  return spec;
};

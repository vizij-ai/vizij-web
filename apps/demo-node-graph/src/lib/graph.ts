import { type Node as RFNode, type Edge as RFEdge } from "reactflow";

// Define the structure for the graph specification for the engine
interface NodeParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

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

// This function converts React Flow nodes and edges to the GraphSpec format.
export const nodesToSpec = (nodes: RFNode[], edges: RFEdge[]): GraphSpec => {
  const spec: GraphSpec = { nodes: [] };

  for (const node of nodes) {
    const { type, data, id } = node;

    // Skip purely visual nodes that should not be sent to the engine
    if ((type ?? "").toLowerCase() === "viewer") {
      continue;
    }

    const inputs: Record<string, InputConnection> = {};
    const inputEdges = edges.filter(e => e.target === id);

    for (const edge of inputEdges) {
      if (edge.targetHandle) {
        inputs[edge.targetHandle] = {
          node_id: edge.source,
          // Default to "out" when the source handle (output key) is unspecified
          output_key: edge.sourceHandle ?? "out",
        };
      }
    }

    const params: NodeParams = { ...data };

    const nodeSpec: GraphNodeSpec = {
      id,
      type: type || 'unknown',
      params,
      inputs,
    };

    spec.nodes.push(nodeSpec);
  }

  return spec;
};

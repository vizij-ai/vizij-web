import { type Node as RFNode, type Edge as RFEdge } from "reactflow";

// Define the structure for the graph specification for the engine
interface NodeParams {
  [key: string]: any;
}

interface GraphNodeSpec {
  id: string;
  type: string;
  params: NodeParams;
  inputs: string[];
}

export interface GraphSpec {
  nodes: GraphNodeSpec[];
}

// This function converts React Flow nodes and edges to the GraphSpec format.
export const nodesToSpec = (nodes: RFNode[], edges: RFEdge[]): GraphSpec => {
  // Filter out UI-only nodes that are not meant for the engine
  const engineNodes = nodes.filter(n => n.type !== 'output');
  const engineNodeIds = new Set(engineNodes.map(n => n.id));
  const engineEdges = edges.filter(e => engineNodeIds.has(e.source) && engineNodeIds.has(e.target));

  const spec: GraphSpec = { nodes: [] };

  for (const node of engineNodes) {
    const { type, data, id } = node;

    const inputEdges = engineEdges.filter(e => e.target === id);
    const inputs = inputEdges
      .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || ''))
      .map(e => e.source);

    const params: NodeParams = {};
    const { op } = data;

    switch (type) {
      case 'constant':
      case 'slider':
        params.value = data.value ?? 0;
        break;
      case 'oscillator':
        params.frequency = data.frequency ?? 1;
        params.phase = data.phase ?? 0;
        break;
      case 'clamp':
        params.min = data.min ?? 0;
        params.max = data.max ?? 1;
        break;
      case 'remap':
        params.in_min = data.in_min ?? 0;
        params.in_max = data.in_max ?? 1;
        params.out_min = data.out_min ?? 0;
        params.out_max = data.out_max ?? 1;
        break;
      case 'inversekinematics':
        params.bone1 = data.bone1 ?? 1;
        params.bone2 = data.bone2 ?? 1;
        params.bone3 = data.bone3 ?? 0.5;
        break;
      case 'vec3split':
        params.index = data.index ?? 0;
        break;
      case 'multiply':
      case 'divide':
        params.op = type;
        break;
      case 'add':
      case 'subtract':
      case 'power':
      case 'log':
      case 'greaterthan':
      case 'lessthan':
      case 'equal':
      case 'notequal':
      case 'and':
      case 'or':
      case 'xor':
      case 'not':
      case 'sin':
      case 'cos':
      case 'tan':
      case 'vec3add':
      case 'vec3subtract':
      case 'vec3multiply':
        if (op) params.op = op;
        break;
    }

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

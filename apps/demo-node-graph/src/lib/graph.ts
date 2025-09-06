import type { Node as RFNode, Edge as RFEdge } from 'reactflow';
import type { GraphSpec } from '../schema/graph';

type GraphNodeSpec = GraphSpec['nodes'][number];
type NodeParams = GraphNodeSpec['params'];


export const nodesToSpec = (nodes: RFNode[], edges: RFEdge[]): GraphSpec => {
  const spec: GraphSpec = { nodes: [] };
  const allowedTypes = new Set<GraphNodeSpec['type']>(['constant', 'add', 'subtract', 'time', 'oscillator', 'slider']);
  const validNodes = nodes.filter(n => allowedTypes.has(n.type as GraphNodeSpec['type']));
  const validIds = new Set(validNodes.map(n => n.id));
  const filteredEdges = edges.filter(e => validIds.has(e.source) && validIds.has(e.target));

  for (const node of validNodes) {
    const inputEdges = filteredEdges.filter(e => e.target === node.id);
    
    // This is a simplified way to handle inputs. 
    // For nodes with specific input ports like 'frequency', we map them directly.
    // For an 'Add' node, the order is determined by sorting the handles.
    const inputs = inputEdges
      .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || ''))
      .map(e => e.source);

    const params: NodeParams = {
        value: node.data.value,
        frequency: node.data.frequency,
        phase: node.data.phase,
        min: node.data.min,
        max: node.data.max,
    };

    // If an input is connected to a specific parameter handle, set it directly
    const freqEdge = inputEdges.find(e => e.targetHandle === 'frequency');
    if (freqEdge) {
        // This assumes the source of the frequency is another node's output.
        // The engine would need to be adapted to handle this, as it currently only accepts f64 params.
        // For now, we demonstrate the wiring, but the engine will use the param value.
    }

    const nodeSpec: GraphNodeSpec = {
      id: node.id,
      type: node.type as GraphNodeSpec['type'],
      params: params,
      inputs,
    };
    spec.nodes.push(nodeSpec);
  }
  return spec;
};

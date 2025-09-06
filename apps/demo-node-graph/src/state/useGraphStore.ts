import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnNodesChange,
  OnEdgesChange,
  NodeProps
} from 'reactflow';
import { nodeTypeRegistry } from '../lib/node-types';

export type RFState = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  setNodeData: (nodeId: string, data: any) => void;
  setGraph: (graph: Pick<RFState, 'nodes' | 'edges'>) => void;
};

const initialNodes: Node[] = [
    { id: 'time', type: 'time', position: { x: 0, y: 0 }, data: { label: 'Time' } },
    { id: 'slider', type: 'slider', position: { x: 0, y: 120 }, data: { label: 'Frequency', value: 0.5, min: 0, max: 2 } },
    { id: 'osc', type: 'oscillator', position: { x: 300, y: 60 }, data: { label: 'Oscillator' } },
];

const initialEdges: Edge[] = [
    { id: 'e-slider-osc', source: 'slider', target: 'osc', targetHandle: 'frequency' },
];

const useGraphStore = create<RFState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !target) return;

    const sourceNode = get().nodes.find(n => n.id === source);
    const targetNode = get().nodes.find(n => n.id === target);

    if (!sourceNode || !targetNode) return;

    const sourceSpec = nodeTypeRegistry[sourceNode.type!];
    const targetSpec = nodeTypeRegistry[targetNode.type!];

    const sourcePort = sourceSpec.outputs.find(p => p.name === sourceHandle);
    const targetPort = targetSpec.inputs.find(p => p.name === targetHandle);

    // Allow any connection if types are not defined
    if (!sourcePort || !targetPort) {
        set({
            edges: addEdge({ ...connection, animated: true }, get().edges),
        });
        return;
    }

    if (sourcePort.type === targetPort.type || sourcePort.type === 'any' || targetPort.type === 'any') {
        set({
            edges: addEdge({ ...connection, animated: true }, get().edges),
        });
    } else {
        console.warn(`Incompatible connection: ${sourcePort.type} to ${targetPort.type}`);
    }
  },
  addNode: (node: Node) => {
    set({
        nodes: [...get().nodes, node]
    });
  },
  setNodeData: (nodeId: string, data: any) => {
    set({
      nodes: get().nodes.map(n => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, ...data } };
        }
        return n;
      })
    });
  },
  setGraph: (graph: Pick<RFState, 'nodes' | 'edges'>) => {
    set(graph);
  }
}));

export default useGraphStore;

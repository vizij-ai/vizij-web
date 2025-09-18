import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodesChange,
  type OnEdgesChange,
} from "reactflow";
import { nodesToSpec } from "../lib/graph";
import { type GraphSpec } from "@vizij/node-graph-wasm";
import { getInitialGraph } from "../assets/graph-presets";

export type RFState = {
  nodes: Node[];
  edges: Edge[];
  spec: GraphSpec;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNodeData: (nodeId: string, data: any) => void;
  setGraph: (graph: Pick<RFState, "nodes" | "edges">) => void;
  renameNode: (nodeId: string, newId: string) => void;
  updateNodeType: (
    nodeId: string,
    newType: string,
    defaults?: Record<string, unknown>,
  ) => void;
  removeEdge: (edgeId: string) => void;
};
const { n, e } = getInitialGraph();
const initialNodes = n;
const initialEdges = e;

const useGraphStore = create<RFState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  spec: nodesToSpec(initialNodes, initialEdges),

  onNodesChange: (changes: NodeChange[]) => {
    set((state) => {
      const nextNodes = applyNodeChanges(changes, state.nodes);
      const nextNodeIds = new Set(nextNodes.map((node) => node.id));
      const nextEdges = state.edges.filter(
        (edge) => nextNodeIds.has(edge.source) && nextNodeIds.has(edge.target),
      );
      return {
        nodes: nextNodes,
        edges: nextEdges,
        spec: nodesToSpec(nextNodes, nextEdges),
      };
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set((state) => {
      const nextEdges = applyEdgeChanges(changes, state.edges);
      return {
        edges: nextEdges,
        spec: nodesToSpec(state.nodes, nextEdges),
      };
    });
  },
  onConnect: (connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;

    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === source);
      const targetNode = state.nodes.find((n) => n.id === target);
      if (!sourceNode || !targetNode) {
        return state;
      }

      const targetHandleKey = connection.targetHandle ?? "in";
      const filtered = state.edges.filter(
        (edge) =>
          !(
            edge.target === target &&
            (edge.targetHandle ?? "in") === targetHandleKey
          ),
      );

      const nextEdges = addEdge({ ...connection, animated: true }, filtered);
      return {
        edges: nextEdges,
        spec: nodesToSpec(state.nodes, nextEdges),
      };
    });
  },
  addNode: (node: Node) => {
    set((state) => {
      const nextNodes = [...state.nodes, node];
      return {
        nodes: nextNodes,
        spec: nodesToSpec(nextNodes, state.edges),
      };
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNodeData: (nodeId: string, data: any) => {
    set((state) => {
      const nextNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      );
      return {
        nodes: nextNodes,
        spec: nodesToSpec(nextNodes, state.edges),
      };
    });
  },
  setGraph: (graph: Pick<RFState, "nodes" | "edges">) => {
    set(() => {
      const nodes = graph.nodes.map((node) => ({
        ...node,
        type: node.type?.toLowerCase?.() ?? node.type,
        data: { ...node.data },
      }));
      const edges = graph.edges.map((edge) => ({ ...edge }));
      return {
        nodes,
        edges,
        spec: nodesToSpec(nodes, edges),
      };
    });
  },
  renameNode: (nodeId: string, newId: string) => {
    if (!newId || nodeId === newId) return;

    set((state) => {
      if (state.nodes.some((node) => node.id === newId)) {
        return state;
      }

      const nextNodes = state.nodes.map((node) =>
        node.id === nodeId ? { ...node, id: newId } : node,
      );
      const nextEdges = state.edges.map((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          return {
            ...edge,
            source: edge.source === nodeId ? newId : edge.source,
            target: edge.target === nodeId ? newId : edge.target,
          };
        }
        return edge;
      });

      return {
        nodes: nextNodes,
        edges: nextEdges,
        spec: nodesToSpec(nextNodes, nextEdges),
      };
    });
  },
  updateNodeType: (
    nodeId: string,
    newType: string,
    defaults?: Record<string, unknown>,
  ) => {
    set((state) => {
      const normalizedType = newType.toLowerCase();
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const preservedLabel = node.data?.label;
        const nextData: Record<string, unknown> = {
          ...(defaults ?? {}),
        };
        if (preservedLabel !== undefined && nextData.label === undefined) {
          nextData.label = preservedLabel;
        }
        return {
          ...node,
          type: normalizedType,
          data: nextData,
        };
      });

      return {
        nodes: nextNodes,
        spec: nodesToSpec(nextNodes, state.edges),
      };
    });
  },
  removeEdge: (edgeId: string) => {
    set((state) => {
      const nextEdges = state.edges.filter((edge) => edge.id !== edgeId);
      return {
        edges: nextEdges,
        spec: nodesToSpec(state.nodes, nextEdges),
      };
    });
  },
}));

export default useGraphStore;

import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import type { GraphSpec, NodeSpec, NodeParams } from "@vizij/node-graph-wasm";

/**
 * Minimal editor store for the node-graph-editor app.
 * - Holds React Flow `nodes` and `edges`
 * - Exposes helpers to update nodes/edges and set/get a canonical spec
 * - Provides placeholder converters nodesToSpec / specToNodes to be implemented further
 */

export type EditorNode = Node & {
  // additional editor-specific metadata may live here
  data: Record<string, any>;
};

export type EditorEdge = Edge & {
  // additional editor-specific metadata may live here
};

type EditorState = {
  nodes: EditorNode[];
  edges: EditorEdge[];
  spec: GraphSpec | null;
  selectedNodeId: string | null;
  setSelected: (id: string | null) => void;
  setNodes: (
    updater: EditorNode[] | ((prev: EditorNode[]) => EditorNode[]),
  ) => void;
  setEdges: (
    updater: EditorEdge[] | ((prev: EditorEdge[]) => EditorEdge[]),
  ) => void;
  setSpec: (
    spec:
      | GraphSpec
      | { graph: GraphSpec; layout?: Record<string, { x: number; y: number }> }
      | null,
  ) => void;
  reset: () => void;
  // converters (placeholders)
  nodesToSpec: (nodes: EditorNode[], edges: EditorEdge[]) => GraphSpec;
  specToNodes: (spec: GraphSpec) => {
    nodes: EditorNode[];
    edges: EditorEdge[];
  };
};

export const useEditorStore = create<EditorState>((set, get) => ({
  nodes: [],
  edges: [],
  spec: null,
  selectedNodeId: null,
  setSelected: (id) => set(() => ({ selectedNodeId: id })),

  setNodes: (updater) =>
    set((state) => {
      const nextNodes =
        typeof updater === "function" ? (updater as any)(state.nodes) : updater;

      // Build candidate GraphSpec and only update spec if it meaningfully changed.
      // This prevents graph reloads on UI-only node updates (e.g., selection toggles).
      const nextSpecCandidate = get().nodesToSpec(nextNodes, state.edges);
      const prevSpec = get().spec;

      let specToUse = nextSpecCandidate;
      try {
        const prevStr = prevSpec ? JSON.stringify(prevSpec) : "";
        const nextStr = nextSpecCandidate
          ? JSON.stringify(nextSpecCandidate)
          : "";
        if (prevStr === nextStr) {
          // Preserve object identity to avoid triggering GraphProvider reload
          specToUse = prevSpec as any;
        }
      } catch {
        // Fallback: if stringify fails, just use candidate
        specToUse = nextSpecCandidate;
      }

      return {
        nodes: nextNodes,
        spec: specToUse,
      };
    }),
  setEdges: (updater) =>
    set((state) => {
      const nextEdges =
        typeof updater === "function" ? (updater as any)(state.edges) : updater;

      const nextSpecCandidate = get().nodesToSpec(state.nodes, nextEdges);
      const prevSpec = get().spec;

      let specToUse = nextSpecCandidate;
      try {
        const prevStr = prevSpec ? JSON.stringify(prevSpec) : "";
        const nextStr = nextSpecCandidate
          ? JSON.stringify(nextSpecCandidate)
          : "";
        if (prevStr === nextStr) {
          specToUse = prevSpec as any;
        }
      } catch {
        specToUse = nextSpecCandidate;
      }

      return {
        edges: nextEdges,
        spec: specToUse,
      };
    }),
  setSpec: (specLike) =>
    set(() => {
      if (!specLike) return { spec: null, nodes: [], edges: [] };

      // Accept composite payload { graph, layout } or plain GraphSpec
      const isComposite =
        typeof specLike === "object" &&
        specLike !== null &&
        "graph" in specLike;

      const graph: GraphSpec = isComposite ? (specLike as any).graph : specLike;
      const layout: Record<string, { x: number; y: number }> | undefined =
        isComposite ? (specLike as any).layout : undefined;

      const converted = get().specToNodes(graph);

      // Apply layout positions if provided
      const nodesWithPos = converted.nodes.map((n) => {
        const pos = layout?.[n.id];
        return pos
          ? ({ ...n, position: { x: pos.x ?? 0, y: pos.y ?? 0 } } as EditorNode)
          : n;
      });

      return { spec: graph, nodes: nodesWithPos, edges: converted.edges };
    }),
  reset: () =>
    set(() => ({ nodes: [], edges: [], spec: null, selectedNodeId: null })),

  // Canonical GraphSpec builder (no edges persisted). Inputs are reconstructed from the RF graph.
  nodesToSpec: (nodes, edges) => {
    const graph: GraphSpec = { nodes: [] };

    // Group incoming edges by target node id
    const byTarget = new Map<string, Edge[]>();
    for (const e of edges) {
      if (!e.target) continue;
      const arr = byTarget.get(e.target) ?? [];
      arr.push(e);
      byTarget.set(e.target, arr);
    }

    for (const n of nodes) {
      const type = String(n.type ?? "").toLowerCase() as any;

      // Sanitize params from node.data.params (drop undefined)
      const paramsSrc = (n.data?.params ?? {}) as Record<string, unknown>;
      const paramsEntries = Object.entries(paramsSrc).filter(
        ([, v]) => v !== undefined,
      );
      const params: NodeParams | undefined =
        paramsEntries.length > 0
          ? (Object.fromEntries(paramsEntries) as NodeParams)
          : undefined;

      // Build inputs from incoming edges
      const incoming = byTarget.get(n.id) ?? [];
      const inputs: Record<string, { node_id: string; output_key?: string }> =
        {};
      const counts: Record<string, number> = {};
      for (const e of incoming) {
        const keyBase = String(e.targetHandle ?? "in");
        const idx = (counts[keyBase] = (counts[keyBase] ?? 0) + 1);
        const key = idx === 1 ? keyBase : `${keyBase}_${idx}`;
        inputs[key] = {
          node_id: String(e.source),
          output_key: e.sourceHandle ? String(e.sourceHandle) : "out",
        };
      }
      const inputsObj = Object.keys(inputs).length > 0 ? inputs : undefined;

      const outputShapes =
        n.data?.output_shapes && typeof n.data.output_shapes === "object"
          ? (n.data.output_shapes as Record<string, any>)
          : undefined;

      const nodeSpec: NodeSpec = {
        id: String(n.id),
        type: type as any,
        ...(params ? { params } : {}),
        ...(inputsObj ? { inputs: inputsObj } : {}),
        ...(outputShapes ? { output_shapes: outputShapes } : {}),
      };

      graph.nodes.push(nodeSpec);
    }

    return graph;
  },

  specToNodes: (spec) => {
    if (!spec || typeof spec !== "object") return { nodes: [], edges: [] };

    const nodeSpecs: NodeSpec[] = Array.isArray((spec as any).nodes)
      ? ((spec as any).nodes as NodeSpec[])
      : [];

    // Build RF nodes (positions will be applied by setSpec when layout is provided)
    const nodes: EditorNode[] = nodeSpecs.map((ns) => {
      const data: Record<string, any> = {};
      if (ns.params && typeof ns.params === "object")
        data.params = { ...ns.params };
      if (ns.output_shapes && typeof ns.output_shapes === "object")
        data.output_shapes = { ...ns.output_shapes };

      return {
        id: String(ns.id),
        type: String(ns.type),
        position: { x: 0, y: 0 },
        data,
      } as EditorNode;
    });

    // Reconstruct RF edges for UI from NodeSpec.inputs
    const edges: EditorEdge[] = [];
    for (const ns of nodeSpecs) {
      const inputs = (ns.inputs ?? {}) as Record<
        string,
        { node_id: string; output_key?: string }
      >;
      for (const [inputKey, conn] of Object.entries(inputs)) {
        const src = String(conn.node_id);
        const outKey = conn.output_key ?? "out";
        const tgt = String(ns.id);
        edges.push({
          id: `e_${src}_${outKey}_${tgt}_${inputKey}`,
          source: src,
          target: tgt,
          sourceHandle: outKey,
          targetHandle: inputKey,
        } as EditorEdge);
      }
    }

    return { nodes, edges };
  },
}));

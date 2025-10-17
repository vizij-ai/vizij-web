import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import type {
  GraphSpec,
  NodeSpec,
  NodeParams,
  ValueJSON,
} from "@vizij/node-graph-wasm";

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

type InputDefaultValue =
  | ValueJSON
  | number
  | boolean
  | string
  | number[]
  | null
  | undefined;

type InputDefaultEntry = {
  value: InputDefaultValue;
  shape?: Record<string, any> | null;
};

type SelectorSegmentJSON = { field: string } | { index: number };
type CanonicalGraphEdge = NonNullable<GraphSpec["edges"]>[number];

function normalizeInputDefaultEntry(entry: unknown): InputDefaultEntry | null {
  if (entry == null) {
    return null;
  }
  if (
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    "value" in (entry as Record<string, unknown>)
  ) {
    const record = entry as { value?: unknown; shape?: unknown };
    const value = record.value as InputDefaultValue;
    const shape =
      record.shape && typeof record.shape === "object"
        ? (record.shape as Record<string, any>)
        : null;
    return { value, shape };
  }
  return { value: entry as InputDefaultValue };
}

function serializeInputDefaults(
  defaults: Record<string, InputDefaultEntry | undefined> | undefined,
): Record<string, unknown> | undefined {
  if (!defaults) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [inputId, entry] of Object.entries(defaults)) {
    if (!entry || entry.value === undefined) continue;
    if (entry.shape && Object.keys(entry.shape).length > 0) {
      result[inputId] = {
        value: entry.value,
        shape: entry.shape,
      };
    } else {
      result[inputId] = entry.value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSelectorText(
  text: string | null | undefined,
): SelectorSegmentJSON[] | undefined {
  if (!text || typeof text !== "string") return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Attempt to parse JSON form first
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = arr
        .map((seg) => {
          if (!seg || typeof seg !== "object") return null;
          if ("field" in seg) {
            const field = (seg as { field: unknown }).field;
            if (typeof field === "string" && field.length > 0) {
              return { field };
            }
          } else if ("index" in seg) {
            const index = Number((seg as { index: unknown }).index);
            if (Number.isFinite(index)) {
              return { index };
            }
          }
          return null;
        })
        .filter((seg): seg is SelectorSegmentJSON => seg != null);
      return normalized.length > 0 ? normalized : undefined;
    } catch {
      // fall through to manual parsing
    }
  }

  const clean = trimmed.replace(/\s+/g, "");
  if (!clean) return undefined;
  const tokens = clean.split(".");
  const segments: SelectorSegmentJSON[] = [];

  for (const token of tokens) {
    if (!token) continue;
    const pattern = /([^[\]]+)|(\[-?\d+\])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(token)) !== null) {
      const part = match[0];
      if (!part) continue;
      if (part.startsWith("[")) {
        const idx = Number(part.slice(1, -1));
        if (Number.isFinite(idx)) {
          segments.push({ index: idx });
        }
      } else {
        segments.push({ field: part });
      }
    }
  }

  return segments.length > 0 ? segments : undefined;
}

function formatSelectorText(
  selector: SelectorSegmentJSON[] | null | undefined,
): string {
  if (!Array.isArray(selector) || selector.length === 0) {
    return "";
  }
  let result = "";
  selector.forEach((segment) => {
    if (!segment || typeof segment !== "object") return;
    if ("field" in segment && typeof segment.field === "string") {
      if (result.length > 0 && !result.endsWith("]")) {
        result += ".";
      }
      result += segment.field;
    } else if ("index" in segment && typeof segment.index === "number") {
      result += `[${segment.index}]`;
    }
  });
  return result;
}

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

  // Canonical GraphSpec builder using explicit edges and input defaults.
  nodesToSpec: (nodes, edges) => {
    const nodeMap = new Map<string, EditorNode>();
    nodes.forEach((node) => nodeMap.set(String(node.id), node));

    const graphNodes: NodeSpec[] = nodes.map((n) => {
      const type = String(n.type ?? "").toLowerCase() as any;

      const paramsSrc = (n.data?.params ?? {}) as Record<string, unknown>;
      const paramsEntries = Object.entries(paramsSrc).filter(
        ([, v]) => v !== undefined,
      );
      const params: NodeParams | undefined =
        paramsEntries.length > 0
          ? (Object.fromEntries(paramsEntries) as NodeParams)
          : undefined;

      if (params && typeof params.path === "string") {
        params.path = params.path.trim();
      }

      const outputShapes =
        n.data?.output_shapes && typeof n.data.output_shapes === "object"
          ? (n.data.output_shapes as Record<string, any>)
          : undefined;

      const inputDefaultsRaw =
        n.data?.input_defaults && typeof n.data.input_defaults === "object"
          ? (n.data.input_defaults as Record<string, InputDefaultEntry>)
          : undefined;
      const inputDefaults = serializeInputDefaults(inputDefaultsRaw);

      const nodeSpec: NodeSpec = {
        id: String(n.id),
        type,
        ...(params ? { params } : {}),
        ...(outputShapes ? { output_shapes: outputShapes } : {}),
        ...(inputDefaults ? { input_defaults: inputDefaults } : {}),
      };

      return nodeSpec;
    });

    const specEdges: GraphSpec["edges"] = [];

    const findSelectorForEdge = (
      targetId: string,
      inputId: string,
      sourceId: string,
      outputKey: string,
    ): string | undefined => {
      const node = nodeMap.get(targetId);
      if (!node) return undefined;
      const inputsArray = Array.isArray(node.data?.inputs)
        ? (node.data?.inputs as any[])
        : [];
      const match = inputsArray.find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const portId = String(entry.portId ?? "");
        const srcId = String(entry.sourceNodeId ?? "");
        const srcOut = String(entry.sourceOutputKey ?? "out");
        return portId === inputId && srcId === sourceId && srcOut === outputKey;
      });
      const selector = match?.selector;
      return typeof selector === "string" ? selector : undefined;
    };

    edges.forEach((editorEdge) => {
      if (!editorEdge.source || !editorEdge.target) return;
      const fromNodeId = String(editorEdge.source);
      const toNodeId = String(editorEdge.target);
      const inputKey = String(editorEdge.targetHandle ?? "in");
      const outputKey = editorEdge.sourceHandle
        ? String(editorEdge.sourceHandle)
        : "out";

      const selectorText =
        (editorEdge.data as any)?.selector ??
        findSelectorForEdge(toNodeId, inputKey, fromNodeId, outputKey);
      const selectorSegments = parseSelectorText(selectorText);

      const specEdge: CanonicalGraphEdge = {
        from: {
          node_id: fromNodeId,
          ...(outputKey ? { output: outputKey } : {}),
        },
        to: {
          node_id: toNodeId,
          input: inputKey,
        },
      } as CanonicalGraphEdge;
      if (selectorSegments) {
        specEdge.selector = selectorSegments;
      }
      specEdges.push(specEdge);
    });

    const graph: GraphSpec = {
      nodes: graphNodes,
      ...(specEdges.length > 0 ? { edges: specEdges } : {}),
    };

    return graph;
  },

  specToNodes: (spec) => {
    if (!spec || typeof spec !== "object") return { nodes: [], edges: [] };

    const nodeSpecs: NodeSpec[] = Array.isArray((spec as any).nodes)
      ? ((spec as any).nodes as NodeSpec[])
      : [];

    const nodes: EditorNode[] = nodeSpecs.map((ns) => {
      const data: Record<string, any> = {};
      if (ns.params && typeof ns.params === "object") {
        data.params = { ...ns.params };
        if (typeof data.params.path === "string") {
          data.params.path = data.params.path.trim();
        }
      }
      if (ns.output_shapes && typeof ns.output_shapes === "object") {
        data.output_shapes = { ...ns.output_shapes };
      }
      if (
        ns.input_defaults &&
        typeof ns.input_defaults === "object" &&
        ns.input_defaults !== null
      ) {
        const defaults: Record<string, InputDefaultEntry> = {};
        Object.entries(ns.input_defaults as Record<string, unknown>).forEach(
          ([inputId, entry]) => {
            const normalized = normalizeInputDefaultEntry(entry);
            if (normalized) {
              defaults[inputId] = normalized;
            }
          },
        );
        if (Object.keys(defaults).length > 0) {
          data.input_defaults = defaults;
        }
      }
      data.inputs = [];
      return {
        id: String(ns.id),
        type: String(ns.type),
        position: { x: 0, y: 0 },
        data,
      } as EditorNode;
    });

    const nodeMap = new Map<string, EditorNode>();
    nodes.forEach((node) => nodeMap.set(node.id, node));

    const edges: EditorEdge[] = [];
    const registerInput = (
      targetId: string,
      entry: {
        portId: string;
        sourceNodeId?: string | null;
        sourceOutputKey?: string | null;
        selector?: string | null;
      },
    ) => {
      const node = nodeMap.get(targetId);
      if (!node) return;
      const current = Array.isArray(node.data.inputs)
        ? (node.data.inputs as any[])
        : [];
      current.push(entry);
      node.data.inputs = current;
    };

    const pushEdge = (
      sourceId: string,
      outputKey: string,
      targetId: string,
      inputKey: string,
      selectorSegments?: SelectorSegmentJSON[],
    ) => {
      const selectorText = formatSelectorText(selectorSegments);
      const edge: EditorEdge = {
        id: `e_${sourceId}_${outputKey}_${targetId}_${inputKey}_${edges.length}`,
        source: sourceId,
        target: targetId,
        sourceHandle: outputKey !== "out" ? outputKey : undefined,
        targetHandle: inputKey,
        data: selectorText ? { selector: selectorText } : undefined,
      } as EditorEdge;
      edges.push(edge);
      registerInput(targetId, {
        portId: inputKey,
        sourceNodeId: sourceId,
        sourceOutputKey: outputKey,
        selector: selectorText || null,
      });
    };

    const graphEdges = Array.isArray((spec as any).edges)
      ? ((spec as any).edges as Array<{
          from?: { node_id?: string; output?: string };
          to?: { node_id?: string; input?: string };
          selector?: unknown;
        }>)
      : [];
    if (graphEdges.length > 0) {
      graphEdges.forEach((edgeLike) => {
        if (!edgeLike || typeof edgeLike !== "object") return;
        const fromNodeId = edgeLike.from?.node_id;
        const toNodeId = edgeLike.to?.node_id;
        const inputKey = edgeLike.to?.input ?? "in";
        if (!fromNodeId || !toNodeId) return;
        const outputKey =
          typeof edgeLike.from?.output === "string" &&
          edgeLike.from.output.length > 0
            ? edgeLike.from.output
            : "out";
        const selectorSegments = Array.isArray(edgeLike.selector)
          ? (edgeLike.selector as SelectorSegmentJSON[])
          : undefined;
        pushEdge(
          String(fromNodeId),
          String(outputKey),
          String(toNodeId),
          String(inputKey),
          selectorSegments,
        );
      });
    } else {
      // Legacy support: NodeSpec.inputs map
      nodeSpecs.forEach((ns) => {
        const inputs = (ns as any).inputs as
          | Record<string, { node_id: string; output_key?: string }>
          | undefined;
        if (!inputs) return;
        Object.entries(inputs).forEach(([inputKey, conn]) => {
          if (!conn || !conn.node_id) return;
          const outputKey =
            conn.output_key && typeof conn.output_key === "string"
              ? conn.output_key
              : "out";
          pushEdge(
            String(conn.node_id),
            String(outputKey),
            String(ns.id),
            String(inputKey),
          );
        });
      });
    }

    nodes.forEach((node) => {
      if (!Array.isArray(node.data.inputs)) {
        node.data.inputs = [];
      }
    });

    return { nodes, edges };
  },
}));

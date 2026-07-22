import { create } from "zustand";
import type { Edge, Node } from "reactflow";
import type {
  GraphSpec,
  NodeSpec,
  NodeParams,
  ValueJSON,
} from "@vizij/node-graph";

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
  arrangeNodes: () => void;
  setSpec: (
    spec:
      | GraphSpec
      | { graph: GraphSpec; layout?: Record<string, { x: number; y: number }> }
      | null,
  ) => void;
  reset: () => void;
  variadicPortGroups: VariadicPortGroups;
  setVariadicPortGroups: (groups: VariadicPortGroups) => void;
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

type VariadicPortGroups = Record<string, string | null>;

const VARIADIC_DELIM = "_";
const CANONICAL_VARIADIC_REGEX = /^(.*)_([0-9]+)$/;
const LEGACY_VARIADIC_REGEX = /^(.*)::([0-9]+)$/;

function formatVariadicPortId(groupId: string, index: number): string {
  return `${groupId}${VARIADIC_DELIM}${index}`;
}

export function parseVariadicPortId(
  portId: string,
): { groupId: string; index: number } | null {
  if (typeof portId !== "string") return null;
  const canonicalMatch = portId.match(CANONICAL_VARIADIC_REGEX);
  if (canonicalMatch) {
    const index = Number(canonicalMatch[2]);
    if (Number.isFinite(index)) {
      return { groupId: canonicalMatch[1], index };
    }
  }
  const legacyMatch = portId.match(LEGACY_VARIADIC_REGEX);
  if (legacyMatch) {
    const index = Number(legacyMatch[2]);
    if (Number.isFinite(index)) {
      return { groupId: legacyMatch[1], index };
    }
  }
  return null;
}

function deriveVariadicIds(
  nodeId: string,
  rawPortId: string,
  edgeCounts: Record<string, number>,
  edgeIndices: Record<string, number>,
): { portId: string; basePortId: string } {
  const canonical = rawPortId.match(CANONICAL_VARIADIC_REGEX);
  if (canonical) {
    const baseId = canonical[1];
    const index = Number(canonical[2]);
    if (Number.isFinite(index)) {
      const key = `${nodeId}${VARIADIC_DELIM}${baseId}`;
      edgeIndices[key] = Math.max(edgeIndices[key] ?? -1, index);
      return {
        portId: formatVariadicPortId(baseId, index),
        basePortId: baseId,
      };
    }
  }
  const legacy = rawPortId.match(LEGACY_VARIADIC_REGEX);
  if (legacy) {
    const baseId = legacy[1];
    const index = Number(legacy[2]);
    if (Number.isFinite(index)) {
      const key = `${nodeId}${VARIADIC_DELIM}${baseId}`;
      edgeIndices[key] = Math.max(edgeIndices[key] ?? -1, index);
      return {
        portId: formatVariadicPortId(baseId, index),
        basePortId: baseId,
      };
    }
  }
  return { portId: rawPortId, basePortId: rawPortId };
}

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

function compareInputEntries(a: any, b: any): number {
  const portA = String(a?.portId ?? "");
  const portB = String(b?.portId ?? "");
  const baseA = String(a?.basePortId ?? portA);
  const baseB = String(b?.basePortId ?? portB);
  const parsedA = parseVariadicPortId(portA);
  const parsedB = parseVariadicPortId(portB);

  if (parsedA && parsedB) {
    if (parsedA.groupId === parsedB.groupId) {
      return parsedA.index - parsedB.index;
    }
    return parsedA.groupId.localeCompare(parsedB.groupId);
  }
  if (parsedA && !parsedB) return 1;
  if (!parsedA && parsedB) return -1;
  const baseCompare = baseA.localeCompare(baseB);
  if (baseCompare !== 0) return baseCompare;
  return portA.localeCompare(portB);
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
  arrangeNodes: () => {
    const { nodes, edges, setNodes } = get();
    if (!Array.isArray(nodes) || nodes.length === 0) return;

    const nodeMap = new Map<string, EditorNode>();
    nodes.forEach((node) => {
      nodeMap.set(String(node.id), node);
    });

    const adjacency = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    nodeMap.forEach((_node, id) => {
      adjacency.set(id, new Set());
      incoming.set(id, new Set());
    });

    edges.forEach((edge) => {
      const sourceId = String(edge.source);
      const targetId = String(edge.target);
      if (!nodeMap.has(sourceId) || !nodeMap.has(targetId)) return;
      if (sourceId === targetId) return; // ignore self loops for layout
      adjacency.get(sourceId)!.add(targetId);
      incoming.get(targetId)!.add(sourceId);
    });

    const indegree = new Map<string, number>();
    nodeMap.forEach((_node, id) => {
      indegree.set(id, incoming.get(id)?.size ?? 0);
    });

    const queue: EditorNode[] = [];
    nodeMap.forEach((node, id) => {
      if ((indegree.get(id) ?? 0) === 0) {
        queue.push(node);
      }
    });
    queue.sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

    const order: string[] = [];
    const indegreeMutable = new Map(indegree);
    const enqueued = new Set<string>(queue.map((node) => String(node.id)));

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(String(current.id));

      const neighbors = adjacency.get(String(current.id));
      if (!neighbors) continue;
      neighbors.forEach((neighborId) => {
        if (!indegreeMutable.has(neighborId)) return;
        const next = (indegreeMutable.get(neighborId) ?? 0) - 1;
        indegreeMutable.set(neighborId, next);
        if (next === 0 && !enqueued.has(neighborId)) {
          const neighborNode = nodeMap.get(neighborId);
          if (neighborNode) {
            queue.push(neighborNode);
            enqueued.add(neighborId);
            queue.sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));
          }
        }
      });
    }

    const seen = new Set(order);
    if (order.length < nodes.length) {
      nodes.forEach((node) => {
        const nodeId = String(node.id);
        if (!seen.has(nodeId)) {
          order.push(nodeId);
          seen.add(nodeId);
        }
      });
    }

    const layerMap = new Map<string, number>();
    order.forEach((id) => {
      const parents = incoming.get(id);
      if (!parents || parents.size === 0) {
        layerMap.set(id, 0);
        return;
      }
      let best = 0;
      parents.forEach((parentId) => {
        const parentLayer = layerMap.get(parentId);
        if (parentLayer != null) {
          best = Math.max(best, parentLayer + 1);
        } else {
          best = Math.max(best, 1);
        }
      });
      layerMap.set(id, best);
    });

    const layers = new Map<number, string[]>();
    order.forEach((id) => {
      const layerIdx = layerMap.get(id) ?? 0;
      if (!layers.has(layerIdx)) layers.set(layerIdx, []);
      layers.get(layerIdx)!.push(id);
    });

    const columnSpacing = 320;
    const rowSpacing = 140;
    const horizontalMargin = 80;
    const verticalMargin = 60;

    const positions = new Map<string, { x: number; y: number }>();
    Array.from(layers.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([layerIdx, ids]) => {
        ids.sort((aId, bId) => {
          const nodeA = nodeMap.get(aId);
          const nodeB = nodeMap.get(bId);
          return (nodeA?.position?.y ?? 0) - (nodeB?.position?.y ?? 0);
        });
        ids.forEach((nodeId, idx) => {
          const x = horizontalMargin + layerIdx * columnSpacing;
          const y = verticalMargin + idx * rowSpacing;
          positions.set(nodeId, { x, y });
        });
      });

    setNodes((prev) =>
      prev.map((node) => {
        const nodeId = String(node.id);
        const targetPos = positions.get(nodeId);
        if (!targetPos) return node;
        return {
          ...node,
          position: targetPos,
          positionAbsolute: undefined,
        };
      }),
    );
  },
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
  variadicPortGroups: {},
  setVariadicPortGroups: (groups) =>
    set((state) => {
      const current = state.variadicPortGroups ?? {};
      const next: VariadicPortGroups = { ...groups };
      const allKeys = new Set([...Object.keys(current), ...Object.keys(next)]);
      let changed = false;
      for (const key of allKeys) {
        if ((current[key] ?? null) !== (next[key] ?? null)) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        return {};
      }
      return {
        variadicPortGroups: next,
      };
    }),

  // Canonical GraphSpec builder using explicit edges and input defaults.
  nodesToSpec: (nodes, edges) => {
    const nodeMap = new Map<string, EditorNode>();
    nodes.forEach((node) => nodeMap.set(String(node.id), node));

    const graphNodes: NodeSpec[] = nodes.map((n) => {
      const originalType =
        typeof n.data?.originalType === "string" &&
        n.data.originalType.trim().length > 0
          ? n.data.originalType.trim()
          : null;
      const fallbackType =
        typeof n.type === "string" && n.type.trim().length > 0
          ? n.type.trim()
          : "";
      const type = (originalType ?? fallbackType) as any;

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
      handleId: string,
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
        const candidatePort = String(entry.portId ?? "");
        const candidateBase = String(entry.basePortId ?? candidatePort);
        const srcId = String(entry.sourceNodeId ?? "");
        const srcOut = String(entry.sourceOutputKey ?? "out");
        return (
          (candidatePort === handleId || candidateBase === handleId) &&
          srcId === sourceId &&
          srcOut === outputKey
        );
      });
      const selector = match?.selector;
      return typeof selector === "string" ? selector : undefined;
    };

    edges.forEach((edge) => {
      if (!edge.source || !edge.target) return;
      const fromNodeId = String(edge.source);
      const toNodeId = String(edge.target);
      const inputKey = String(edge.targetHandle ?? "in");
      const outputKey = edge.sourceHandle ? String(edge.sourceHandle) : "out";

      const selectorText =
        (edge.data as any)?.selector ??
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
      specEdges!.push(specEdge);
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
      const rawType =
        (ns as any).type ??
        (ns as any).kind ??
        (typeof (ns as any).type === "string"
          ? (ns as any).type
          : (ns as any).kind);
      const normalizedType = String(rawType ?? "").toLowerCase();

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
      if (rawType && typeof rawType === "string") {
        data.originalType = rawType;
      }

      return {
        id: String(ns.id),
        type: normalizedType || "",
        position: { x: 0, y: 0 },
        data,
      } as EditorNode;
    });

    const nodeMap = new Map<string, EditorNode>();
    nodes.forEach((node) => nodeMap.set(node.id, node));

    const variadicGroupsByType = get().variadicPortGroups ?? {};
    const canonicalGroupByNodeId = new Map<string, string | null>();
    nodes.forEach((node) => {
      const typeKey = String(node.type ?? "").toLowerCase();
      const canonical = variadicGroupsByType[typeKey] ?? null;
      canonicalGroupByNodeId.set(node.id, canonical ?? null);
    });
    const variadicAliasesByNode = new Map<string, Set<string>>();
    const variadicIndexTracker = new Map<string, number>();

    const getVariadicInfo = (value: string | null | undefined) => {
      if (!value) return null;
      const parsed = parseVariadicPortId(String(value));
      if (parsed) {
        return {
          alias: parsed.groupId,
          index: Number.isFinite(parsed.index) ? parsed.index : null,
        };
      }
      return null;
    };

    const canonicalizeVariadicIds = (
      targetId: string,
      rawInputId: string,
      current: { portId: string; basePortId: string },
    ): { portId: string; basePortId: string } => {
      const { portId, basePortId } = current;
      const canonicalGroup = canonicalGroupByNodeId.get(targetId) ?? null;
      if (!canonicalGroup) {
        return { portId, basePortId };
      }

      let aliasSet = variadicAliasesByNode.get(targetId);
      if (!aliasSet) {
        aliasSet = new Set<string>();
        aliasSet.add(canonicalGroup);
        variadicAliasesByNode.set(targetId, aliasSet);
      }

      const infoFromInput = getVariadicInfo(rawInputId);
      const infoFromPort = getVariadicInfo(portId);
      let aliasCandidate =
        infoFromInput?.alias ??
        infoFromPort?.alias ??
        (basePortId ? String(basePortId) : null);

      if (!aliasCandidate && canonicalGroup === rawInputId) {
        aliasCandidate = canonicalGroup;
      }

      let treatAsVariadic = false;

      if (aliasCandidate === canonicalGroup) {
        treatAsVariadic = true;
      } else if (aliasCandidate && aliasSet.has(aliasCandidate)) {
        treatAsVariadic = true;
      } else if (
        aliasCandidate &&
        (infoFromInput != null || infoFromPort != null)
      ) {
        aliasSet.add(aliasCandidate);
        treatAsVariadic = true;
      } else if (
        !aliasCandidate &&
        (basePortId === canonicalGroup || rawInputId === canonicalGroup)
      ) {
        aliasCandidate = canonicalGroup;
        treatAsVariadic = true;
      }

      if (!treatAsVariadic) {
        return { portId, basePortId };
      }

      if (aliasCandidate) {
        aliasSet.add(aliasCandidate);
      }

      const trackerKey = `${targetId}${VARIADIC_DELIM}${canonicalGroup}`;
      const resolvedIndex = variadicIndexTracker.get(trackerKey) ?? 0;
      variadicIndexTracker.set(trackerKey, resolvedIndex + 1);

      return {
        portId: formatVariadicPortId(canonicalGroup, resolvedIndex),
        basePortId: canonicalGroup,
      };
    };

    const edges: EditorEdge[] = [];
    const registerInput = (
      targetId: string,
      entry: {
        portId: string;
        basePortId: string;
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
      current.sort(compareInputEntries);
      node.data.inputs = current;
    };

    const pushEdge = (
      sourceId: string,
      outputKey: string,
      targetId: string,
      portId: string,
      basePortId: string,
      selectorSegments?: SelectorSegmentJSON[],
    ) => {
      const selectorText = formatSelectorText(selectorSegments);
      const edge: EditorEdge = {
        id: `e_${sourceId}_${outputKey}_${targetId}_${portId}_${edges.length}`,
        source: sourceId,
        target: targetId,
        sourceHandle: outputKey !== "out" ? outputKey : undefined,
        targetHandle: portId,
        data: selectorText ? { selector: selectorText } : undefined,
      } as EditorEdge;
      edges.push(edge);
      registerInput(targetId, {
        portId,
        basePortId,
        sourceNodeId: sourceId,
        sourceOutputKey: outputKey,
        selector: selectorText || null,
      });
    };

    const edgeCounts: Record<string, number> = {};
    const edgeIndices: Record<string, number> = {};

    const graphEdges = Array.isArray((spec as any).edges)
      ? ((spec as any).edges as any[])
      : [];
    if (graphEdges.length > 0) {
      graphEdges.forEach((edgeLike) => {
        if (!edgeLike || typeof edgeLike !== "object") return;
        // const fromNodeId = edgeLike.from?.node_id;
        const toNodeId = edgeLike.to?.node_id;
        const inputKey = edgeLike.to?.input ?? "in";
        const key = `${toNodeId}${VARIADIC_DELIM}${inputKey}`;
        edgeCounts[key] = (edgeCounts[key] ?? 0) + 1;
        const parsedInput = parseVariadicPortId(String(inputKey));
        if (parsedInput) {
          const baseKey = `${toNodeId}${VARIADIC_DELIM}${parsedInput.groupId}`;
          edgeCounts[baseKey] = (edgeCounts[baseKey] ?? 0) + 1;
        }
      });
    }
    if (graphEdges.length > 0) {
      graphEdges.forEach((edge) => {
        if (!edge || typeof edge !== "object") return;
        const toNodeId = edge.to?.node_id;
        if (!toNodeId) return;
        const inputKey = edge.to?.input ?? "in";
        const key = `${toNodeId}${VARIADIC_DELIM}${inputKey}`;
        edgeCounts[key] = (edgeCounts[key] ?? 0) + 1;
        const parsedInput = parseVariadicPortId(String(inputKey));
        if (parsedInput) {
          const baseKey = `${toNodeId}${VARIADIC_DELIM}${parsedInput.groupId}`;
          edgeCounts[baseKey] = (edgeCounts[baseKey] ?? 0) + 1;
        }
      });

      graphEdges.forEach((edge) => {
        if (!edge || typeof edge !== "object") return;
        const fromNodeId = edge.from?.node_id;
        const toNodeId = edge.to?.node_id;
        const inputKey = edge.to?.input ?? "in";
        if (!fromNodeId || !toNodeId) return;
        const outputKey =
          typeof edge.from?.output === "string" && edge.from.output.length > 0
            ? edge.from.output
            : "out";
        const selectorSegments = Array.isArray(edge.selector)
          ? (edge.selector as SelectorSegmentJSON[])
          : undefined;

        let { portId, basePortId } = deriveVariadicIds(
          String(toNodeId),
          String(inputKey),
          edgeCounts,
          edgeIndices,
        );
        if (portId === inputKey) {
          const key = `${toNodeId}${VARIADIC_DELIM}${inputKey}`;
          const total = edgeCounts[key] ?? 0;
          const canonicalGroupForTarget =
            canonicalGroupByNodeId.get(String(toNodeId)) ?? null;
          const parsedInput = parseVariadicPortId(String(inputKey));
          if (total > 1 && (parsedInput || canonicalGroupForTarget)) {
            const index = edgeIndices[key] ?? 0;
            edgeIndices[key] = index + 1;
            portId = formatVariadicPortId(String(inputKey), index);
            basePortId = String(inputKey);
          }
        }

        ({ portId, basePortId } = canonicalizeVariadicIds(
          String(toNodeId),
          String(inputKey),
          { portId, basePortId },
        ));

        pushEdge(
          String(fromNodeId),
          String(outputKey),
          String(toNodeId),
          portId,
          basePortId,
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

        Object.entries(inputs).forEach(([inputKey]) => {
          const rawKey = `${String(ns.id)}${VARIADIC_DELIM}${inputKey}`;
          edgeCounts[rawKey] = (edgeCounts[rawKey] ?? 0) + 1;
          const parsedInput = parseVariadicPortId(String(inputKey));
          if (parsedInput) {
            const baseKey = `${String(ns.id)}${VARIADIC_DELIM}${parsedInput.groupId}`;
            edgeCounts[baseKey] = (edgeCounts[baseKey] ?? 0) + 1;
          }
        });

        Object.entries(inputs).forEach(([inputKey, conn]) => {
          if (!conn || !conn.node_id) return;
          const outputKey =
            conn.output_key && typeof conn.output_key === "string"
              ? conn.output_key
              : "out";
          let { portId, basePortId } = deriveVariadicIds(
            String(ns.id),
            String(inputKey),
            edgeCounts,
            edgeIndices,
          );
          if (portId === inputKey) {
            const key = `${String(ns.id)}${VARIADIC_DELIM}${inputKey}`;
            const total = edgeCounts[key] ?? 0;
            if (total > 1) {
              const index = edgeIndices[key] ?? 0;
              edgeIndices[key] = index + 1;
              portId = formatVariadicPortId(String(inputKey), index);
              basePortId = String(inputKey);
            }
          }

          ({ portId, basePortId } = canonicalizeVariadicIds(
            String(ns.id),
            String(inputKey),
            { portId, basePortId },
          ));

          pushEdge(
            String(conn.node_id),
            String(outputKey),
            String(ns.id),
            portId,
            basePortId,
          );
        });
      });
    }
    nodes.forEach((node) => {
      if (!Array.isArray(node.data.inputs)) {
        node.data.inputs = [];
      } else {
        node.data.inputs = [...node.data.inputs].sort(compareInputEntries);
      }
    });

    return { nodes, edges };
  },
}));

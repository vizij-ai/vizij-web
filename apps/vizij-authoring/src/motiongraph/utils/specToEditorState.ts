import type { EditorNode, EditorEdge } from "../store/useEditorStore";
import {
  OUTPUT_TARGET_TYPE,
  OUTPUT_TARGET_PORT_ID,
} from "../components/OutputTargetNode";
import {
  INPUT_SOURCE_TYPE,
  INPUT_SOURCE_PORT_ID,
} from "../components/InputSourceNode";

/* ── Spec types (mirror buildGraphSpec.ts) ────────────────────────── */

interface SpecNode {
  id: string;
  type: string;
  params?: Record<string, unknown>;
}

interface SpecEdge {
  from: { node_id: string; output?: string };
  to: { node_id: string; input: string };
}

/* ── Result ────────────────────────────────────────────────────────── */

export interface SpecToEditorResult {
  nodes: EditorNode[];
  edges: EditorEdge[];
  enabledOutputs: Set<string>;
  enabledInputs: Set<string>;
  customInputPaths: string[];
}

/* ── Conversion ───────────────────────────────────────────────────── */

const EMPTY: SpecToEditorResult = {
  nodes: [],
  edges: [],
  enabledOutputs: new Set(),
  enabledInputs: new Set(),
  customInputPaths: [],
};

/**
 * Convert a bundle graph spec (as stored in `VizijBundleGraphEntry.spec`)
 * back into ReactFlow editor state so the MotionGraph panel can display it.
 *
 * Positions are auto-laid-out since the spec format does not store them.
 */
export function specToEditorState(
  spec: Record<string, unknown> | null | undefined,
): SpecToEditorResult {
  if (!spec) return EMPTY;

  const specNodes: SpecNode[] = Array.isArray(spec.nodes) ? spec.nodes : [];
  const specEdges: SpecEdge[] = Array.isArray(spec.edges) ? spec.edges : [];

  if (specNodes.length === 0) return EMPTY;

  // ── 1. Identify synthetic constant nodes (__const_{nodeId}_{portId}) ──

  const syntheticConstIds = new Set<string>();
  for (const node of specNodes) {
    if (node.type === "constant" && node.id.startsWith("__const_")) {
      syntheticConstIds.add(node.id);
    }
  }

  // Map synthetic const → { targetNodeId, portId, value } using edges
  const inputDefaultsByTarget = new Map<string, Record<string, unknown>>();
  for (const edge of specEdges) {
    if (!syntheticConstIds.has(edge.from.node_id)) continue;
    const constNode = specNodes.find((n) => n.id === edge.from.node_id);
    if (!constNode) continue;

    let defaults = inputDefaultsByTarget.get(edge.to.node_id);
    if (!defaults) {
      defaults = {};
      inputDefaultsByTarget.set(edge.to.node_id, defaults);
    }
    defaults[edge.to.input] = constNode.params?.value;
  }

  // ── 2. Build editor nodes ─────────────────────────────────────────

  const editorNodes: EditorNode[] = [];
  const enabledOutputs = new Set<string>();
  const enabledInputs = new Set<string>();
  const customInputPaths: string[] = [];

  for (const sn of specNodes) {
    if (syntheticConstIds.has(sn.id)) continue;

    if (sn.type === "output") {
      const path = (sn.params?.path as string) ?? "";
      enabledOutputs.add(path);
      const label =
        path.replace(/^rig\/[^/]+\/standard\//, "").replace(/\//g, ".") || path;
      editorNodes.push({
        id: sn.id,
        type: OUTPUT_TARGET_TYPE,
        position: { x: 0, y: 0 },
        selectable: true,
        deletable: false,
        data: { outputPath: path, label },
      });
    } else if (sn.type === "input") {
      const path = (sn.params?.path as string) ?? "";
      enabledInputs.add(path);
      customInputPaths.push(path);
      const label = path.split("/").pop() || path;
      editorNodes.push({
        id: sn.id,
        type: INPUT_SOURCE_TYPE,
        position: { x: 0, y: 0 },
        selectable: true,
        deletable: false,
        data: { inputPath: path, label },
      });
    } else {
      const defaults = inputDefaultsByTarget.get(sn.id);
      editorNodes.push({
        id: sn.id,
        type: sn.type,
        position: { x: 0, y: 0 },
        data: {
          label: sn.type,
          originalType: sn.type,
          params: sn.params ? { ...sn.params } : {},
          ...(defaults ? { inputDefaults: defaults } : {}),
        },
      });
    }
  }

  // ── 3. Build editor edges (skip synthetic-constant edges) ─────────

  const editorNodeTypes = new Map(editorNodes.map((n) => [n.id, n.type]));
  const editorEdges: EditorEdge[] = [];

  for (const se of specEdges) {
    if (syntheticConstIds.has(se.from.node_id)) continue;
    if (syntheticConstIds.has(se.to.node_id)) continue;
    // Skip edges whose nodes were not included
    if (!editorNodeTypes.has(se.from.node_id)) continue;
    if (!editorNodeTypes.has(se.to.node_id)) continue;

    // Translate handle names back to editor conventions
    const targetType = editorNodeTypes.get(se.to.node_id);
    let targetHandle = se.to.input;
    if (targetType === OUTPUT_TARGET_TYPE && targetHandle === "in") {
      targetHandle = OUTPUT_TARGET_PORT_ID;
    }

    const sourceType = editorNodeTypes.get(se.from.node_id);
    let sourceHandle: string | undefined = se.from.output;
    if (sourceType === INPUT_SOURCE_TYPE && sourceHandle === "out") {
      sourceHandle = INPUT_SOURCE_PORT_ID;
    }
    // "out" is the default — ReactFlow uses undefined for default handles
    if (sourceHandle === "out") sourceHandle = undefined;

    editorEdges.push({
      id: `e-${se.from.node_id}-${se.to.node_id}-${sourceHandle ?? "out"}-${targetHandle}`,
      source: se.from.node_id,
      target: se.to.node_id,
      sourceHandle: sourceHandle ?? undefined,
      targetHandle,
    });
  }

  // ── 4. Infer variadicInputCount from connected handles ────────────

  for (const edge of editorEdges) {
    const match = /^(.+)_(\d+)$/.exec(edge.targetHandle ?? "");
    if (!match) continue;
    const node = editorNodes.find((n) => n.id === edge.target);
    if (
      !node ||
      node.type === OUTPUT_TARGET_TYPE ||
      node.type === INPUT_SOURCE_TYPE
    )
      continue;
    const idx = parseInt(match[2], 10);
    const current = (node.data?.variadicInputCount as number) ?? 0;
    if (idx + 1 > current) {
      node.data = { ...node.data, variadicInputCount: idx + 1 };
    }
  }

  for (const node of editorNodes) {
    if (
      node.type === OUTPUT_TARGET_TYPE ||
      node.type === INPUT_SOURCE_TYPE ||
      !node.data?.inputDefaults ||
      typeof node.data.inputDefaults !== "object"
    ) {
      continue;
    }
    Object.keys(node.data.inputDefaults as Record<string, unknown>).forEach(
      (portId) => {
        const match = /^(.+)_(\d+)$/.exec(portId);
        if (!match) return;
        const idx = parseInt(match[2], 10);
        const current = (node.data?.variadicInputCount as number) ?? 0;
        if (idx + 1 > current) {
          node.data = { ...node.data, variadicInputCount: idx + 1 };
        }
      },
    );
  }

  // ── 4b. Infer variadicOutputCount from connected handles ─────────

  for (const edge of editorEdges) {
    const match = /^(.+)_(\d+)$/.exec(edge.sourceHandle ?? "");
    if (!match) continue;
    const node = editorNodes.find((n) => n.id === edge.source);
    if (
      !node ||
      node.type === OUTPUT_TARGET_TYPE ||
      node.type === INPUT_SOURCE_TYPE
    )
      continue;
    const idx = parseInt(match[2], 10);
    const current = (node.data?.variadicOutputCount as number) ?? 0;
    if (idx + 1 > current) {
      node.data = { ...node.data, variadicOutputCount: idx + 1 };
    }
  }

  // ── 5. Restore saved layout or fall back to auto-layout ──────────

  const layout = spec.layout as
    | Record<string, { x: number; y: number }>
    | undefined;

  if (layout && typeof layout === "object") {
    let hasAnyPosition = false;
    for (const node of editorNodes) {
      const pos = layout[node.id];
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        node.position = { x: pos.x, y: pos.y };
        hasAnyPosition = true;
      }
    }
    // If some nodes had no saved position (e.g. added after the layout was
    // saved), fall back to auto-layout for the entire graph so it stays
    // consistent.
    if (!hasAnyPosition) {
      applyAutoLayout(editorNodes, editorEdges);
    }
  } else {
    applyAutoLayout(editorNodes, editorEdges);
  }

  return {
    nodes: editorNodes,
    edges: editorEdges,
    enabledOutputs,
    enabledInputs,
    customInputPaths: [...new Set(customInputPaths)],
  };
}

/* ── Auto-layout (simple topological column-based) ────────────────── */

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;
const H_GAP = 100;
const V_GAP = 40;

function applyAutoLayout(nodes: EditorNode[], edges: EditorEdge[]): void {
  if (nodes.length === 0) return;

  // Build adjacency for topological sort
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // Kahn's algorithm for layer assignment
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const layers: string[][] = [];
  while (queue.length > 0) {
    const batch = [...queue];
    queue.length = 0;
    layers.push(batch);
    for (const id of batch) {
      for (const next of adj.get(id) ?? []) {
        const deg = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, deg);
        if (deg === 0) queue.push(next);
      }
    }
  }

  // Place any remaining nodes (cycles — unlikely but safe)
  const placed = new Set(layers.flat());
  const unplaced = nodes.filter((n) => !placed.has(n.id));
  if (unplaced.length > 0) {
    layers.push(unplaced.map((n) => n.id));
  }

  // Assign positions
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    for (let row = 0; row < layer.length; row++) {
      const node = nodeMap.get(layer[row]);
      if (node) {
        node.position = {
          x: col * (NODE_WIDTH + H_GAP),
          y: row * (NODE_HEIGHT + V_GAP),
        };
      }
    }
  }
}

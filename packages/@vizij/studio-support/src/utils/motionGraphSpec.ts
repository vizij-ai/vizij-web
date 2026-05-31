import type { VizijProgramAsset } from "../types";

export const MOTION_GRAPH_OUTPUT_TARGET_TYPE = "__output_target" as const;
export const MOTION_GRAPH_OUTPUT_TARGET_PORT_ID = "input";
export const MOTION_GRAPH_INPUT_SOURCE_TYPE = "__input_source" as const;
export const MOTION_GRAPH_INPUT_SOURCE_PORT_ID = "output";

export interface MotionGraphEditorNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  selectable?: boolean;
  deletable?: boolean;
  data: Record<string, any>;
}

export interface MotionGraphEditorEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/* ── Spec types (match orchestrator-wasm GraphSpec format) ──────── */

export interface MotionGraphSpecNode {
  id: string;
  type: string;
  params?: Record<string, unknown>;
}

export interface MotionGraphSpecEdge {
  from: { node_id: string; output?: string };
  to: { node_id: string; input: string };
}

export interface BuiltGraphSpec {
  spec: {
    nodes: MotionGraphSpecNode[];
    edges: MotionGraphSpecEdge[];
    layout?: Record<string, { x: number; y: number }>;
  };
  /** Namespaced output paths written by this graph. */
  outputPaths: string[];
  /** Namespaced input paths read by this graph (from Input nodes). */
  inputPaths: string[];
  /** True when at least one output target has an incoming edge. */
  hasConnectedOutputs: boolean;
}

export interface BuildMotionGraphProgramAssetOptions {
  id: string;
  label?: string;
  nodes: MotionGraphEditorNode[];
  edges: MotionGraphEditorEdge[];
  resetValues?: Record<string, number>;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/**
 * Coerce param values to their most likely JS type.
 * The inspector may store numeric values as strings (e.g. "1" from an
 * `<input type="text">`). WASM expects actual numbers, not strings.
 */
function coerceParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);
      if (!isNaN(num)) {
        result[key] = num;
        continue;
      }
    }
    result[key] = value;
  }
  return result;
}

/**
 * Translate the editor's target handle ID to the WASM port name.
 * OutputTargetNode uses `"input"` as its handle, but the WASM
 * `output` node expects the port to be called `"in"`.
 */
function translateTargetHandle(
  targetNodeType: string | undefined,
  handle: string | null | undefined,
): string {
  if (
    targetNodeType === MOTION_GRAPH_OUTPUT_TARGET_TYPE &&
    handle === MOTION_GRAPH_OUTPUT_TARGET_PORT_ID
  ) {
    return "in";
  }
  return handle ?? "in";
}

/**
 * Translate the editor's source handle ID to the WASM port name.
 * InputSourceNode uses `"output"` as its handle, but the WASM
 * `input` node expects the port to be called `"out"`.
 */
function translateSourceHandle(
  sourceNodeType: string | undefined,
  handle: string | null | undefined,
): string {
  if (
    sourceNodeType === MOTION_GRAPH_INPUT_SOURCE_TYPE &&
    handle === MOTION_GRAPH_INPUT_SOURCE_PORT_ID
  ) {
    return "out";
  }
  return handle ?? "out";
}

/** Resolve the WASM node type from an editor node. */
function resolveNodeType(node: MotionGraphEditorNode): string | null {
  const t =
    (node.data?.originalType as string) ?? (node.type as string) ?? null;
  return t || null;
}

/* ── Core builder ────────────────────────────────────────────────── */

function buildGraphSpecInternal(
  nodes: MotionGraphEditorNode[],
  edges: MotionGraphEditorEdge[],
  namespace: string | null,
): BuiltGraphSpec {
  // 1. Find output targets that have at least one incoming edge.
  const connectedTargetIds = new Set<string>();
  for (const edge of edges) {
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (targetNode?.type === MOTION_GRAPH_OUTPUT_TARGET_TYPE) {
      connectedTargetIds.add(edge.target);
    }
  }

  // 2. Walk backwards from connected output targets to find all reachable nodes.
  //    Only reachable nodes are included in the spec so that unconnected nodes
  //    (e.g. a freshly dropped Clamp) don't trigger evaluation errors.
  const reachableIds = new Set<string>(connectedTargetIds);
  {
    // Build a reverse adjacency list: target → sources
    const reverseAdj = new Map<string, string[]>();
    for (const edge of edges) {
      let sources = reverseAdj.get(edge.target);
      if (!sources) {
        sources = [];
        reverseAdj.set(edge.target, sources);
      }
      sources.push(edge.source);
    }
    // BFS backwards from connected output targets
    const queue = Array.from(connectedTargetIds);
    while (queue.length > 0) {
      const current = queue.pop()!;
      const sources = reverseAdj.get(current);
      if (!sources) continue;
      for (const src of sources) {
        if (!reachableIds.has(src)) {
          reachableIds.add(src);
          queue.push(src);
        }
      }
    }
  }

  // 3. Build spec nodes (only reachable ones).
  const specNodes: MotionGraphSpecNode[] = [];
  const specNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!reachableIds.has(node.id)) continue;

    if (node.type === MOTION_GRAPH_OUTPUT_TARGET_TYPE) {
      const outputPath = node.data?.outputPath as string | undefined;
      if (!outputPath) continue;

      // outputPath is the full rig spec Input node path
      // (e.g. "rig/quori_latest/standard/vizij/mouth/morph/jaw_open").
      // Prepending the namespace makes it match the namespaced WASM path.
      const path = namespace ? `${namespace}/${outputPath}` : outputPath;
      specNodes.push({
        id: node.id,
        type: "output",
        params: { path },
      });
      specNodeIds.add(node.id);
    } else if (node.type === MOTION_GRAPH_INPUT_SOURCE_TYPE) {
      const inputPath = node.data?.inputPath as string | undefined;
      if (!inputPath) continue;

      const path = namespace ? `${namespace}/${inputPath}` : inputPath;
      specNodes.push({
        id: node.id,
        type: "input",
        params: { path },
      });
      specNodeIds.add(node.id);
    } else {
      const type = resolveNodeType(node);
      if (!type) continue;

      const rawParams = node.data?.params as
        | Record<string, unknown>
        | undefined;
      const params =
        rawParams && Object.keys(rawParams).length > 0
          ? coerceParams(rawParams)
          : undefined;
      specNodes.push({
        id: node.id,
        type,
        ...(params ? { params } : {}),
      });
      specNodeIds.add(node.id);
    }
  }

  // 4. Build spec edges (only between nodes that made it into the spec).
  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type]));
  const specEdges: MotionGraphSpecEdge[] = [];

  for (const edge of edges) {
    if (!specNodeIds.has(edge.source) || !specNodeIds.has(edge.target))
      continue;

    const from: MotionGraphSpecEdge["from"] = { node_id: edge.source };
    const resolvedSourceHandle = translateSourceHandle(
      nodeTypeMap.get(edge.source),
      edge.sourceHandle,
    );
    if (resolvedSourceHandle && resolvedSourceHandle !== "out") {
      from.output = resolvedSourceHandle;
    }

    specEdges.push({
      from,
      to: {
        node_id: edge.target,
        input: translateTargetHandle(
          nodeTypeMap.get(edge.target),
          edge.targetHandle,
        ),
      },
    });
  }

  // 5. Synthesize implicit Constant nodes for unconnected input ports
  //    that have user-set default values (inputDefaults).
  //    This mirrors what happens when the user manually places a Constant
  //    and wires it — the WASM evaluator sees the same structure.
  const connectedHandlesMap = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.targetHandle) continue;
    let handles = connectedHandlesMap.get(edge.target);
    if (!handles) {
      handles = new Set();
      connectedHandlesMap.set(edge.target, handles);
    }
    handles.add(edge.targetHandle);
  }

  for (const node of nodes) {
    if (!specNodeIds.has(node.id)) continue;
    const rawDefaults = node.data?.inputDefaults as
      | Record<string, unknown>
      | undefined;
    if (!rawDefaults) continue;

    const connectedHandles = connectedHandlesMap.get(node.id);
    for (const [portId, val] of Object.entries(rawDefaults)) {
      if (val == null) continue;
      if (connectedHandles?.has(portId)) continue; // port has a real wire

      // Coerce value to number if possible
      const coerced =
        typeof val === "string" && val.trim() !== ""
          ? isNaN(Number(val))
            ? val
            : Number(val)
          : val;

      const constId = `__const_${node.id}_${portId}`;
      specNodes.push({
        id: constId,
        type: "constant",
        params: { value: coerced },
      });
      specEdges.push({
        from: { node_id: constId },
        to: { node_id: node.id, input: portId },
      });
    }
  }

  // 6. Collect paths.
  const outputPaths = specNodes
    .filter((n) => n.type === "output" && typeof n.params?.path === "string")
    .map((n) => n.params!.path as string);

  const inputPaths = specNodes
    .filter((n) => n.type === "input" && typeof n.params?.path === "string")
    .map((n) => n.params!.path as string);

  // 7. Persist node positions so the authored layout survives roundtrips.
  const layout: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    if (!specNodeIds.has(node.id)) continue;
    layout[node.id] = { x: node.position.x, y: node.position.y };
  }

  return {
    spec: { nodes: specNodes, edges: specEdges, layout },
    outputPaths,
    inputPaths,
    hasConnectedOutputs: outputPaths.length > 0,
  };
}

/* ── Public API ──────────────────────────────────────────────────── */

/**
 * Convert editor state to an orchestrator GraphSpec with namespaced
 * output paths (for live registration with the orchestrator).
 */
export function buildGraphSpec(
  nodes: MotionGraphEditorNode[],
  edges: MotionGraphEditorEdge[],
  namespace: string,
): BuiltGraphSpec {
  return buildGraphSpecInternal(nodes, edges, namespace);
}

/**
 * Convert editor state to an orchestrator GraphSpec WITHOUT namespace
 * (for embedding in a portable GLB bundle — namespace is applied at
 * load time by VizijRuntimeProvider.namespaceGraphSpec()).
 */
export function buildGraphSpecForExport(
  nodes: MotionGraphEditorNode[],
  edges: MotionGraphEditorEdge[],
): BuiltGraphSpec["spec"] {
  return buildGraphSpecInternal(nodes, edges, null).spec;
}

export function buildMotionGraphProgramAsset(
  options: BuildMotionGraphProgramAssetOptions,
): VizijProgramAsset | null {
  const id = options.id.trim();
  if (!id) {
    return null;
  }

  const built = buildGraphSpecInternal(options.nodes, options.edges, null);
  if (!built.hasConnectedOutputs) {
    return null;
  }

  const resetValues = Object.fromEntries(
    Object.entries(options.resetValues ?? {}).filter(
      (entry): entry is [string, number] => {
        const [path, value] = entry;
        return path.trim().length > 0 && Number.isFinite(value);
      },
    ),
  );
  const label = options.label?.trim();

  return {
    id,
    ...(label ? { label } : {}),
    graph: {
      id: `${id}.graph`,
      spec: built.spec,
    },
    ...(Object.keys(resetValues).length > 0 ? { resetValues } : {}),
  };
}

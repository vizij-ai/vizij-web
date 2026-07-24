/**
 * Compute a spec-level graph diff between two composed Vizij graph specs, in the
 * shape the runtime's `applyGraphEdits` (VIZ-79) consumes. Feeding the delta
 * (rather than the whole new spec) lets the device patch its running graph, so
 * nodes the edit didn't touch keep their runtime state (springs/slew/URDF, the
 * graph clock).
 *
 * The contract mirrors the Rust `GraphSpecDiff`: an **upserted node is removed
 * then re-added**, so every edge incident to an upserted node must ride in
 * `upsert_edges`. This helper guarantees that — a node is upserted when it (or
 * any edge touching it) changed, and all of the *next* spec's edges incident to
 * an upserted node are included.
 *
 * Specs are handled structurally (loose `{ nodes, edges }` records), the same
 * form `composeGraphSpecs` produces.
 */

type NodeRecord = Record<string, unknown> & { id?: unknown };

interface EdgeEndpoint {
  node_id?: unknown;
  output?: unknown;
  input?: unknown;
}

type EdgeRecord = Record<string, unknown> & {
  from?: EdgeEndpoint;
  to?: EdgeEndpoint;
  selector?: unknown;
};

interface SpecLike {
  nodes?: unknown;
  edges?: unknown;
}

/** A spec-level graph edit; the payload of `Runtime.applyGraphEdits`. */
export interface GraphSpecDiff {
  upsert_nodes: NodeRecord[];
  remove_nodes: string[];
  upsert_edges: EdgeRecord[];
  remove_edges: { node_id: string; input: string }[];
}

function asRecords<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nodeId(node: NodeRecord): string | undefined {
  return typeof node.id === "string" ? node.id : undefined;
}

function endpointId(endpoint: EdgeEndpoint | undefined): string | undefined {
  const id = endpoint?.node_id;
  return typeof id === "string" ? id : undefined;
}

function endpointInput(endpoint: EdgeEndpoint | undefined): string | undefined {
  const input = endpoint?.input;
  return typeof input === "string" ? input : undefined;
}

/** Stable JSON (keys sorted at every level) so structural equality ignores key order. */
function stable(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Identity of an edge: source, target, and selector (order-sensitive). */
function edgeKey(edge: EdgeRecord): string {
  return stable([
    endpointId(edge.from),
    edge.from?.output ?? "out",
    endpointId(edge.to),
    endpointInput(edge.to),
    edge.selector ?? null,
  ]);
}

/**
 * The delta from `prev` to `next`, or `null` when the two are structurally
 * identical (nothing to apply). Nodes/edges without a usable id are skipped
 * (the caller falls back to a whole-graph load if it needs those).
 */
export function graphSpecDiff(prev: SpecLike, next: SpecLike): GraphSpecDiff | null {
  const prevNodes = new Map<string, NodeRecord>();
  for (const node of asRecords<NodeRecord>(prev.nodes)) {
    const id = nodeId(node);
    if (id) prevNodes.set(id, node);
  }
  const nextNodes = new Map<string, NodeRecord>();
  for (const node of asRecords<NodeRecord>(next.nodes)) {
    const id = nodeId(node);
    if (id) nextNodes.set(id, node);
  }

  const prevEdges = asRecords<EdgeRecord>(prev.edges);
  const nextEdges = asRecords<EdgeRecord>(next.edges);

  // Nodes removed, and nodes new-or-changed.
  const remove_nodes = [...prevNodes.keys()].filter((id) => !nextNodes.has(id));
  const upsertIds = new Set<string>();
  for (const [id, node] of nextNodes) {
    const before = prevNodes.get(id);
    if (!before || stable(before) !== stable(node)) upsertIds.add(id);
  }

  // Edges added or removed. Either endpoint (that still exists in `next`) is
  // upserted, so the change is reflected when its incident edges are re-added.
  const prevEdgeKeys = new Set(prevEdges.map(edgeKey));
  const nextEdgeKeys = new Set(nextEdges.map(edgeKey));
  const removedEdges = prevEdges.filter((e) => !nextEdgeKeys.has(edgeKey(e)));
  const changedEdges = [
    ...nextEdges.filter((e) => !prevEdgeKeys.has(edgeKey(e))),
    ...removedEdges,
  ];
  for (const edge of changedEdges) {
    for (const id of [endpointId(edge.from), endpointId(edge.to)]) {
      if (id && nextNodes.has(id)) upsertIds.add(id);
    }
  }

  const incidentToUpsert = (edge: EdgeRecord): boolean => {
    const from = endpointId(edge.from);
    const to = endpointId(edge.to);
    return (from !== undefined && upsertIds.has(from)) || (to !== undefined && upsertIds.has(to));
  };

  const upsert_nodes = [...upsertIds].map((id) => nextNodes.get(id)!);
  const upsert_edges = nextEdges.filter(incidentToUpsert);

  // A removed edge needs explicit unwiring only when its target survives and is
  // not upserted (an upserted target is removed-then-re-added, so dropping the
  // edge from `upsert_edges` already unwires it).
  const removeNodeSet = new Set(remove_nodes);
  const remove_edges = removedEdges.flatMap((edge) => {
    const to = endpointId(edge.to);
    const input = endpointInput(edge.to);
    if (!to || !input || removeNodeSet.has(to) || upsertIds.has(to)) return [];
    return [{ node_id: to, input }];
  });

  if (
    upsert_nodes.length === 0 &&
    remove_nodes.length === 0 &&
    upsert_edges.length === 0 &&
    remove_edges.length === 0
  ) {
    return null;
  }

  return { upsert_nodes, remove_nodes, upsert_edges, remove_edges };
}

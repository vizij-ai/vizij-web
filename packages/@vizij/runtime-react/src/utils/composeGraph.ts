/**
 * Compose several Vizij graph specs into the ONE graph an Arora device runs.
 *
 * The device runs a single ProcessingGraph as its behavior, so the separate
 * graph sources (rig graph, pose graph, playing program graphs) become a
 * union of nodes and edges here. Node ids
 * are prefixed `${sourceId}::` so sources can't collide; `params.path` is
 * deliberately NOT prefixed — path identity on the device's shared store is
 * the cross-graph contract (a pose output written to a store path is read by
 * a rig input node with the same path on the next tick).
 *
 * Output-path collisions across sources (two `output` nodes writing one
 * path) are warned and resolved last-writer-wins by evaluation order; there
 * is no additive merge for that case yet, and current bundles don't collide.
 * If a real bundle does, insert an explicit combiner node here instead of
 * widening this warning.
 */

type SpecRecord = Record<string, unknown>;

/** A graph spec treated structurally (same tolerance as `utils/graph.ts`). */
export type ComposableSpec = SpecRecord;

export interface GraphSource {
  /** Stable id of the source graph (e.g. "rig", "pose", a program id). */
  sourceId: string;
  spec: ComposableSpec;
}

function asArray(value: unknown): SpecRecord[] {
  return Array.isArray(value)
    ? (value.filter((n) => n && typeof n === "object") as SpecRecord[])
    : [];
}

function prefixId(sourceId: string, id: unknown): unknown {
  return typeof id === "string" && id ? `${sourceId}::${id}` : id;
}

/** Rewrite a `{ node_id: ... }` edge endpoint to the prefixed node id. */
function prefixEndpoint(sourceId: string, endpoint: unknown): unknown {
  if (!endpoint || typeof endpoint !== "object") {
    return endpoint;
  }
  const record = endpoint as SpecRecord;
  if (typeof record.node_id !== "string") {
    return endpoint;
  }
  return { ...record, node_id: prefixId(sourceId, record.node_id) };
}

function outputPathsOf(spec: ComposableSpec): string[] {
  const paths: string[] = [];
  for (const node of asArray(spec.nodes)) {
    if (String(node.type ?? "").toLowerCase() !== "output") {
      continue;
    }
    const path = (node.params as SpecRecord | undefined)?.path;
    if (typeof path === "string" && path.trim()) {
      paths.push(path.trim());
    }
  }
  return paths;
}

/**
 * Union `sources` into one spec. Later sources evaluate after earlier ones,
 * so on an output-path collision the last source wins (warned).
 */
export function composeGraphSpecs(sources: GraphSource[]): ComposableSpec {
  const nodes: SpecRecord[] = [];
  const edges: SpecRecord[] = [];
  const outputOwners = new Map<string, string>();

  for (const { sourceId, spec } of sources) {
    for (const path of outputPathsOf(spec)) {
      const owner = outputOwners.get(path);
      if (owner && owner !== sourceId) {
        console.warn(
          `[vizij-runtime] output path "${path}" is written by both "${owner}" and "${sourceId}"; ` +
            `last writer wins ("${sourceId}"). There is no combiner node for additive merges yet.`,
        );
      }
      outputOwners.set(path, sourceId);
    }

    for (const node of asArray(spec.nodes)) {
      nodes.push({ ...node, id: prefixId(sourceId, node.id) });
    }
    for (const edge of asArray(spec.edges)) {
      edges.push({
        ...edge,
        from: prefixEndpoint(sourceId, edge.from),
        to: prefixEndpoint(sourceId, edge.to),
      });
    }
  }

  return { nodes, edges };
}

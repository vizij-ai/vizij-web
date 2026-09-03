import type { GraphSource } from "@vizij/runtime-react";

/**
 * Which graphs to bake through, and what they write.
 *
 * Both are read out of the bundle being exported rather than rebuilt, so the
 * baked motion is produced by exactly the graph the bundle ships. Building a
 * second copy here would let the GLB and the bundle disagree about what the
 * face does, with nothing to catch it.
 */

/** Bundle graph kinds that participate in producing node motion. */
const BAKEABLE_KINDS = new Set(["rig", "pose-driver"]);

interface BundleGraphLike {
  id?: unknown;
  kind?: unknown;
  spec?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Graph sources for the bake device, in bundle order. */
export function collectBakeGraphSources(
  bundle: { graphs?: unknown } | null | undefined,
): GraphSource[] {
  const graphs = bundle?.graphs;
  if (!Array.isArray(graphs)) {
    return [];
  }
  const sources: GraphSource[] = [];
  graphs.forEach((entry: BundleGraphLike, index) => {
    if (typeof entry?.kind !== "string" || !BAKEABLE_KINDS.has(entry.kind)) {
      return;
    }
    if (!isRecord(entry.spec) || !Array.isArray(entry.spec.nodes)) {
      return;
    }
    const sourceId =
      typeof entry.id === "string" && entry.id.trim().length > 0
        ? `${entry.kind}:${entry.id.trim()}`
        : `${entry.kind}:${index}`;
    sources.push({ sourceId, spec: entry.spec as GraphSource["spec"] });
  });
  return sources;
}

/**
 * Every path the composed spec declares it writes.
 *
 * Taken from the spec's own output nodes rather than from a separately
 * maintained list of animatables: the recorded set is then, by construction,
 * what the graph actually writes. A path list assembled elsewhere can drift
 * from the graph and silently bake nothing.
 */
export function outputPathsOfSpec(spec: unknown): string[] {
  if (!isRecord(spec) || !Array.isArray(spec.nodes)) {
    return [];
  }
  const paths = new Set<string>();
  for (const node of spec.nodes) {
    if (!isRecord(node) || node.type !== "output") {
      continue;
    }
    const params = node.params;
    if (!isRecord(params)) {
      continue;
    }
    const path = params.path;
    if (typeof path === "string" && path.trim().length > 0) {
      paths.add(path.trim());
    }
  }
  return [...paths];
}

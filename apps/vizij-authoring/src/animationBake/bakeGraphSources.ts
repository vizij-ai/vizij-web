import type { GraphSpec } from "@vizij/node-graph";
import { channelKeys, composeVizij } from "@vizij/runtime";

/**
 * The graph the bake steps, and the keys it stages.
 *
 * Both come from the bundle being exported, read by the runtime as the
 * exported face's device reads it, so the baked motion is produced by the
 * graph the face runs and each track drives the key the face plays it on.
 * Building either a second way would let the GLB and the face disagree about
 * what the face does, with nothing to catch it.
 */

/** Bundle graph kinds that produce node motion: what the bake steps. */
export const BAKE_GRAPH_KINDS = ["rig", "pose-driver"] as const;

interface BundleLike {
  graphs?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Whether `bundle` carries a graph the bake steps. */
export function hasBakeGraph(bundle: BundleLike | null | undefined): boolean {
  const graphs = bundle?.graphs;
  return (
    Array.isArray(graphs) &&
    graphs.some(
      (entry) =>
        isRecord(entry) &&
        (BAKE_GRAPH_KINDS as readonly unknown[]).includes(entry.kind),
    )
  );
}

/** `bundle` as the glTF document the runtime reads a face's bundle from. */
function documentOf(bundle: BundleLike): object {
  return { asset: { version: "2.0" }, extensions: { VIZIJ_bundle: bundle } };
}

/**
 * The bundle's rig and pose driver, composed as the exported face's device
 * composes them (`composeVizij`), with no program.
 */
export async function composeBakeGraph(bundle: BundleLike): Promise<GraphSpec> {
  return (await composeVizij(documentOf(bundle), {
    graphs: [...BAKE_GRAPH_KINDS],
    program: "none",
  })) as GraphSpec;
}

/**
 * The store key each of `channels` — animation track channels — drives on
 * the face `bundle` describes: the key the face plays a track on
 * (`channelKeys`, the resolution `Runtime.moduleAnimation` applies).
 */
export async function bakeChannelKeys(
  bundle: BundleLike,
  channels: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(channels)];
  const keys = await channelKeys(documentOf(bundle), unique);
  return new Map(unique.map((channel, index) => [channel, keys[index]!]));
}

/** The trimmed `params.path` of every node of `spec` of type `type`. */
function pathsOfNodes(spec: unknown, type: string): string[] {
  if (!isRecord(spec) || !Array.isArray(spec.nodes)) {
    return [];
  }
  const paths = new Set<string>();
  for (const node of spec.nodes) {
    if (!isRecord(node) || node.type !== type) {
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

/**
 * Every path the spec declares it writes.
 *
 * Taken from the spec's own output nodes rather than from a separately
 * maintained list of animatables: the recorded set is then, by construction,
 * what the graph actually writes. A path list assembled elsewhere can drift
 * from the graph and silently bake nothing.
 */
export function outputPathsOfSpec(spec: unknown): string[] {
  return pathsOfNodes(spec, "output");
}

/** Every path the spec declares it reads: the keys a staged track can
 * drive. */
export function inputPathsOfSpec(spec: unknown): string[] {
  return pathsOfNodes(spec, "input");
}

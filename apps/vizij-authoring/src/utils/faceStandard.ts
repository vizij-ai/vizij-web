/**
 * Building an adaptation from a profile.
 *
 * A *profile* is a set of paths and their types; an *adaptation* is the mapping
 * that carries a profile's values onto this face's own pose weights. The
 * profile is a file the author imported, so the vocabulary is never copied into
 * this app. What lives here is only the shape of the graph built from it.
 */

import type { VizijBundleProfile } from "@vizij/render";

/** A graph spec's node, loosely typed — enough for the shapes built here. */
interface SpecNode {
  id: string;
  type: string;
  params?: { path?: string; value?: number };
}

/** The minimal graph-spec shape a bundle entry carries. */
export interface AdaptationSpec {
  nodes: SpecNode[];
  edges: unknown[];
}

/**
 * A node id derived from a control path, stable and unique per path: the path
 * with every non-word character folded to `_`. Graph node ids must be unique
 * or the spec cannot round-trip through the editor, and two profiles can carry
 * the same leaf name under different namespaces.
 */
function nodeIdFor(path: string): string {
  return `in_${path.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

/**
 * An empty adaptation for `profile`: every path the profile defines, declared
 * as an `input` node, and nothing wired.
 *
 * This is the starting point the author binds — each control gets connected to
 * the face's own pose weights in the graph editor. Until a control is wired it
 * reads its path and drives nothing.
 *
 * The profile's paths are used as given, so a profile fetched with this face's
 * rig prefix produces a graph addressed to this face. Each input rests at the
 * profile's declared default, falling back to zero, so an unwired face holds
 * its neutral.
 *
 * Note that `vizij-bundle validate` currently measures coverage by the control
 * paths a face's graphs *listen on*, so an unedited graph already reports its
 * tiers as covered. Coverage says the face speaks the vocabulary; it does not
 * say the vocabulary moves anything — the per-profile reachability check is
 * what closes that gap.
 */
export function buildEmptyAdaptationSpec(
  profile: VizijBundleProfile,
): AdaptationSpec {
  const seen = new Set<string>();
  const nodes: SpecNode[] = [];
  for (const key of profile.keys) {
    if (seen.has(key.path)) {
      continue;
    }
    seen.add(key.path);
    // `default_value` is arora's tagged form (`{ f32: 0 }`); take the number
    // out of whichever tag it carries, and rest at zero when it carries none.
    const tagged = key.default_value as Record<string, unknown> | undefined;
    const declared = tagged
      ? Object.values(tagged).find((v) => typeof v === "number")
      : undefined;
    nodes.push({
      id: nodeIdFor(key.path),
      type: "input",
      params: {
        path: key.path,
        value: typeof declared === "number" ? declared : 0,
      },
    });
  }
  return { nodes, edges: [] };
}

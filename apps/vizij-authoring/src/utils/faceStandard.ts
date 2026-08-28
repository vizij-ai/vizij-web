/**
 * The Vizij face standard's semantic vocabulary, mirrored for the authoring
 * app.
 *
 * The authoritative source is `vizij-arora-host`'s `standard` module in
 * vizij-rs (see its `docs/face-standard.md`); `@vizij/runtime` serves the
 * shipped *profiles* but not the vocabulary itself, so the names live here.
 * Keep them in step with the Rust constants — `vizij-bundle validate` counts
 * coverage against that list, so a name that drifts silently stops counting.
 */

/**
 * The 25 expression weights, at `standard/vizij/expression/<name>`. The names
 * are ROS4HRI's `hri_msgs/Expression` vocabulary. The standard prescribes the
 * name a caller commands, not what the expression looks like — that stays the
 * face's authored pose.
 */
export const EXPRESSION_NAMES = [
  "neutral",
  "angry",
  "sad",
  "happy",
  "surprised",
  "disgusted",
  "scared",
  "pleading",
  "vulnerable",
  "despaired",
  "guilty",
  "disappointed",
  "embarrassed",
  "horrified",
  "skeptical",
  "annoyed",
  "furious",
  "suspicious",
  "rejected",
  "bored",
  "tired",
  "asleep",
  "confused",
  "amazed",
  "excited",
] as const;

/**
 * The 15 viseme weights, at `standard/vizij/viseme/<shape>` — the industry
 * 15-shape set (Oculus/Meta naming). `sil` is silence, the closed-mouth rest
 * shape.
 */
export const VISEME_SHAPES = [
  "sil",
  "PP",
  "FF",
  "TH",
  "DD",
  "kk",
  "CH",
  "SS",
  "nn",
  "RR",
  "aa",
  "E",
  "ih",
  "oh",
  "ou",
] as const;

/** The control path of a named expression, unprefixed. */
export function expressionPath(name: string): string {
  return `standard/vizij/expression/${name}`;
}

/** The control path of a viseme shape, unprefixed. */
export function visemePath(shape: string): string {
  return `standard/vizij/viseme/${shape}`;
}

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
 * An empty standard-adaptation graph for a face: every semantic control the
 * standard defines, declared as an `input` node reading this face's
 * rig-prefixed control path, and nothing wired.
 *
 * This is the starting point the author binds — each control gets connected to
 * the face's own pose weights in the graph editor. Until a control is wired it
 * reads its path and drives nothing.
 *
 * Note that `vizij-bundle validate` measures coverage by the control paths a
 * face's graphs *listen on*, so an unedited graph already reports the
 * expression and viseme tiers as fully covered. Coverage says the face speaks
 * the vocabulary; it does not say the vocabulary moves anything.
 */
export function buildEmptyAdaptationSpec(rigPrefix: string): AdaptationSpec {
  const input = (id: string, path: string): SpecNode => ({
    id,
    type: "input",
    params: { path: `${rigPrefix}${path}`, value: 0 },
  });
  return {
    nodes: [
      ...EXPRESSION_NAMES.map((name) =>
        input(`in_expr_${name}`, expressionPath(name)),
      ),
      ...VISEME_SHAPES.map((shape) =>
        input(`in_vis_${shape}`, visemePath(shape)),
      ),
    ],
    edges: [],
  };
}

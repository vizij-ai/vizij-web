/**
 * Graph nodes that make a baked result something other than a faithful
 * recording of the clip.
 *
 * Baking is only exact if graph evaluation is a pure function of the clip's
 * values at a time. Two kinds of node break that, in different ways, and both
 * are worth naming in the preflight rather than discovering later by
 * comparing a GLB against the viewport.
 */

/** Nodes whose output depends on the sequence and size of steps taken. */
const RATE_DEPENDENT_TYPES = new Set(["slew", "spring", "damp", "damping"]);

/** Nodes driven by the graph clock rather than by the clip. */
const CLOCK_DRIVEN_TYPES = new Set([
  "time",
  "oscillator",
  "perlinnoise",
  "simplenoise",
  "simplexnoise",
]);

export type BakeHazardKind = "rate-dependent" | "clock-driven";

export interface BakeHazard {
  kind: BakeHazardKind;
  nodeType: string;
  nodeIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Find nodes in `spec` that make the bake approximate.
 *
 * `rate-dependent`: a slew-limited channel baked at 30fps and replayed at
 * 60fps will not match, because the limiter saw different step sizes.
 *
 * `clock-driven`: the node ignores the clip, so baking freezes one particular
 * realization into keyframes. For noise that also means the baked motion is
 * whatever the export happened to produce, not something reproducible.
 */
export function detectBakeHazards(spec: unknown): BakeHazard[] {
  if (!isRecord(spec) || !Array.isArray(spec.nodes)) {
    return [];
  }
  const byType = new Map<string, { kind: BakeHazardKind; nodeIds: string[] }>();
  for (const node of spec.nodes) {
    if (!isRecord(node) || typeof node.type !== "string") {
      continue;
    }
    const type = node.type.toLowerCase();
    const kind: BakeHazardKind | null = RATE_DEPENDENT_TYPES.has(type)
      ? "rate-dependent"
      : CLOCK_DRIVEN_TYPES.has(type)
        ? "clock-driven"
        : null;
    if (!kind) {
      continue;
    }
    const entry = byType.get(type) ?? { kind, nodeIds: [] };
    if (typeof node.id === "string") {
      entry.nodeIds.push(node.id);
    }
    byType.set(type, entry);
  }
  return [...byType.entries()].map(([nodeType, entry]) => ({
    kind: entry.kind,
    nodeType,
    nodeIds: entry.nodeIds,
  }));
}

/** Preflight lines for `hazards`, empty when there are none. */
export function describeBakeHazards(
  hazards: ReadonlyArray<BakeHazard>,
  fps: number,
): string[] {
  if (hazards.length === 0) {
    return [];
  }
  const lines: string[] = ["Baked motion is approximate for this rig:"];
  for (const hazard of hazards) {
    const count = hazard.nodeIds.length;
    if (hazard.kind === "rate-dependent") {
      lines.push(
        `  ${count} ${hazard.nodeType} node${count === 1 ? "" : "s"}: ` +
          `baked at ${fps}fps, so playback at another rate will differ`,
      );
    } else {
      lines.push(
        `  ${count} ${hazard.nodeType} node${count === 1 ? "" : "s"}: ` +
          `driven by the clock, not the clip, so one pass is frozen into keys`,
      );
    }
  }
  return lines;
}

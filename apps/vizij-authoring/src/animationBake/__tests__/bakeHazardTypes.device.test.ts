// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import { startRuntime } from "@vizij/runtime";
import { detectBakeHazards } from "../bakeHazards";

/**
 * The hazard lists name node *types*, and a name that no longer exists — or
 * never did — fails silently: the set never matches, and the export preflight
 * stops mentioning a hazard that is still there. `damping` sat in the
 * rate-dependent list and is not a node type at all.
 *
 * So assert against the runtime itself rather than against a copy of the
 * vocabulary, which would drift the same way.
 */

const HAZARD_TYPES = [
  "slew",
  "spring",
  "damp",
  "time",
  "oscillator",
  "perlinnoise",
  "simplenoise",
  "simplexnoise",
] as const;

function specWith(nodeType: string): GraphSpec {
  return {
    nodes: [
      { id: "probe", type: nodeType },
      { id: "out", type: "output", params: { path: "probe/out" } },
    ],
    edges: [
      { from: { node_id: "probe" }, to: { node_id: "out", input: "in" } },
    ],
  } as unknown as GraphSpec;
}

describe("bake hazard node types", () => {
  it.each(HAZARD_TYPES)(
    "%s is a node type the runtime accepts",
    async (type) => {
      const runtime = await startRuntime(specWith(type));
      try {
        expect(runtime).toBeTruthy();
      } finally {
        runtime.dispose();
      }
    },
  );

  it("detects every listed type as a hazard", () => {
    for (const type of HAZARD_TYPES) {
      const hazards = detectBakeHazards(specWith(type));
      expect(
        hazards.map((hazard) => hazard.nodeType),
        `${type} should be reported as a bake hazard`,
      ).toContain(type);
    }
  });

  it("rejects a type that does not exist, proving the check has teeth", async () => {
    await expect(startRuntime(specWith("damping"))).rejects.toThrow();
  });
});

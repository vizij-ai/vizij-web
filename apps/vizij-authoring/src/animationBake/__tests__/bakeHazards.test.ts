import { describe, expect, it } from "vitest";
import { describeBakeHazards, detectBakeHazards } from "../bakeHazards";

describe("detectBakeHazards", () => {
  it("flags rate-dependent nodes", () => {
    // A slew-limited channel baked at 30fps and replayed at 60fps will not
    // match, because the limiter saw different step sizes.
    const hazards = detectBakeHazards({
      nodes: [
        { id: "a", type: "slew" },
        { id: "b", type: "slew" },
        { id: "c", type: "spring" },
        { id: "d", type: "multiply" },
      ],
    });

    expect(hazards).toEqual([
      { kind: "rate-dependent", nodeType: "slew", nodeIds: ["a", "b"] },
      { kind: "rate-dependent", nodeType: "spring", nodeIds: ["c"] },
    ]);
  });

  it("flags clock-driven nodes separately", () => {
    // These ignore the clip, so baking freezes one pass into keyframes.
    const hazards = detectBakeHazards({
      nodes: [
        { id: "osc", type: "oscillator" },
        { id: "n", type: "simplexnoise" },
      ],
    });

    expect(hazards.map((hazard) => hazard.kind)).toEqual([
      "clock-driven",
      "clock-driven",
    ]);
  });

  it("is case-insensitive about node types", () => {
    expect(detectBakeHazards({ nodes: [{ id: "a", type: "Slew" }] })).toEqual([
      { kind: "rate-dependent", nodeType: "slew", nodeIds: ["a"] },
    ]);
  });

  it("finds nothing in a pure graph, and tolerates junk", () => {
    expect(
      detectBakeHazards({
        nodes: [
          { id: "a", type: "input" },
          { id: "b", type: "multiply" },
          { id: "c", type: "output" },
        ],
      }),
    ).toEqual([]);
    expect(detectBakeHazards(null)).toEqual([]);
    expect(detectBakeHazards({ nodes: [null, 7, {}] })).toEqual([]);
  });
});

describe("describeBakeHazards", () => {
  it("says why each kind matters, naming the rate it baked at", () => {
    const lines = describeBakeHazards(
      [
        { kind: "rate-dependent", nodeType: "slew", nodeIds: ["a"] },
        { kind: "clock-driven", nodeType: "oscillator", nodeIds: ["b", "c"] },
      ],
      30,
    );

    expect(lines[0]).toContain("approximate");
    expect(lines[1]).toContain("30fps");
    expect(lines[1]).toContain("1 slew node");
    expect(lines[2]).toContain("2 oscillator nodes");
    expect(lines[2]).toContain("not the clip");
  });

  it("says nothing when the graph is pure", () => {
    expect(describeBakeHazards([], 30)).toEqual([]);
  });
});

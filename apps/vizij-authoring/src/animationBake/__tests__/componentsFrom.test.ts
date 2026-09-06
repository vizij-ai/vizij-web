import { describe, expect, it } from "vitest";
import { componentsFrom } from "../graphEvaluatorDevice";

/**
 * The decoder is exported only for this test. It is worth pinning directly:
 * `sampleClipThroughGraph` indexes the result *positionally* onto a feature's
 * channels, so a decode that drops a component rather than placing it writes
 * one axis's value into another axis — silently, and only for values the graph
 * happens to emit sparsely.
 */
describe("componentsFrom", () => {
  it("keeps a sparse component-keyed object in axis order", () => {
    // The regression: filtering used to yield [1, 3], so 3 — a z value —
    // landed in the y channel.
    expect(componentsFrom({ x: 1, z: 3 })).toEqual([1, 0, 3]);
  });

  it("does not invent trailing components that were absent", () => {
    expect(componentsFrom({ x: 1 })).toEqual([1]);
    expect(componentsFrom({ x: 1, y: 2 })).toEqual([1, 2]);
  });

  it("reads a leading gap as zero rather than shifting left", () => {
    expect(componentsFrom({ y: 2 })).toEqual([0, 2]);
  });

  it("decodes the ValueJSON shapes the graph actually writes", () => {
    expect(componentsFrom({ float: 0.5 })).toEqual([0.5]);
    expect(componentsFrom({ vec3: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(componentsFrom(0.25)).toEqual([0.25]);
  });

  it("decodes the joined-vector shape a real device returns", () => {
    // Verified against a live runtime: `readValues` gives `f32s`. The
    // hand-rolled decoder knew `vec3`/`vector`/`quat` but not this, so it
    // returned null for every joined vector — the rig graph's normal output
    // shape — and vector features baked to nothing at all.
    expect(componentsFrom({ f32s: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it("returns null for values that carry no components", () => {
    expect(componentsFrom(null)).toBeNull();
    expect(componentsFrom(undefined)).toBeNull();
    expect(componentsFrom({})).toBeNull();
    expect(componentsFrom("nope")).toBeNull();
  });

  it("still reads a single-field wrapper", () => {
    expect(componentsFrom({ value: 0.5 })).toEqual([0.5]);
  });
});

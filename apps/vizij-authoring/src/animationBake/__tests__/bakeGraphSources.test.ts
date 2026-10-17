import { describe, expect, it } from "vitest";
import {
  hasBakeGraph,
  inputPathsOfSpec,
  outputPathsOfSpec,
} from "../bakeGraphSources";

describe("hasBakeGraph", () => {
  it("finds a rig or a pose driver among the bundle's graphs", () => {
    expect(hasBakeGraph({ graphs: [{ id: "face", kind: "rig" }] })).toBe(true);
    expect(
      hasBakeGraph({ graphs: [{ id: "pose", kind: "pose-driver" }] }),
    ).toBe(true);
  });

  it("finds none in kinds that do not produce node motion", () => {
    // A motion/procedural graph is authored output, not part of the rig's
    // input-to-transform path, so baking through it would double-apply.
    expect(hasBakeGraph({ graphs: [{ id: "m", kind: "motiongraph" }] })).toBe(
      false,
    );
  });

  it("finds none in a missing or bundle-less export", () => {
    expect(hasBakeGraph(null)).toBe(false);
    expect(hasBakeGraph(undefined)).toBe(false);
    expect(hasBakeGraph({})).toBe(false);
  });
});

describe("inputPathsOfSpec", () => {
  it("reads the paths the spec's own input nodes declare", () => {
    expect(
      inputPathsOfSpec({
        nodes: [
          { id: "a", type: "input", params: { path: "rig/face/gaze/x" } },
          { id: "b", type: "output", params: { path: "not/an/input" } },
          { id: "c", type: "input", params: {} },
        ],
      }),
    ).toEqual(["rig/face/gaze/x"]);
  });
});

describe("outputPathsOfSpec", () => {
  it("reads the paths the spec's own output nodes declare", () => {
    expect(
      outputPathsOfSpec({
        nodes: [
          { id: "a", type: "output", params: { path: "propsrig/x/scale/x" } },
          { id: "b", type: "input", params: { path: "not/an/output" } },
          { id: "c", type: "output", params: { path: "propsrig/y/scale/x" } },
          { id: "d", type: "output", params: {} },
          { id: "e", type: "output" },
        ],
      }).sort(),
    ).toEqual(["propsrig/x/scale/x", "propsrig/y/scale/x"]);
  });

  it("dedupes and trims", () => {
    expect(
      outputPathsOfSpec({
        nodes: [
          { id: "a", type: "output", params: { path: " p " } },
          { id: "b", type: "output", params: { path: "p" } },
        ],
      }),
    ).toEqual(["p"]);
  });

  it("tolerates a malformed spec", () => {
    expect(outputPathsOfSpec(null)).toEqual([]);
    expect(outputPathsOfSpec({})).toEqual([]);
    expect(outputPathsOfSpec({ nodes: "no" })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  collectBakeGraphSources,
  outputPathsOfSpec,
} from "../bakeGraphSources";

describe("collectBakeGraphSources", () => {
  const rig = {
    id: "face",
    kind: "rig",
    spec: { nodes: [{ id: "n", type: "output", params: { path: "a" } }] },
  };
  const pose = {
    id: "pose",
    kind: "pose-driver",
    spec: { nodes: [{ id: "p", type: "output", params: { path: "b" } }] },
  };

  it("takes the rig and pose graphs, in bundle order", () => {
    const sources = collectBakeGraphSources({ graphs: [rig, pose] });
    expect(sources.map((source) => source.sourceId)).toEqual([
      "rig:face",
      "pose-driver:pose",
    ]);
  });

  it("skips kinds that do not produce node motion", () => {
    // A motion/procedural graph is authored output, not part of the rig's
    // input-to-transform path, so baking through it would double-apply.
    const sources = collectBakeGraphSources({
      graphs: [rig, { id: "m", kind: "motion", spec: { nodes: [] } }],
    });
    expect(sources.map((source) => source.sourceId)).toEqual(["rig:face"]);
  });

  it("skips entries with no usable spec instead of composing junk", () => {
    expect(
      collectBakeGraphSources({
        graphs: [
          { id: "a", kind: "rig", spec: null },
          { id: "b", kind: "rig", spec: {} },
          { id: "c", kind: "rig" },
        ],
      }),
    ).toEqual([]);
  });

  it("returns nothing for a missing or bundle-less export", () => {
    expect(collectBakeGraphSources(null)).toEqual([]);
    expect(collectBakeGraphSources(undefined)).toEqual([]);
    expect(collectBakeGraphSources({})).toEqual([]);
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

import { describe, expect, it } from "vitest";
import {
  applyRigPrefix,
  embeddedProfileGraphId,
  embeddedProfileId,
  stripRigPrefix,
} from "./useStandardProfiles";

const PREFIX = "rig/quori_latest/";

// A miniature profile shape: only output nodes' written paths take the rig
// prefix; inputs (the standard's keys) and other node kinds stay untouched.
const canonical = {
  nodes: [
    {
      id: "v",
      type: "input",
      params: { path: "standard/ros4hri/expression/valence", value: 0 },
    },
    { id: "c", type: "constant", params: { value: 0.5 } },
    {
      id: "o",
      type: "output",
      params: { path: "standard/vizij/expression/happy" },
    },
  ],
  edges: [{ from: { node_id: "v" }, to: { node_id: "o", input: "in" } }],
};

describe("rig prefix transforms", () => {
  it("prefixes only output paths, and stripping restores the canonical form", () => {
    const prefixed = applyRigPrefix(canonical, PREFIX);
    expect(prefixed.nodes[0].params.path).toBe(
      "standard/ros4hri/expression/valence",
    );
    expect(prefixed.nodes[2].params.path).toBe(
      `${PREFIX}standard/vizij/expression/happy`,
    );
    // The round trip is exact — a re-exported, unedited profile diffs clean.
    expect(stripRigPrefix(prefixed, PREFIX)).toStrictEqual(canonical);
  });

  it("is the identity for an empty prefix (face without a faceId)", () => {
    expect(applyRigPrefix(canonical, "")).toStrictEqual(canonical);
    expect(stripRigPrefix(canonical, "")).toStrictEqual(canonical);
  });

  it("leaves foreign-prefix paths alone when stripping", () => {
    const other = applyRigPrefix(canonical, "rig/other_face/");
    const stripped = stripRigPrefix(other, PREFIX);
    expect(stripped.nodes[2].params.path).toBe(
      "rig/other_face/standard/vizij/expression/happy",
    );
  });
});

describe("embedded profile ids", () => {
  it("round-trips through the stable graph id", () => {
    expect(embeddedProfileGraphId("ros4hri")).toBe("standard::ros4hri");
    expect(
      embeddedProfileId({
        id: "standard::ros4hri",
        kind: "standard-profile",
        spec: {},
      }),
    ).toBe("ros4hri");
    expect(
      embeddedProfileId({ id: "the_rig", kind: "rig", spec: {} }),
    ).toBeNull();
  });
});

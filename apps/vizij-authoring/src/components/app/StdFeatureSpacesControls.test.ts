import { describe, expect, it } from "vitest";
import { deriveNamespaceAndChannelFromPath } from "./StdFeatureSpacesControls";

/** The face declares `vizij-face`, whose paths live under `standard/vizij/`. */
const DECLARED = new Map([["vizij", "Vizij face standard"]]);
const NONE = new Map<string, string>();

describe("deriveNamespaceAndChannelFromPath", () => {
  // The bug: the old rule needed 4+ segments after `standard`, so one profile
  // split across two groups purely by how deep each path happened to be.
  it("groups a declared namespace regardless of path depth", () => {
    const deep = deriveNamespaceAndChannelFromPath(
      "/standard/vizij/left_eye/pos/x",
      DECLARED,
    );
    const shallow = deriveNamespaceAndChannelFromPath(
      "/standard/vizij/expression/happy",
      DECLARED,
    );
    expect(deep.namespace).toBe("vizij");
    expect(shallow.namespace).toBe("vizij");
    expect(deep.channel).toBe("left_eye");
    expect(shallow.channel).toBe("expression");
  });

  it("without the declaration, the shallow path falls back and splits", () => {
    expect(
      deriveNamespaceAndChannelFromPath(
        "/standard/vizij/expression/happy",
        NONE,
      ).namespace,
    ).toBe("");
    expect(
      deriveNamespaceAndChannelFromPath("/standard/vizij/left_eye/pos/x", NONE)
        .namespace,
    ).toBe("vizij");
  });

  // A legacy face has no namespace at all; declaring nothing must not promote
  // its channels into groups.
  it("leaves legacy un-namespaced paths alone", () => {
    const legacy = deriveNamespaceAndChannelFromPath(
      "/standard/left_eye/pos/x",
      DECLARED,
    );
    expect(legacy.namespace).toBe("");
    expect(legacy.channel).toBe("left_eye");
  });

  it("subdivides a declared namespace by the next segment", () => {
    expect(
      deriveNamespaceAndChannelFromPath(
        "/standard/vizij/face/jaw_open",
        DECLARED,
      ),
    ).toStrictEqual({ namespace: "vizij", channel: "face" });
    expect(
      deriveNamespaceAndChannelFromPath("/standard/vizij/viseme/aa", DECLARED),
    ).toStrictEqual({ namespace: "vizij", channel: "viseme" });
  });

  it("handles a path with no standard segment", () => {
    expect(
      deriveNamespaceAndChannelFromPath("/propsrig/mouth/jawud/value", DECLARED)
        .namespace,
    ).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import type { VizijBundleProfile } from "@vizij/render";
import { namespaceOfProfile } from "./DeclaredProfilesContext";

const profileOf = (paths: string[]): VizijBundleProfile => ({
  id: "p",
  version: "v1",
  keys: paths.map((path) => ({ path })),
});

describe("namespaceOfProfile", () => {
  it("reads the namespace from face-addressed paths", () => {
    expect(
      namespaceOfProfile(
        profileOf([
          "rig/quori_latest/standard/vizij/expression/happy",
          "rig/quori_latest/standard/vizij/left_eye/pos/x",
        ]),
      ),
    ).toBe("vizij");
  });

  it("reads it from portable paths too", () => {
    expect(namespaceOfProfile(profileOf(["standard/ros4hri/au/26"]))).toBe(
      "ros4hri",
    );
  });

  // Depth must not matter — that was the bug. `expression/happy` and
  // `left_eye/pos/x` are the same profile at different path lengths.
  it("is depth-independent", () => {
    expect(
      namespaceOfProfile(
        profileOf([
          "standard/vizij/face/jaw_open",
          "standard/vizij/left_eye_top_eyelid/pos/y",
        ]),
      ),
    ).toBe("vizij");
  });

  // Grouping a profile that spans namespaces under one heading would misfile
  // most of it, so it claims none.
  it("claims no namespace when the paths disagree", () => {
    expect(
      namespaceOfProfile(
        profileOf(["standard/vizij/expression/happy", "standard/lab/x/y"]),
      ),
    ).toBeNull();
  });

  it("claims none for a profile with no standard paths", () => {
    expect(
      namespaceOfProfile(profileOf(["rig/q/poses/pose_a.weight"])),
    ).toBeNull();
    expect(namespaceOfProfile(profileOf([]))).toBeNull();
  });
});

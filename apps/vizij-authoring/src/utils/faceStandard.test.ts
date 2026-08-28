import { describe, expect, it } from "vitest";
import type { VizijBundleProfile } from "@vizij/render";
import { buildEmptyAdaptationSpec } from "./faceStandard";

const PREFIX = "rig/quori_latest/";

/** A profile as it is declared on a face, already rig-prefixed. */
function profileOf(
  paths: string[],
  defaults: Record<string, unknown> = {},
): VizijBundleProfile {
  return {
    id: "vizij-face",
    version: "v1",
    keys: paths.map((path) => ({
      path: `${PREFIX}${path}`,
      kind: "input",
      value_type: "f32",
      default_value: defaults[path],
    })),
  };
}

describe("the empty adaptation", () => {
  it("declares one input per profile path, wired to nothing", () => {
    const spec = buildEmptyAdaptationSpec(
      profileOf([
        "standard/vizij/expression/happy",
        "standard/vizij/viseme/aa",
        "standard/vizij/face/jaw_open",
      ]),
    );

    expect(spec.nodes).toHaveLength(3);
    expect(spec.edges).toStrictEqual([]);
    expect(spec.nodes.every((node) => node.type === "input")).toBe(true);
    expect(spec.nodes.map((node) => node.params?.path)).toStrictEqual([
      `${PREFIX}standard/vizij/expression/happy`,
      `${PREFIX}standard/vizij/viseme/aa`,
      `${PREFIX}standard/vizij/face/jaw_open`,
    ]);
  });

  // Node ids must be unique or the spec cannot round-trip through the editor,
  // and two namespaces can carry the same leaf name.
  it("gives every path a unique node id, even across namespaces", () => {
    const spec = buildEmptyAdaptationSpec(
      profileOf([
        "standard/vizij/expression/neutral",
        "standard/vizij/viseme/neutral",
      ]),
    );
    expect(new Set(spec.nodes.map((n) => n.id)).size).toBe(2);
  });

  it("rests each control at the profile's declared default", () => {
    const spec = buildEmptyAdaptationSpec(
      profileOf(
        ["standard/vizij/left_eye/pos/x", "standard/vizij/viseme/sil"],
        {
          "standard/vizij/viseme/sil": { f32: 1 },
        },
      ),
    );
    const value = (suffix: string) =>
      spec.nodes.find((n) => n.params?.path?.endsWith(suffix))?.params?.value;
    expect(value("viseme/sil")).toBe(1);
    // No declared default means rest at zero, so an unwired face holds neutral.
    expect(value("left_eye/pos/x")).toBe(0);
  });

  it("ignores a duplicated path rather than emitting a colliding node", () => {
    const spec = buildEmptyAdaptationSpec(
      profileOf([
        "standard/vizij/expression/happy",
        "standard/vizij/expression/happy",
      ]),
    );
    expect(spec.nodes).toHaveLength(1);
  });

  it("is empty for a profile that defines nothing", () => {
    expect(buildEmptyAdaptationSpec(profileOf([]))).toStrictEqual({
      nodes: [],
      edges: [],
    });
  });
});

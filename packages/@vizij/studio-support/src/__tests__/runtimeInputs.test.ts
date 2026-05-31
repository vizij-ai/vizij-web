import { describe, expect, it } from "vitest";
import {
  buildRuntimeInputCatalogFromConstraints,
  buildRuntimeInputWritePathMap,
  resolveRuntimeInputWritePath,
} from "../index";

describe("buildRuntimeInputCatalogFromConstraints", () => {
  it("strips runtime namespace variants so controls stage canonical paths", () => {
    const catalog = buildRuntimeInputCatalogFromConstraints(
      {
        "refface//propsrig/mouth/jawud/value": {
          min: -1,
          max: 1,
          defaultValue: 0,
        },
        "/propsrig/mouth/jawud/value": {
          min: -1,
          max: 1,
          defaultValue: 0,
        },
        "debug/refface//brow/lbrow_midud/value": {
          min: -1,
          max: 1,
          defaultValue: 0,
        },
        "/brow/lbrow_midud/value": {
          min: -1,
          max: 1,
          defaultValue: 0,
        },
      },
      { namespace: "refface" },
    );

    expect(catalog.byPath.has("/refface/propsrig/mouth/jawud/value")).toBe(
      false,
    );
    expect(catalog.byPath.has("/debug/refface/brow/lbrow_midud/value")).toBe(
      false,
    );
    expect(catalog.byPath.has("/propsrig/mouth/jawud/value")).toBe(true);
    expect(catalog.byPath.has("/brow/lbrow_midud/value")).toBe(true);
    expect(catalog.byId.has("propsrig_mouth_jawud_value")).toBe(true);
    expect(catalog.byId.has("brow_lbrow_midud_value")).toBe(true);
  });

  it("prefers graph rig paths over generic constraint paths when staging canonical inputs", () => {
    const writePaths = buildRuntimeInputWritePathMap({
      namespace: "refface",
      inputConstraints: {
        "refface/poses/pose_angry.weight": {},
      },
      graphSpec: {
        nodes: [
          {
            type: "input",
            params: {
              path: "rig/quori_latest/poses/pose_angry.weight",
            },
          },
        ],
      },
    });

    expect(
      resolveRuntimeInputWritePath({
        inputPath: "/poses/pose_angry.weight",
        writePathByNormalizedInputPath: writePaths,
        faceId: "fallback_face",
      }),
    ).toBe("rig/quori_latest/poses/pose_angry.weight");
  });

  it("falls back to the active face id when no runtime path is discoverable", () => {
    expect(
      resolveRuntimeInputWritePath({
        inputPath: "/standard/vizij/mouth/open",
        writePathByNormalizedInputPath: new Map(),
        faceId: "quori_latest",
      }),
    ).toBe("rig/quori_latest/standard/vizij/mouth/open");
  });
});

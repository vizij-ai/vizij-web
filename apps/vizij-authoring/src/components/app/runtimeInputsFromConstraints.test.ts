import { describe, expect, it } from "vitest";
import { buildRuntimeInputCatalogFromConstraints } from "./runtimeInputsFromConstraints";

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

  it("keeps non-namespaced paths untouched when namespace is absent", () => {
    const catalog = buildRuntimeInputCatalogFromConstraints({
      "/background/rotation/x": {
        min: -1,
        max: 1,
        defaultValue: 0,
      },
      "background/rotation/y": {
        min: -1,
        max: 1,
        defaultValue: 0,
      },
    });

    expect(catalog.byPath.has("/background/rotation/x")).toBe(true);
    expect(catalog.byPath.has("/background/rotation/y")).toBe(true);
    expect(catalog.byId.has("background_rotation_x")).toBe(true);
    expect(catalog.byId.has("background_rotation_y")).toBe(true);
  });
});

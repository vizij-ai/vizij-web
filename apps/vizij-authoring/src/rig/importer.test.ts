import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { AnimatableValue, AnimatableComponent } from "@vizij/utils";
import { rehydrateRigDataFromGraph } from "./importer";

describe("rehydrateRigDataFromGraph", () => {
  it("preserves standard grouping for presets and derives custom groups for imports", () => {
    const spec = {
      nodes: [],
      metadata: {
        vizij: {
          faceId: "robot_v1",
          inputs: [
            {
              id: "standard_mouth_pos_x",
              path: "/standard/mouth/pos/x",
              source: "preset",
              label: "Mouth Pos X",
              group: "standard",
              root: "standard",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
            {
              id: "custom_imported_control",
              path: "/standard/imported/custom_control",
              source: "custom",
              label: "Imported Control",
              group: "standard",
              root: "imported",
              defaultValue: 0.2,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
    } as GraphSpec;

    const rehydrated = rehydrateRigDataFromGraph(spec, {
      faceId: "robot_v1",
      animatables: {} as Record<string, AnimatableValue>,
      components: [] as AnimatableComponent[],
    });

    const presetInput = rehydrated.standardInputs.find(
      (input) => input.id === "standard_mouth_pos_x",
    );
    const importedInput = rehydrated.standardInputs.find(
      (input) => input.id === "custom_imported_control",
    );

    expect(presetInput?.group).toBe("standard");
    expect(presetInput?.path).toBe("/standard/mouth/pos/x");
    expect(importedInput?.group).toBe("imported");
    expect(importedInput?.path).toBe("/imported/custom_control");

    const presetMeta = rehydrated.inputMetadata.get("standard_mouth_pos_x");
    const customMeta = rehydrated.inputMetadata.get("custom_imported_control");
    expect(presetMeta).toEqual({ source: "preset", root: "standard" });
    expect(customMeta).toEqual({ source: "custom", root: "imported" });
  });

  it("respects renamed preset group slugs", () => {
    const spec = {
      nodes: [],
      metadata: {
        vizij: {
          faceId: "robot_v1",
          inputs: [
            {
              id: "standard_mouth_pos_x",
              path: "/standard/heroes/pos/x",
              source: "preset",
              label: "Mouth Pos X",
              group: "heroes",
              root: "heroes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
    } as GraphSpec;

    const rehydrated = rehydrateRigDataFromGraph(spec, {
      faceId: "robot_v1",
      animatables: {} as Record<string, AnimatableValue>,
      components: [] as AnimatableComponent[],
    });

    const presetInput = rehydrated.standardInputs.find(
      (input) => input.id === "standard_mouth_pos_x",
    );

    expect(presetInput?.group).toBe("heroes");
    expect(presetInput?.path).toBe("/standard/heroes/pos/x");
    expect(rehydrated.inputMetadata.get("standard_mouth_pos_x")).toEqual({
      source: "preset",
      root: "heroes",
    });
  });
});

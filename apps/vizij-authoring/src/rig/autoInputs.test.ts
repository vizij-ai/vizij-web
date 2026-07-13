import { describe, expect, it } from "vitest";
import type { AnimatableComponent, AnimatableValue } from "@vizij/utils";
import { extractAnimatableComponents } from "@vizij/utils";
import { buildAutoRigInputBlueprints } from "./autoInputs";

describe("buildAutoRigInputBlueprints", () => {
  it("produces no blueprints with empty inputs", () => {
    const result = buildAutoRigInputBlueprints(
      {},
      {} as Record<string, AnimatableValue>,
      [] as AnimatableComponent[],
      {},
    );

    expect(result.blueprints.length).toBe(0);
    expect(result.roots.length).toBe(0);
  });

  it("uses the /propsrig namespace for generated metadata inputs", () => {
    const world = {
      rigRoot: {
        id: "rigRoot",
        name: "Rig Root",
        type: "group",
        features: {
          smile: {
            animated: true,
            value: "anim_smile",
          },
        },
      },
    };

    const animatables = {
      anim_smile: {
        id: "anim_smile",
        type: "number",
        default: 0,
        name: "Smile",
        constraints: {},
      },
    } as Record<string, AnimatableValue>;

    const components: AnimatableComponent[] = [
      {
        id: "anim_smile",
        safeId: "anim_smile",
        animatableId: "anim_smile",
        animatableType: "number",
        label: "Smile",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      },
    ];

    const result = buildAutoRigInputBlueprints(
      world,
      animatables,
      components,
      {},
    );

    const generated = result.blueprints.find(
      (entry) => entry.metadata.elementType !== "standard",
    );

    expect(generated).toBeDefined();
    expect(generated?.path.startsWith("/propsrig/")).toBe(true);
  });

  it("carries the GLB base (not 0) when a raw rig's defaults are arora record-encoded", () => {
    // A raw rigged GLB, loaded through @vizij/render, marshals animatable base
    // defaults in the arora Value record encoding: scalars as { f32 } and
    // vectors as { struct: { fields } }. If extraction cannot decode these, the
    // props-rig input defaults collapse to 0 and every driven scale/opacity shape
    // (including the root group) renders blank. Drive extraction end-to-end here.
    const world = {
      face_group: {
        id: "face_group",
        name: "Face_Tran_Rot_C",
        type: "group",
        features: {
          scale: { animated: true, value: "face_scale" },
        },
      },
      face_mesh: {
        id: "face_mesh",
        name: "Face",
        type: "shape",
        features: {
          opacity: { animated: true, value: "face_opacity" },
        },
      },
    };

    const animatables = {
      face_scale: {
        id: "face_scale",
        name: "Face_Tran_Rot_C scale",
        type: "vector3",
        default: {
          struct: {
            id: "struct-id",
            fields: [
              { id: "f-x", value: { f32: 1 } },
              { id: "f-y", value: { f32: 1 } },
              { id: "f-z", value: { f32: 1 } },
            ],
          },
        },
        constraints: {},
      },
      face_opacity: {
        id: "face_opacity",
        name: "Face opacity",
        type: "number",
        default: { f32: 1 },
        constraints: {},
      },
    } as unknown as Record<string, AnimatableValue>;

    const components = extractAnimatableComponents(animatables);
    const result = buildAutoRigInputBlueprints(
      world,
      animatables,
      components,
      {},
    );

    const scaleInputs = result.blueprints.filter((entry) =>
      entry.path.includes("/scale/"),
    );
    const opacityInputs = result.blueprints.filter((entry) =>
      entry.path.includes("/opacity/"),
    );

    expect(scaleInputs.length).toBeGreaterThan(0);
    expect(opacityInputs.length).toBeGreaterThan(0);
    // The regression: these were all 0 before the arora record-form decode fix.
    scaleInputs.forEach((entry) => {
      expect(entry.input.defaultValue).toBe(1);
    });
    opacityInputs.forEach((entry) => {
      expect(entry.input.defaultValue).toBe(1);
    });
  });
});

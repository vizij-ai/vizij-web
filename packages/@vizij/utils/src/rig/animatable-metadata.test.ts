import { describe, expect, it } from "vitest";
import type { AnimatableValue } from "../animated-values";
import { extractAnimatableComponents } from "./animatable-metadata";

/**
 * Regression: the arora wasm runtime marshals animatable defaults in the engine
 * Value record encoding ({ f32: n } for scalars, { struct: { fields } } for
 * vectors) rather than plain numbers / { x, y, z }. Reading these must yield the
 * GLB base value, not fall back to 0 — otherwise every driven scale/opacity shape
 * collapses to zero and the face renders blank.
 */
describe("extractAnimatableComponents – arora record-form defaults", () => {
  it("decodes { f32 } scalar opacity defaults to the base value", () => {
    const animatables = {
      opacity_anim: {
        id: "opacity_anim",
        name: "Face opacity",
        type: "number",
        // Engine-emitted scalar Value wrapper, not a plain number.
        default: { f32: 1 },
        constraints: {},
      },
    } as unknown as Record<string, AnimatableValue>;

    const [opacity] = extractAnimatableComponents(animatables);

    expect(opacity?.defaultValue).toBe(1);
  });

  it("decodes { struct: { fields } } vector scale defaults per component", () => {
    const animatables = {
      scale_anim: {
        id: "scale_anim",
        name: "Face scale",
        type: "vector3",
        // Engine-emitted struct Value wrapper with ordered f32 fields.
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
    } as unknown as Record<string, AnimatableValue>;

    const components = extractAnimatableComponents(animatables);
    const byComponent = new Map(
      components.map((component) => [component.component, component]),
    );

    expect(byComponent.get("x")?.defaultValue).toBe(1);
    expect(byComponent.get("y")?.defaultValue).toBe(1);
    expect(byComponent.get("z")?.defaultValue).toBe(1);
  });

  it("still reads legacy plain-number and { x, y, z } defaults", () => {
    const animatables = {
      legacy_opacity: {
        id: "legacy_opacity",
        name: "Legacy opacity",
        type: "number",
        default: 0.5,
        constraints: {},
      },
      legacy_scale: {
        id: "legacy_scale",
        name: "Legacy scale",
        type: "vector3",
        default: { x: 2, y: 3, z: 4 },
        constraints: {},
      },
    } as unknown as Record<string, AnimatableValue>;

    const components = extractAnimatableComponents(animatables);
    const opacity = components.find((c) => c.animatableId === "legacy_opacity");
    const scaleX = components.find(
      (c) => c.animatableId === "legacy_scale" && c.component === "x",
    );
    const scaleZ = components.find(
      (c) => c.animatableId === "legacy_scale" && c.component === "z",
    );

    expect(opacity?.defaultValue).toBe(0.5);
    expect(scaleX?.defaultValue).toBe(2);
    expect(scaleZ?.defaultValue).toBe(4);
  });
});

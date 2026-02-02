import { describe, expect, it } from "vitest";
import type { AnimatableComponent, AnimatableValue } from "@vizij/utils";
import { buildAutoRigInputBlueprints } from "./autoInputs";

describe("buildAutoRigInputBlueprints", () => {
  it("returns no blueprints when called with empty inputs", () => {
    const result = buildAutoRigInputBlueprints(
      {},
      {} as Record<string, AnimatableValue>,
      [] as AnimatableComponent[],
      {},
    );

    expect(result.blueprints).toHaveLength(0);
    expect(result.roots).toHaveLength(0);
  });

  it("omits the standard prefix for generated metadata inputs", () => {
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
    expect(generated?.path.startsWith("/standard")).toBe(false);
  });
});

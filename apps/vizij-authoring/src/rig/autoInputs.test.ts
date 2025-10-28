import { describe, expect, it } from "vitest";
import type { AnimatableComponent, AnimatableValue } from "@vizij/utils";
import { buildAutoRigInputBlueprints } from "./autoInputs";

describe("buildAutoRigInputBlueprints", () => {
  it("tags preset standard inputs under the standard root", () => {
    const result = buildAutoRigInputBlueprints(
      {},
      {} as Record<string, AnimatableValue>,
      [] as AnimatableComponent[],
      {},
    );

    const standardBlueprints = result.blueprints.filter(
      (entry) => entry.metadata.elementType === "standard",
    );
    expect(standardBlueprints.length).toBeGreaterThan(0);
    standardBlueprints.forEach((entry) => {
      expect(entry.input.group).toBe("standard");
      expect(entry.metadata.root).toBe("standard");
    });
    expect(result.roots).toContain("standard");
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

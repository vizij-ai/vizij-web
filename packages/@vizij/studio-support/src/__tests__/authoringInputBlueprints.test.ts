import { describe, expect, it } from "vitest";
import type { AnimatableComponent, AnimatableValue } from "@vizij/utils";
import { buildAutoRigInputBlueprints } from "../utils/autoRigInputs";
import { buildFeatureEntries } from "../utils/featureEntries";

describe("authoring input blueprints", () => {
  const baseWorld = {
    shape1: {
      id: "shape1",
      name: "Face",
      type: "shape",
      tags: [],
      refs: {},
      features: {
        translation: { animated: true, value: "anim-translation" },
        smile: { animated: true, value: "anim-smile" },
      },
    },
  } as Record<string, any>;

  const baseAnimatables: Record<string, AnimatableValue> = {
    "anim-translation": {
      id: "anim-translation",
      type: "vector3",
      name: "Face Translation",
      default: { x: 0, y: 0, z: 0 },
      constraints: {
        min: [null, null, null],
        max: [null, null, null],
      },
      pub: {
        public: true,
        output: "Translation",
      },
    } as AnimatableValue,
    "anim-smile": {
      id: "anim-smile",
      type: "number",
      name: "Face Smile",
      default: 0,
      constraints: {
        min: 0,
        max: 1,
      },
      pub: {
        public: true,
        output: "Smile",
      },
    } as AnimatableValue,
  };

  it("prefers descriptor output for default feature labels", () => {
    const entries = buildFeatureEntries(baseWorld, baseAnimatables);
    const smileEntry = entries.find((entry) => entry.featureKey === "smile");

    expect(smileEntry).toBeDefined();
    expect(smileEntry?.defaultLabel).toBe("Smile");
    expect(smileEntry?.featureLabel).toBe("Smile");
  });

  it("applies feature label overrides", () => {
    const overrides = {
      "shape1:smile": "Cheer",
    };
    const entries = buildFeatureEntries(baseWorld, baseAnimatables, overrides);
    const smileEntry = entries.find((entry) => entry.featureKey === "smile");

    expect(smileEntry).toBeDefined();
    expect(smileEntry?.defaultLabel).toBe("Smile");
    expect(smileEntry?.featureLabel).toBe("Cheer");
  });

  it("produces no auto-rig input blueprints with empty inputs", () => {
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
});

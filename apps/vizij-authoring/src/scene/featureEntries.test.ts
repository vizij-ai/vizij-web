import { describe, expect, it } from "vitest";
import type { AnimatableValue } from "@vizij/utils";
import { buildFeatureEntries } from "./featureEntries";

describe("buildFeatureEntries", () => {
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

  it("prefers descriptor output for default labels", () => {
    const entries = buildFeatureEntries(baseWorld, baseAnimatables);
    const smileEntry = entries.find((entry) => entry.featureKey === "smile");
    expect(smileEntry).toBeDefined();
    expect(smileEntry?.defaultLabel).toBe("Smile");
    expect(smileEntry?.featureLabel).toBe("Smile");
  });

  it("applies label overrides", () => {
    const overrides = {
      "shape1:smile": "Cheer",
    };
    const entries = buildFeatureEntries(baseWorld, baseAnimatables, overrides);
    const smileEntry = entries.find((entry) => entry.featureKey === "smile");
    expect(smileEntry).toBeDefined();
    expect(smileEntry?.defaultLabel).toBe("Smile");
    expect(smileEntry?.featureLabel).toBe("Cheer");
  });
});

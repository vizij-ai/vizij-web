import { describe, expect, it } from "vitest";
import type { World } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import type { BindingMap } from "@vizij/node-graph-authoring";
import { extractAnimatableComponents } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import { buildSceneGraphData } from "./sceneGraph";

function createWorld(): World {
  return {
    group1: {
      id: "group1",
      name: "Root",
      type: "group",
      refs: {},
      tags: [],
      root: true,
      children: ["shape1"],
      features: {
        translation: { animated: true, value: "group-translation" },
      },
    } as any,
    shape1: {
      id: "shape1",
      name: "Face",
      type: "shape",
      refs: {},
      tags: [],
      features: {
        translation: { animated: true, value: "shape-translation" },
        opacity: { animated: false, value: 0.5 },
      },
      material: "standard",
      geometry: {} as any,
    } as any,
  } satisfies World;
}

function createAnimatables(): Record<string, AnimatableValue> {
  return {
    "group-translation": {
      id: "group-translation",
      type: "vector3",
      default: { x: 0, y: 0, z: 0 },
      constraints: { min: [null, null, null], max: [null, null, null] },
    },
    "shape-translation": {
      id: "shape-translation",
      type: "vector3",
      name: "Face Translation",
      default: { x: 0, y: 0, z: 0 },
      constraints: { min: [null, null, null], max: [null, null, null] },
    },
  } as Record<string, AnimatableValue>;
}

function createBindings(): BindingMap {
  return {
    "shape-translation:x": {
      targetId: "shape-translation:x",
      inputId: "input_smile",
      slots: [
        {
          id: "s1",
          alias: "s1",
          inputId: "input_smile",
          valueType: "scalar",
        },
      ],
      expression: "s1",
    },
  } as BindingMap;
}

const standardInputs = new Map<string, StandardRigInput>([
  [
    "input_smile",
    {
      id: "input_smile",
      path: "/face/smile",
      label: "Smile",
      group: "face",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    } as StandardRigInput,
  ],
]);

describe("buildSceneGraphData", () => {
  it("creates scene objects with feature + binding summaries", () => {
    const world = createWorld();
    const animatables = createAnimatables();
    const bindings = createBindings();
    const components = extractAnimatableComponents(animatables);

    const graph = buildSceneGraphData({
      world,
      animatables,
      bindings,
      animatableComponents: components,
      standardInputsById: standardInputs,
      featureLabelOverrides: {},
    });

    expect(graph.rootIds).toContain("group1");
    const shape = graph.nodes.find((node) => node.id === "shape1");
    expect(shape?.parentId).toBe("group1");
    expect(shape?.features.length).toBeGreaterThan(0);

    const translation = shape?.features.find(
      (feature) => feature.key === "translation",
    );
    expect(translation?.animated).toBe(true);
    expect(translation?.animatableId).toBe("shape-translation");
    expect(translation?.components).toHaveLength(3);
    const xComponent = translation?.components[0];
    expect(xComponent?.binding?.slots).toHaveLength(1);
    expect(xComponent?.binding?.slots[0]?.input?.label).toBe("Smile");

    const opacity = shape?.features.find(
      (feature) => feature.key === "opacity",
    );
    expect(opacity?.animated).toBe(false);
    expect(opacity?.elementId).toBe("shape1");
    expect(opacity?.components[0]?.staticValue).toBeCloseTo(0.5);
  });
});

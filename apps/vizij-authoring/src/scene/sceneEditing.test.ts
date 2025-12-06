import { describe, expect, it } from "vitest";
import { getLookup, type AnimatableValue } from "@vizij/utils";
import type { BindingMap } from "@vizij/node-graph-authoring";
import type { World } from "@vizij/render";
import { DEFAULT_NAMESPACE } from "../utils/constants";
import {
  deleteSceneNode,
  duplicateSceneNode,
  reparentSceneNodeWithPreservedWorld,
  TRANSLATION_SCALE_COMPENSATION,
} from "./sceneEditing";

function createAnimatable(id: string, value: number): AnimatableValue {
  return {
    id,
    type: "vector3",
    default: { x: value, y: 0, z: 0 },
    constraints: { min: [null, null, null], max: [null, null, null] },
  } as AnimatableValue;
}

describe("sceneEditing", () => {
  it("reparents while preserving world space", () => {
    const world: World = {
      root: {
        id: "root",
        name: "Root",
        type: "group",
        refs: {},
        tags: [],
        root: true,
        children: ["parent", "child"],
        features: {
          translation: { animated: true, value: "root-t" },
        },
      } as any,
      parent: {
        id: "parent",
        name: "Parent",
        type: "group",
        refs: {},
        tags: [],
        children: [],
        features: {
          translation: { animated: true, value: "parent-t" },
        },
      } as any,
      child: {
        id: "child",
        name: "Child",
        type: "shape",
        refs: {},
        tags: [],
        features: {
          translation: { animated: true, value: "child-t" },
          rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
          scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
        },
        material: "standard",
        geometry: {} as any,
      } as any,
    } satisfies World;

    const animatables: Record<string, AnimatableValue> = {
      "root-t": createAnimatable("root-t", 0),
      "parent-t": createAnimatable("parent-t", 1),
      "child-t": createAnimatable("child-t", 2),
    };

    const values = new Map<string, any>();
    const bindings = {};

    const result = reparentSceneNodeWithPreservedWorld(
      {
        world,
        animatables,
        values,
        bindings,
        namespace: DEFAULT_NAMESPACE,
      },
      "child",
      "parent",
    );

    expect(result).toBeTruthy();
    const updated = result!;
    const childFeature = (updated.world.child as any).features.translation;
    const updatedAnim = updated.animatables[childFeature.value];
    expect((updatedAnim.default as any).x).toBeCloseTo(1);
    expect((updatedAnim.default as any).y).toBeCloseTo(0);
    expect(
      (updated.values.get(getLookup(DEFAULT_NAMESPACE, updatedAnim.id)) as any)
        ?.x,
    ).toBeCloseTo(1);
  });

  it("scales translation bindings when parent scale changes", () => {
    if (!TRANSLATION_SCALE_COMPENSATION) {
      // Compensation disabled; skip assertion.
      return;
    }
    const world: World = {
      parentA: {
        id: "parentA",
        name: "A",
        type: "group",
        refs: {},
        tags: [],
        children: ["child"],
        features: {
          translation: { animated: true, value: "parentA-t" },
          scale: { animated: false, value: { x: 2, y: 2, z: 2 } },
        },
      } as any,
      parentB: {
        id: "parentB",
        name: "B",
        type: "group",
        refs: {},
        tags: [],
        children: [],
        features: {
          translation: { animated: true, value: "parentB-t" },
          scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
        },
      } as any,
      child: {
        id: "child",
        name: "Child",
        type: "shape",
        refs: {},
        tags: [],
        features: {
          translation: { animated: true, value: "child-t" },
          rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
          scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
        },
        material: "standard",
        geometry: {} as any,
      } as any,
    } satisfies World;

    const animatables: Record<string, AnimatableValue> = {
      "parentA-t": createAnimatable("parentA-t", 0),
      "parentB-t": createAnimatable("parentB-t", 0),
      "child-t": createAnimatable("child-t", 0),
    };
    const bindings: BindingMap = {
      "child-t:x": {
        targetId: "child-t:x",
        expression: "s1",
        slots: [
          { id: "s1", alias: "s1", inputId: "driver1", valueType: "scalar" },
        ],
      },
    } as any;
    const values = new Map<string, any>();

    const result = reparentSceneNodeWithPreservedWorld(
      { world, animatables, bindings, values, namespace: DEFAULT_NAMESPACE },
      "child",
      "parentB",
    );

    expect(result).toBeTruthy();
    const updatedBindings = result!.bindings;
    expect(updatedBindings["child-t:x"]?.expression).toContain("*");
    const factor = parseFloat(
      updatedBindings["child-t:x"].expression!.split("*")[1],
    );
    expect(factor).toBeCloseTo(2); // old scale 2 / new scale 1
  });

  it("duplicates nodes and carries bindings", () => {
    const world: World = {
      root: {
        id: "root",
        name: "Root",
        type: "group",
        refs: {},
        tags: [],
        children: ["shape"],
        features: {},
      } as any,
      shape: {
        id: "shape",
        name: "Shape",
        type: "shape",
        refs: {},
        tags: [],
        features: {
          translation: { animated: true, value: "anim-t" },
        },
        material: "standard",
        geometry: {} as any,
      } as any,
    };

    const animatables: Record<string, AnimatableValue> = {
      "anim-t": createAnimatable("anim-t", 0),
    };
    const bindings: Record<string, any> = {
      "anim-t:x": {
        targetId: "anim-t:x",
        expression: "s1",
        slots: [
          {
            id: "s1",
            alias: "s1",
            inputId: "driver1",
            valueType: "scalar",
          },
        ],
      },
    } as any;
    const values = new Map<string, any>();

    const result = duplicateSceneNode(
      {
        world,
        animatables,
        values,
        bindings,
        featureLabelOverrides: {},
        namespace: DEFAULT_NAMESPACE,
      },
      "shape",
      { includeChildren: false, parentId: "root" },
    );

    expect(result).toBeTruthy();
    const newId = result!.newRootId;
    const newShape = result!.world[newId] as any;
    expect(newShape).toBeDefined();
    const newAnimId = newShape.features.translation.value as string;
    expect(result!.bindings[`${newAnimId}:x`]).toBeDefined();
  });

  it("remaps binding inputs when input clones are provided", () => {
    const world: World = {
      shape: {
        id: "shape",
        name: "Shape",
        type: "shape",
        refs: {},
        tags: [],
        features: {
          translation: { animated: true, value: "anim-t" },
        },
        material: "standard",
        geometry: {} as any,
      } as any,
    };
    const animatables: Record<string, AnimatableValue> = {
      "anim-t": createAnimatable("anim-t", 0),
    };
    const bindings: Record<string, any> = {
      "anim-t:x": {
        targetId: "anim-t:x",
        expression: "s1",
        inputId: "driver1",
        slots: [
          {
            id: "s1",
            alias: "s1",
            inputId: "driver1",
            valueType: "scalar",
          },
        ],
      },
    } as any;
    const values = new Map<string, any>();

    const result = duplicateSceneNode(
      {
        world,
        animatables,
        values,
        bindings,
        featureLabelOverrides: {},
        namespace: DEFAULT_NAMESPACE,
      },
      "shape",
      {
        includeChildren: false,
        parentId: null,
        cloneInputs: () => new Map([["driver1", "driver1_copy"]]),
      },
    );

    expect(result).toBeTruthy();
    const newId = result!.newRootId;
    const newAnimId = (result!.world[newId] as any).features.translation
      .value as string;
    const clonedBinding = result!.bindings[`${newAnimId}:x`];
    expect(clonedBinding).toBeDefined();
    expect(clonedBinding.inputId).toBe("driver1_copy");
    expect(clonedBinding.slots[0]?.inputId).toBe("driver1_copy");
    expect(result!.clonedInputMap?.get("driver1")).toBe("driver1_copy");
  });

  it("cleans bindings when deleting nodes", () => {
    const world: World = {
      shape: {
        id: "shape",
        name: "Shape",
        type: "shape",
        refs: {},
        tags: [],
        features: {
          translation: { animated: true, value: "anim-t" },
        },
        material: "standard",
        geometry: {} as any,
      } as any,
    };
    const animatables: Record<string, AnimatableValue> = {
      "anim-t": createAnimatable("anim-t", 0),
    };
    const bindings: Record<string, any> = {
      "anim-t:x": {
        targetId: "anim-t:x",
        expression: "s1",
        slots: [],
      },
    } as any;
    const values = new Map<string, any>();

    const result = deleteSceneNode(
      { world, animatables, bindings, values, namespace: DEFAULT_NAMESPACE },
      "shape",
    );

    expect(result).toBeTruthy();
    expect(Object.keys(result!.bindings)).toHaveLength(0);
    expect(result!.animatables["anim-t"]).toBeUndefined();
  });
});

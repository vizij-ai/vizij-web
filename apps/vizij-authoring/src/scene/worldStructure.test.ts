import { describe, expect, it } from "vitest";
import type { AnimatableValue } from "@vizij/utils";
import {
  ShapeMaterial,
  type Feature,
  type Shape,
  type World,
} from "@vizij/render";
import { changedValues, splitWorld } from "./worldStructure";

/** A geometry stands in the structure by its `uuid`. */
function fakeGeometry(uuid: string): Shape["geometry"] {
  return { uuid } as unknown as Shape["geometry"];
}

const geometry = fakeGeometry("plate-geometry");

function face(): {
  world: World;
  animatables: Record<string, AnimatableValue>;
} {
  return {
    world: {
      root: {
        id: "root",
        name: "Root",
        tags: [],
        type: "group",
        root: true,
        features: {
          translation: { animated: false, value: { x: 0, y: 0, z: 0 } },
          rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        },
        children: ["plate", "mouth"],
      },
      plate: {
        id: "plate",
        name: "Plate",
        tags: [],
        type: "shape",
        material: ShapeMaterial.Standard,
        geometry,
        morphTargets: ["smile"],
        features: {
          // A morph weight is a feature named after its target.
          translation: { animated: false, value: { x: 1, y: 2, z: 3 } },
          rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
          color: { animated: false, value: { r: 1, g: 0, b: 0 } },
          opacity: { animated: true, value: "plate-opacity" },
          ...({ smile: { animated: false, value: 0 } } as object),
        },
      },
      mouth: {
        id: "mouth",
        name: "Mouth",
        tags: [],
        type: "ellipse",
        features: {
          translation: { animated: false, value: { x: 0, y: -1, z: 1 } },
          rotation: { animated: false, value: 0 },
          width: { animated: true, value: "mouth-width" },
          height: { animated: false, value: 1 },
          fillColor: { animated: false, value: { r: 0, g: 1, b: 0 } },
        },
      },
      elsewhere: {
        id: "elsewhere",
        name: "Elsewhere",
        tags: [],
        type: "group",
        root: true,
        features: {
          translation: { animated: false, value: { x: 0, y: 0, z: 0 } },
          rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        },
        children: [],
      },
    },
    animatables: {
      "plate-opacity": {
        id: "plate-opacity",
        type: "number",
        default: 1,
        constraints: { min: 0, max: 1 },
      },
      "mouth-width": {
        id: "mouth-width",
        type: "number",
        default: 2,
        constraints: {},
      },
    },
  };
}

type Face = ReturnType<typeof face>;

function setFeature(
  of: Face,
  elementId: string,
  name: string,
  feature: Feature,
): void {
  (of.world[elementId].features as Record<string, Feature>)[name] = feature;
}

/** The face with `change` made to a copy of it; the copy's shapes keep the
 * face's geometry instance, as the store's edits do. */
function edited(change: (face: Face) => void): Face {
  const fresh = face();
  const next: Face = {
    world: Object.fromEntries(
      Object.entries(fresh.world).map(([id, element]) => [
        id,
        { ...element, features: structuredClone(element.features) },
      ]),
    ) as World,
    animatables: structuredClone(fresh.animatables),
  };
  change(next);
  return next;
}

function split(of: Face) {
  return splitWorld(of.world, of.animatables, "root");
}

describe("splitWorld", () => {
  it("keeps the structure when an in-place value changes, and holds the new value", () => {
    const before = split(face());
    const after = split(
      edited((next) => {
        setFeature(next, "plate", "color", {
          animated: false,
          value: { r: 0, g: 0, b: 1 },
        });
        setFeature(next, "mouth", "translation", {
          animated: false,
          value: { x: 5, y: -1, z: 1 },
        });
        setFeature(next, "plate", "smile", {
          animated: false,
          value: 0.5,
        });
      }),
    );
    expect(after.structure).toBe(before.structure);
    expect(changedValues(before.values, after.values)).toEqual([
      { elementId: "plate", feature: "color", value: { r: 0, g: 0, b: 1 } },
      { elementId: "plate", feature: "smile", value: 0.5 },
      {
        elementId: "mouth",
        feature: "translation",
        value: { x: 5, y: -1, z: 1 },
      },
    ]);
  });

  it("takes an animatable's default in place on the features it animates", () => {
    const before = split(face());
    const after = split(
      edited((next) => {
        next.animatables["plate-opacity"] = {
          ...next.animatables["plate-opacity"],
          default: 0.25,
        } as AnimatableValue;
      }),
    );
    expect(after.structure).toBe(before.structure);
    expect(changedValues(before.values, after.values)).toEqual([
      { elementId: "plate", feature: "opacity", value: 0.25 },
    ]);
  });

  it.each([
    [
      "an element removed",
      (next: Face) => {
        (next.world.root as { children: string[] }).children = ["plate"];
      },
    ],
    [
      "a renamed element",
      (next: Face) => {
        next.world.plate = { ...next.world.plate, name: "Shield" };
      },
    ],
    [
      "new geometry",
      (next: Face) => {
        next.world.plate = {
          ...next.world.plate,
          geometry: fakeGeometry("replacement-geometry"),
        } as World[string];
      },
    ],
    [
      "a feature newly animated",
      (next: Face) => {
        setFeature(next, "plate", "color", {
          animated: true,
          value: "plate-opacity",
        });
      },
    ],
    [
      "the default of an animatable that animates a feature taken only at load",
      (next: Face) => {
        next.animatables["mouth-width"] = {
          ...next.animatables["mouth-width"],
          default: 3,
        } as AnimatableValue;
      },
    ],
    [
      "an animatable's range",
      (next: Face) => {
        next.animatables["plate-opacity"] = {
          ...next.animatables["plate-opacity"],
          constraints: { min: 0, max: 2 },
        } as AnimatableValue;
      },
    ],
    [
      "a value the face draws only at load",
      (next: Face) => {
        setFeature(next, "mouth", "fillColor", {
          animated: false,
          value: { r: 1, g: 1, b: 0 },
        });
      },
    ],
    [
      "a value in a form the face does not take in place",
      (next: Face) => {
        setFeature(next, "mouth", "rotation", { animated: false, value: 0.3 });
      },
    ],
  ])("changes the structure for %s", (_, change) => {
    expect(split(edited(change)).structure).not.toBe(split(face()).structure);
  });

  it("ignores the elements outside the root", () => {
    const after = split(
      edited((next) => {
        next.world.elsewhere = { ...next.world.elsewhere, name: "Moved" };
      }),
    );
    expect(after.structure).toBe(split(face()).structure);
  });
});

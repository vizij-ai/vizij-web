import { describe, expect, it } from "vitest";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { resolveSelectionTargetIds } from "./bindingSelection";

const OBJECTS: SceneObjectNode[] = [
  {
    id: "shape_head",
    name: "Head",
    type: "shape",
    parentId: null,
    childIds: [],
    features: [
      {
        id: "feature_translation",
        key: "translation",
        label: "Translation",
        defaultLabel: "Translation",
        type: "vector3",
        animated: true,
        elementId: "shape_head",
        elementName: "Head",
        elementType: "shape",
        components: [
          { id: "tx", label: "X", targetId: "anim://tx" },
          { id: "ty", label: "Y", targetId: "anim://ty" },
          { id: "tz", label: "Z", targetId: "anim://tz" },
        ],
      },
    ],
  } as SceneObjectNode,
];

describe("resolveSelectionTargetIds", () => {
  it("returns explicit leaf target ids when provided", () => {
    const targets = resolveSelectionTargetIds(
      {
        type: "property",
        objectId: "shape_head",
        featureId: "feature_translation",
        label: "Head · Translation.X",
        targetId: "anim://tx",
      },
      OBJECTS,
    );

    expect(targets).toEqual(["anim://tx"]);
  });

  it("returns explicit bulk target ids when provided", () => {
    const targets = resolveSelectionTargetIds(
      {
        type: "property",
        objectId: "shape_head",
        featureId: "feature_translation",
        label: "Head · Translation",
        targetIds: ["anim://tx", "anim://ty", "anim://tz"],
      },
      OBJECTS,
    );

    expect(targets).toEqual(["anim://tx", "anim://ty", "anim://tz"]);
  });

  it("falls back to feature component targets when explicit targets are absent", () => {
    const targets = resolveSelectionTargetIds(
      {
        type: "property",
        objectId: "shape_head",
        featureId: "feature_translation",
        label: "Head · Translation",
      },
      OBJECTS,
    );

    expect(targets).toEqual(["anim://tx", "anim://ty", "anim://tz"]);
  });
});

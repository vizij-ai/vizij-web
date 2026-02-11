import { describe, expect, it } from "vitest";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { collectRigDependents } from "./rigConnections";

function createSceneNode(
  id: string,
  featureTargetIds: string[],
  name = id,
): SceneObjectNode {
  return {
    id,
    name,
    type: "shape",
    parentId: null,
    childIds: [],
    features: featureTargetIds.map((targetId, index) => ({
      id: `${id}_feature_${index}`,
      key: `feature_${index}`,
      label: `Feature ${index}`,
      defaultLabel: `Feature ${index}`,
      type: "number",
      animated: true,
      elementId: id,
      elementName: name,
      elementType: "shape",
      components: [
        {
          id: `${targetId}_component`,
          label: "Value",
          targetId,
        },
      ],
    })),
  } as SceneObjectNode;
}

describe("collectRigDependents", () => {
  it("includes indirect targets driven through parent rig bindings", () => {
    const bindings: BindingMap = {
      "anim://mouth/open": {
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/child/mouth_open" }],
      },
    };
    const inputBindings: InputBindingMap = {
      "rig/child/mouth_open": {
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/parent/jaw_open" }],
      },
    };
    const objects = [
      createSceneNode("face_mesh", ["anim://mouth/open"], "Face Mesh"),
    ];

    const dependents = collectRigDependents({
      selectedRigId: "rig/parent/jaw_open",
      bindings,
      inputBindings,
      objects,
    });

    expect(dependents).toHaveLength(1);
    expect(dependents[0]).toMatchObject({
      targetId: "anim://mouth/open",
      name: "Face Mesh · Feature 0",
    });
  });

  it("returns no dependents when a rig input is disconnected", () => {
    const bindings: BindingMap = {
      "anim://mouth/open": {
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/child/mouth_open" }],
      },
    };
    const inputBindings: InputBindingMap = {};
    const objects = [
      createSceneNode("face_mesh", ["anim://mouth/open"], "Face Mesh"),
    ];

    const dependents = collectRigDependents({
      selectedRigId: "rig/parent/jaw_open",
      bindings,
      inputBindings,
      objects,
    });

    expect(dependents).toEqual([]);
  });
});

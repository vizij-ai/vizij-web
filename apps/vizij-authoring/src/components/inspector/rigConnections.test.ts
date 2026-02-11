import { describe, expect, it } from "vitest";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { buildPoseRigFaceTrace, collectRigDependents } from "./rigConnections";

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
        targetId: "anim://mouth/open",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/child/mouth_open" }],
      },
    };
    const inputBindings: InputBindingMap = {
      "rig/child/mouth_open": {
        targetId: "rig/child/mouth_open",
        inputId: null,
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
        targetId: "anim://mouth/open",
        inputId: null,
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

describe("buildPoseRigFaceTrace", () => {
  const standardInputsById = new Map<string, StandardRigInput>([
    [
      "rig/parent/jaw_open",
      {
        id: "rig/parent/jaw_open",
        path: "/standard/face/jaw/open",
        label: "Jaw Open",
        group: "standard",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      },
    ],
    [
      "rig/child/mouth_open",
      {
        id: "rig/child/mouth_open",
        path: "/standard/face/mouth/open",
        label: "Mouth Open",
        group: "standard",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      },
    ],
  ]);

  it("traces pose outputs through rig chains to animatable targets", () => {
    const bindings: BindingMap = {
      "anim://mouth/open": {
        targetId: "anim://mouth/open",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/child/mouth_open" }],
      },
    };
    const inputBindings: InputBindingMap = {
      "rig/child/mouth_open": {
        targetId: "rig/child/mouth_open",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/parent/jaw_open" }],
      },
    };
    const objects = [
      createSceneNode("face_mesh", ["anim://mouth/open"], "Face Mesh"),
    ];

    const trace = buildPoseRigFaceTrace({
      node: objects[0],
      objects,
      bindings,
      inputBindings,
      poses: [
        {
          id: "pose_1",
          name: "Jaw Open Pose",
          values: { "rig/parent/jaw_open": 0.9 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      neutralInputs: { "rig/parent/jaw_open": 0 },
      standardInputsById,
    });

    expect(trace.targets).toHaveLength(1);
    expect(trace.targets[0]).toMatchObject({
      targetId: "anim://mouth/open",
      directRigInputIds: ["rig/child/mouth_open"],
      upstreamRigInputIds: ["rig/child/mouth_open", "rig/parent/jaw_open"],
    });
    expect(trace.targets[0].matchedPoseOutputs).toHaveLength(1);
    expect(trace.unmatchedPoseOutputs).toEqual([]);
  });

  it("reports unmatched pose outputs as diagnostics", () => {
    const bindings: BindingMap = {};
    const inputBindings: InputBindingMap = {};
    const objects = [createSceneNode("face_mesh", [], "Face Mesh")];

    const trace = buildPoseRigFaceTrace({
      node: objects[0],
      objects,
      bindings,
      inputBindings,
      poses: [
        {
          id: "pose_1",
          name: "Jaw Open Pose",
          values: { "rig/parent/jaw_open": 0.9 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      neutralInputs: { "rig/parent/jaw_open": 0 },
      standardInputsById,
    });

    expect(trace.targets).toEqual([]);
    expect(trace.unmatchedPoseOutputs).toHaveLength(1);
    expect(trace.diagnostics.join(" ")).toMatch(/not mapped/i);
  });
});

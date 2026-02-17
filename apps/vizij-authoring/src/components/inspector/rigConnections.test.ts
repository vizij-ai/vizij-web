import { describe, expect, it } from "vitest";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  buildPoseRigFaceTrace,
  collectDirectDownstreamRigInputs,
  collectRigDependents,
  selectSafePoseRigTraceSuggestions,
  summarizeTraceConnections,
  type PoseRigTraceSuggestion,
} from "./rigConnections";

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

describe("collectDirectDownstreamRigInputs", () => {
  it("returns direct child rig inputs that reference the selected rig", () => {
    const inputBindings: InputBindingMap = {
      "rig/child/mouth_open": {
        targetId: "rig/child/mouth_open",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/parent/jaw_open" }],
      },
      "rig/child/lip_raise": {
        targetId: "rig/child/lip_raise",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/parent/jaw_open" }],
      },
      "rig/child/unused": {
        targetId: "rig/child/unused",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/other/source" }],
      },
    };
    const standardInputsById = new Map<string, StandardRigInput>([
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
      [
        "rig/child/lip_raise",
        {
          id: "rig/child/lip_raise",
          path: "/standard/face/lip/raise",
          label: "Lip Raise",
          group: "standard",
          defaultValue: 0,
          range: { min: -1, max: 1 },
        },
      ],
    ]);

    const dependents = collectDirectDownstreamRigInputs({
      selectedRigId: "rig/parent/jaw_open",
      inputBindings,
      standardInputsById,
    });

    expect(dependents).toEqual([
      { id: "rig/child/lip_raise", label: "Lip Raise" },
      { id: "rig/child/mouth_open", label: "Mouth Open" },
    ]);
  });

  it("omits direct child autorig inputs from downstream variable list", () => {
    const inputBindings: InputBindingMap = {
      "autorig/eye/open": {
        targetId: "autorig/eye/open",
        inputId: null,
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "rig/parent/jaw_open" }],
      },
    };
    const standardInputsById = new Map<string, StandardRigInput>([
      [
        "autorig/eye/open",
        {
          id: "autorig/eye/open",
          path: "/autorig/eye/open",
          label: "Eye Open",
          group: "autorig",
          defaultValue: 0,
          range: { min: -1, max: 1 },
        },
      ],
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
    ]);

    const dependents = collectDirectDownstreamRigInputs({
      selectedRigId: "rig/parent/jaw_open",
      inputBindings,
      standardInputsById,
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
    expect(trace.suggestedFixes).toEqual([]);
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
    expect(trace.suggestedFixes).toEqual([]);
    expect(trace.diagnostics.join(" ")).toMatch(/not mapped/i);
  });

  it("suggests parent-binding links for valid but disconnected pose outputs", () => {
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

    expect(
      trace.suggestedFixes.some((fix) => fix.kind === "link-parent-binding"),
    ).toBe(true);
  });

  it("suggests output retargeting for unknown legacy pose input ids", () => {
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
          name: "Legacy Pose",
          values: { "legacy/jaw/open": 0.9 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      neutralInputs: { "legacy/jaw/open": 0 },
      standardInputsById,
    });

    expect(
      trace.suggestedFixes.some((fix) => fix.kind === "retarget-pose-output"),
    ).toBe(true);
  });
});

describe("summarizeTraceConnections", () => {
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

  it("derives rig and pose summaries from transitive trace chains", () => {
    const summary = summarizeTraceConnections(
      [
        {
          targetId: "anim://mouth/open",
          targetLabel: "Face Mesh · Mouth Open",
          directRigInputIds: ["rig/child/mouth_open"],
          upstreamRigInputIds: ["rig/child/mouth_open", "rig/parent/jaw_open"],
          matchedPoseOutputs: [
            {
              poseId: "pose_1",
              poseName: "Jaw Open Pose",
              inputId: "rig/parent/jaw_open",
              value: 0.8,
              neutral: 0,
            },
          ],
          diagnostics: [],
        },
      ],
      standardInputsById,
    );

    expect(summary.rigs.map((entry) => entry.id)).toEqual([
      "rig/parent/jaw_open",
      "rig/child/mouth_open",
    ]);
    expect(
      summary.rigs.find((entry) => entry.id === "rig/child/mouth_open")
        ?.sourceKinds,
    ).toEqual(["pose-entry"]);
    expect(
      summary.rigs.find((entry) => entry.id === "rig/parent/jaw_open")
        ?.sourceKinds,
    ).toEqual(["pose-aggregate-output"]);
    expect(summary.poses).toEqual([
      {
        id: "pose_1",
        label: "Jaw Open Pose",
        features: ["Face Mesh · Mouth Open"],
      },
    ]);
  });
});

describe("selectSafePoseRigTraceSuggestions", () => {
  it("keeps only high-confidence non-conflicting suggestions", () => {
    const suggestions: PoseRigTraceSuggestion[] = [
      {
        id: "link-high",
        kind: "link-parent-binding",
        poseId: "pose_1",
        poseName: "Pose 1",
        childInputId: "rig/child/mouth_open",
        upstreamInputId: "rig/parent/jaw_open",
        targetId: "anim://mouth/open",
        targetLabel: "Face Mesh · Mouth Open",
        confidence: 0.91,
        reason: "Best link",
      },
      {
        id: "link-dup",
        kind: "link-parent-binding",
        poseId: "pose_1",
        poseName: "Pose 1",
        childInputId: "rig/child/mouth_open",
        upstreamInputId: "rig/parent/lip_open",
        targetId: "anim://mouth/open",
        targetLabel: "Face Mesh · Mouth Open",
        confidence: 0.82,
        reason: "Duplicate child target",
      },
      {
        id: "retarget-high",
        kind: "retarget-pose-output",
        poseId: "pose_1",
        poseName: "Pose 1",
        fromInputId: "legacy/jaw/open",
        toInputId: "rig/parent/jaw_open",
        confidence: 0.88,
        reason: "Best retarget",
      },
      {
        id: "retarget-target-conflict",
        kind: "retarget-pose-output",
        poseId: "pose_1",
        poseName: "Pose 1",
        fromInputId: "legacy/lip/open",
        toInputId: "rig/parent/jaw_open",
        confidence: 0.86,
        reason: "Conflicts on same pose target",
      },
      {
        id: "retarget-low",
        kind: "retarget-pose-output",
        poseId: "pose_2",
        poseName: "Pose 2",
        fromInputId: "legacy/brow/down",
        toInputId: "rig/brow/down",
        confidence: 0.41,
        reason: "Low confidence",
      },
    ];

    const selected = selectSafePoseRigTraceSuggestions(suggestions, 0.6);
    expect(selected.map((entry) => entry.id)).toEqual([
      "link-high",
      "retarget-high",
    ]);
  });
});

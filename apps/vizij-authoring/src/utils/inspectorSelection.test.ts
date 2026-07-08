import { describe, expect, it } from "vitest";
import {
  areActiveInspectorTargetsEqual,
  synchronizeActiveInspectorTarget,
  type ActiveInspectorSelectionState,
  type ActiveInspectorTarget,
} from "./inspectorSelection";

function createState(
  overrides: Partial<ActiveInspectorSelectionState> = {},
): ActiveInspectorSelectionState {
  return {
    selectedSceneId: null,
    selectedRigId: null,
    selectedPoseId: null,
    selectedMaterialId: null,
    selectedPoseGroup: null,
    selectedBlendStage: null,
    selectedAnimationTargetId: null,
    selectedAnimationTrackId: null,
    selectedProgramTargetId: null,
    selectedMotionGraphNodeId: null,
    ...overrides,
  };
}

describe("areActiveInspectorTargetsEqual", () => {
  it("compares like-for-like inspector targets", () => {
    expect(
      areActiveInspectorTargetsEqual(
        { kind: "rig", id: "jaw.open" },
        { kind: "rig", id: "jaw.open" },
      ),
    ).toBe(true);
    expect(
      areActiveInspectorTargetsEqual(
        { kind: "rig", id: "jaw.open" },
        { kind: "rig", id: "eye.blink" },
      ),
    ).toBe(false);
    expect(
      areActiveInspectorTargetsEqual(
        { kind: "animation-track", targetId: "clip:a", trackId: "track:1" },
        { kind: "animation-track", targetId: "clip:a", trackId: "track:1" },
      ),
    ).toBe(true);
  });
});

describe("synchronizeActiveInspectorTarget", () => {
  it("keeps the last selected scene target active", () => {
    expect(
      synchronizeActiveInspectorTarget(
        { kind: "scene", id: "mouth" },
        createState({ selectedSceneId: "mouth" }),
      ),
    ).toEqual({ kind: "scene", id: "mouth" });
  });

  it("clears a scene inspector without jumping to an unrelated asset target", () => {
    expect(
      synchronizeActiveInspectorTarget(
        { kind: "scene", id: "mouth" },
        createState({
          selectedSceneId: null,
          selectedAnimationTargetId: "authored-animation:idle",
        }),
      ),
    ).toBeNull();
  });

  it("falls back from a track inspector to the selected animation target", () => {
    expect(
      synchronizeActiveInspectorTarget(
        {
          kind: "animation-track",
          targetId: "authored-animation:idle",
          trackId: "track-1",
        },
        createState({
          selectedAnimationTargetId: "authored-animation:idle",
          selectedAnimationTrackId: null,
        }),
      ),
    ).toEqual({
      kind: "animation-target",
      targetId: "authored-animation:idle",
    });
  });

  it("keeps a track inspector aligned with the current selected track", () => {
    expect(
      synchronizeActiveInspectorTarget(
        {
          kind: "animation-track",
          targetId: "authored-animation:idle",
          trackId: "track-1",
        },
        createState({
          selectedAnimationTargetId: "authored-animation:idle",
          selectedAnimationTrackId: "track-2",
        }),
      ),
    ).toEqual({
      kind: "animation-track",
      targetId: "authored-animation:idle",
      trackId: "track-2",
    });
  });

  it("falls back from a graph node inspector to the selected program", () => {
    expect(
      synchronizeActiveInspectorTarget(
        {
          kind: "motiongraph-node",
          targetId: "authored-procedural:blink",
          nodeId: "node-a",
        },
        createState({
          selectedProgramTargetId: "authored-procedural:blink",
          selectedMotionGraphNodeId: null,
        }),
      ),
    ).toEqual({
      kind: "program-target",
      targetId: "authored-procedural:blink",
    });
  });

  it("keeps same-family authored asset selection synced after target changes", () => {
    const current: ActiveInspectorTarget = {
      kind: "animation-target",
      targetId: "authored-animation:old",
    };
    expect(
      synchronizeActiveInspectorTarget(
        current,
        createState({ selectedAnimationTargetId: "authored-animation:new" }),
      ),
    ).toEqual({
      kind: "animation-target",
      targetId: "authored-animation:new",
    });
  });
});

import { describe, it, expect } from "vitest";
import { createPoseRigStore } from "./store";

describe("PoseRigStore", () => {
  it("initializes with default state", () => {
    const store = createPoseRigStore();
    const state = store.getState();
    expect(state.rigName).toBe("pose_rig");
    expect(state.poses).toEqual([]);
    expect(state.neutralInputs).toEqual({});
  });

  it("creates a pose", () => {
    const store = createPoseRigStore();
    store.getState().createPose("Test Pose");
    const state = store.getState();
    expect(state.poses.length).toBe(1);
    expect(state.poses[0].name).toBe("Test Pose");
    expect(state.selectedPoseId).toBe(state.poses[0].id);
  });

  it("deletes a pose", () => {
    const store = createPoseRigStore();
    store.getState().createPose("P1");
    const p1Id = store.getState().poses[0].id;
    store.getState().deletePose(p1Id);
    expect(store.getState().poses.length).toBe(0);
  });

  it("updates current values", () => {
    const store = createPoseRigStore();
    store.getState().updateCurrentValues({ a: 1 });
    expect(store.getState().currentValues).toEqual({ a: 1 });
    store.getState().updateCurrentValues({ b: 2 });
    expect(store.getState().currentValues).toEqual({ a: 1, b: 2 });
  });

  it("captures pose", () => {
    const store = createPoseRigStore();
    store.getState().createPose("P1");
    const p1Id = store.getState().poses[0].id;

    store.getState().updateCurrentValues({ a: 1 });
    store.getState().setNeutralInputs({ a: 0 });

    store.getState().capturePose(p1Id);

    const pose = store.getState().poses[0];
    expect(pose.values).toEqual({ a: 1 });
  });
});

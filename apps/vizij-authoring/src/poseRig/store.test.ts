import { describe, it, expect } from "vitest";
import { createPoseRigStore } from "./store";
import type { PoseDefinition, PoseRigConfigFile, PoseRigIrFile } from "./types";
import { PoseIrService } from "./services/poseIrService";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
} from "./types";

function makePose(
  id: string,
  name: string,
  overrides?: Partial<PoseDefinition>,
): PoseDefinition {
  return {
    id,
    name,
    description: "",
    group: null,
    values: {},
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createInput(id: string) {
  return {
    id,
    label: id,
    path: `/${id}`,
    group: "/",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  };
}

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

  it("creates poses with deterministic, collision-safe ids", () => {
    const store = createPoseRigStore();
    store.getState().createPose("Smile", "emotion");
    store.getState().createPose("Smile", "emotion");
    store.getState().createPose("Smile", "viseme");

    expect(store.getState().poses.map((pose) => pose.id)).toEqual([
      "pose_smile",
      "pose_smile_2",
      "pose_smile_3",
    ]);
  });

  it("duplicates poses with deterministic, collision-safe ids", () => {
    const store = createPoseRigStore();
    store
      .getState()
      .addPose(makePose("legacy_pose", "Legacy Pose", { group: "emotion" }));

    store.getState().duplicatePose("legacy_pose");
    store.getState().duplicatePose("legacy_pose");

    expect(store.getState().poses.map((pose) => pose.id)).toEqual([
      "legacy_pose",
      "pose_legacy_pose_copy",
      "pose_legacy_pose_copy_2",
    ]);
  });

  it("preserves valid ids on add and resolves collisions deterministically", () => {
    const store = createPoseRigStore();
    store.getState().addPose(makePose("pose_keep", "Keep"));
    store.getState().addPose(makePose("pose_keep", "Keep Collision"));
    store
      .getState()
      .addPose(makePose("bad id", "Wide Smile", { group: "emotion" }));
    store.getState().addPose(makePose("", "Wide Smile", { group: "emotion" }));

    expect(store.getState().poses.map((pose) => pose.id)).toEqual([
      "pose_keep",
      "pose_keep_2",
      "pose_wide_smile",
      "pose_wide_smile_2",
    ]);
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

  it("preserves valid imported ids and resolves import collisions deterministically", () => {
    const store = createPoseRigStore();
    const config: PoseRigConfigFile = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [
        makePose("pose_keep", "Keep", { group: "emotion" }),
        makePose("pose_keep", "Keep Collision", { group: "emotion" }),
        makePose("bad id", "Smile", { group: "emotion" }),
        makePose("", "Smile", { group: "emotion" }),
      ],
    };

    store.getState().importConfig(config);

    expect(store.getState().poses.map((pose) => pose.id)).toEqual([
      "pose_keep",
      "pose_keep_2",
      "pose_smile",
      "pose_smile_2",
    ]);
  });

  it("keeps pose identity stable when group membership changes", () => {
    const store = createPoseRigStore();
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBe("pose_smile");

    if (!poseId) {
      return;
    }

    store.getState().createPoseGroup("emotion/main");
    store.getState().updatePoseGroup(poseId, "emotion/main");
    const assigned = store.getState().poses.find((pose) => pose.id === poseId);
    expect(assigned?.id).toBe("pose_smile");
    expect(assigned?.groupId).toBe("emotion_main");
    expect(assigned?.groupIds).toEqual(["emotion_main"]);

    store.getState().updatePoseGroup(poseId, null);
    const unassigned = store
      .getState()
      .poses.find((pose) => pose.id === poseId);
    expect(unassigned?.id).toBe("pose_smile");
    expect(unassigned?.group).toBeNull();
    expect(unassigned?.groupId).toBeNull();
    expect(unassigned?.groupIds).toEqual([]);
  });

  it("adds and removes multi-group memberships independently", () => {
    const store = createPoseRigStore();
    store.getState().createPose("Smile");
    store.getState().createPoseGroup("emotion/main");
    store.getState().createPoseGroup("viseme/main");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBe("pose_smile");

    if (!poseId) {
      return;
    }

    store.getState().addPoseToGroup(poseId, "emotion/main");
    store.getState().addPoseToGroup(poseId, "emotion/main");
    store.getState().addPoseToGroup(poseId, "viseme/main");

    const assigned = store.getState().poses.find((pose) => pose.id === poseId);
    expect(assigned?.groupIds).toEqual(["emotion_main", "viseme_main"]);
    expect(assigned?.groupId).toBe("emotion_main");
    expect(assigned?.group).toBe("emotion/main");

    store.getState().removePoseFromGroup(poseId, "emotion/main");
    const afterFirstRemoval = store
      .getState()
      .poses.find((pose) => pose.id === poseId);
    expect(afterFirstRemoval?.groupIds).toEqual(["viseme_main"]);
    expect(afterFirstRemoval?.groupId).toBe("viseme_main");
    expect(afterFirstRemoval?.group).toBe("viseme/main");

    store.getState().removePoseFromGroup(poseId, "viseme/main");
    const afterSecondRemoval = store
      .getState()
      .poses.find((pose) => pose.id === poseId);
    expect(afterSecondRemoval?.groupIds).toEqual([]);
    expect(afterSecondRemoval?.groupId).toBeNull();
    expect(afterSecondRemoval?.group).toBeNull();
  });

  it("migrates legacy group fields into canonical membership on import", () => {
    const store = createPoseRigStore();
    const config: PoseRigConfigFile = {
      version: 1,
      faceId: "face",
      neutralInputs: { smile: 0 },
      poseGroups: [{ id: "emotion", name: "Emotion", path: "emotion" }],
      poses: [
        makePose("pose_legacy", "Legacy Smile", {
          group: "emotion",
          groupId: "emotion",
          values: { smile: 0.5 },
        }),
      ],
    };

    store.getState().importConfig(config);
    const pose = store.getState().poses[0];
    expect(pose?.id).toBe("pose_legacy");
    expect(pose?.group).toBe("emotion");
    expect(pose?.groupId).toBe("emotion");
    expect(pose?.groupIds).toEqual(["emotion"]);
    expect(pose?.values).toEqual({ smile: 0.5 });
  });

  it("tracks pose IR draft as the canonical authoring model", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();

    if (!poseId) {
      return;
    }

    store.getState().updateCurrentValues({ smile: 0.7 });
    store.getState().addPoseInput(poseId, "smile");

    const ir = store.getState().poseIrDraft;
    expect(ir?.contracts).toEqual({
      targetIds: POSE_IR_TARGETING_CONTRACT,
      syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
    });
    expect(ir?.poses[0]?.targets).toEqual({ smile: 0.7 });
  });

  it("keeps pose config draft projected from the current pose IR", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    store.getState().updateCurrentValues({ smile: 0.42 });
    store.getState().addPoseInput(poseId, "smile");
    store.getState().createPoseGroup("emotion/main");
    store.getState().addPoseToGroup(poseId, "emotion/main");

    const state = store.getState();
    const ir = state.poseIrDraft;
    expect(ir).toBeTruthy();
    if (!ir) {
      return;
    }
    expect(state.poseConfigDraft).toEqual(PoseIrService.toConfig(ir));
  });

  it("ignores pose input additions for non-canonical ids", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();

    if (!poseId) {
      return;
    }

    store.getState().addPoseInput(poseId, "ghost_input");
    expect(store.getState().poses[0]?.values).toEqual({});
  });

  it("imports pose IR payloads into store state", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    const ir: PoseRigIrFile = {
      version: 1,
      faceId: "face",
      rigKind: "face-specific",
      title: "Imported IR",
      contracts: {
        targetIds: POSE_IR_TARGETING_CONTRACT,
        syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
      },
      neutral: {
        mode: "explicit",
        values: { smile: 0.1 },
      },
      crossGroupPolicy: { mode: "average" },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          targets: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    store.getState().importIr(ir);

    const state = store.getState();
    expect(state.rigName).toBe("Imported IR");
    expect(state.poses[0]).toMatchObject({
      id: "pose_smile",
      groupIds: ["emotion"],
      values: { smile: 0.8 },
    });
    expect(state.poseIrDraft?.poses[0]?.targets).toEqual({ smile: 0.8 });
  });
});

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
    expect(state.neutralMode).toBe("face-default");
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

  it("does not notify subscribers for no-op pose updates", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.getState().updatePose(poseId, (pose) => pose);
    unsubscribe();

    expect(notifications).toBe(0);
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

  it("switches neutral mode to explicit when neutral is captured", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().updateCurrentValues({ smile: 0.3 });

    store.getState().captureNeutral();
    const state = store.getState();
    expect(state.neutralMode).toBe("explicit");
    expect(state.neutralInputs.smile).toBeCloseTo(0.3, 6);
    expect(state.poseIrDraft?.neutral.mode).toBe("explicit");
  });

  it("preserves authored neutral mode through IR projection", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    store.getState().addPoseInput(poseId, "smile");
    store.getState().setNeutralMode("face-default");
    const state = store.getState();
    expect(state.neutralMode).toBe("face-default");
    expect(state.poseIrDraft?.neutral.mode).toBe("face-default");
    expect(state.poseConfigDraft?.neutralMode).toBe("face-default");
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
    expect(ir?.poses[0]?.targets).toEqual({ smile: 0 });
  });

  it("adds new pose channels at neutral/default to avoid immediate output jumps", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    store.getState().updateCurrentValues({ smile: 0.8 });
    store.getState().addPoseInput(poseId, "smile");

    expect(store.getState().poses[0]?.values).toEqual({ smile: 0 });
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

  it("preserves imported cross-group channel overrides through projection rebuilds", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    const config: PoseRigConfigFile = {
      version: 1,
      faceId: "face",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      crossGroupBlendMode: "average",
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      crossGroupChannelOverrides: {
        smile: {
          mode: "priority",
          priorityOrder: ["viseme", "emotion"],
          tieBreak: "group-id",
        },
      },
      poses: [
        makePose("pose_smile", "Smile", {
          groupIds: ["emotion"],
          groupId: "emotion",
          group: "emotion",
          values: { smile: 0.6 },
        }),
        makePose("pose_viseme", "Viseme", {
          groupIds: ["viseme"],
          groupId: "viseme",
          group: "viseme",
          values: { smile: -0.2 },
        }),
      ],
    };

    store.getState().importConfig(config);
    expect(store.getState().poseIrDraft?.crossGroupPolicy.overrides).toEqual({
      smile: {
        mode: "priority",
        priorityOrder: ["viseme", "emotion"],
        tieBreak: "group-id",
      },
    });

    const smilePoseId = store
      .getState()
      .poses.find((pose) => pose.id === "pose_smile")?.id;
    expect(smilePoseId).toBeTruthy();
    if (!smilePoseId) {
      return;
    }

    store.getState().updateCurrentValues({ smile: 0.75 });
    store.getState().capturePose(smilePoseId);

    const state = store.getState();
    expect(state.poseConfigDraft?.crossGroupChannelOverrides).toEqual({
      smile: {
        mode: "priority",
        priorityOrder: ["viseme", "emotion"],
        tieBreak: "group-id",
      },
    });
    expect(state.poseIrDraft?.crossGroupPolicy.overrides).toEqual({
      smile: {
        mode: "priority",
        priorityOrder: ["viseme", "emotion"],
        tieBreak: "group-id",
      },
    });
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

  it("defaults added pose channels to add compose mode and clears mode on removal", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPose("Smile");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    store.getState().addPoseInput(poseId, "smile");
    expect(store.getState().poses[0]?.composeModes).toEqual({ smile: "add" });
    expect(store.getState().poseConfigDraft?.poses[0]?.composeModes).toEqual({
      smile: "add",
    });
    expect(store.getState().poseIrDraft?.poses[0]?.composeModes).toEqual({
      smile: "add",
    });

    store.getState().updatePose(poseId, (pose) => ({
      ...pose,
      composeModes: { ...(pose.composeModes ?? {}), smile: "average" },
    }));
    expect(store.getState().poses[0]?.composeModes).toEqual({
      smile: "average",
    });

    store.getState().removePoseInput(poseId, "smile");
    expect(store.getState().poses[0]?.values).toEqual({});
    expect(store.getState().poses[0]?.composeModes).toBeUndefined();
    expect(store.getState().poseConfigDraft?.poses[0]?.composeModes).toBe(
      undefined,
    );
    expect(store.getState().poseIrDraft?.poses[0]?.composeModes).toBe(
      undefined,
    );
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

  it("preserves imported blend stages across store projections", () => {
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
        values: { smile: 0 },
      },
      crossGroupPolicy: { mode: "add" },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
      ],
      blendStages: [
        {
          id: "stage_base",
          mode: "add",
          sources: [{ kind: "group", id: "emotion" }],
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
    expect(store.getState().poseIrDraft?.blendStages).toEqual(ir.blendStages);

    // Trigger a config/IR projection path from normal authoring state updates.
    store.getState().setRigName("Renamed");
    expect(store.getState().poseIrDraft?.blendStages).toEqual(ir.blendStages);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(
      ir.blendStages,
    );
  });

  it("sets and clears pose-group neutral source", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPoseGroup("emotion");
    store.getState().createPose("Smile", "emotion");
    const poseId = store.getState().poses[0]?.id;
    expect(poseId).toBeTruthy();
    if (!poseId) {
      return;
    }

    store.getState().setPoseGroupNeutralSource("emotion", {
      sourceType: "pose-reference",
      poseId,
    });

    expect(
      store
        .getState()
        .poseConfigDraft?.poseGroups?.find((group) => group.id === "emotion")
        ?.neutral,
    ).toEqual({
      sourceType: "pose-reference",
      poseId,
    });
    expect(
      store
        .getState()
        .poseIrDraft?.groups.find((group) => group.id === "emotion")?.neutral,
    ).toEqual({
      sourceType: "pose-reference",
      poseId,
    });

    store.getState().clearPoseGroupNeutralSource("emotion");

    expect(
      store
        .getState()
        .poseConfigDraft?.poseGroups?.find((group) => group.id === "emotion")
        ?.neutral,
    ).toBeUndefined();
    expect(
      store
        .getState()
        .poseIrDraft?.groups.find((group) => group.id === "emotion")?.neutral,
    ).toBeUndefined();
  });

  it("sets and clears blend-stage neutral source", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPoseGroup("emotion");
    store.getState().createBlendStage("stage_base");

    store.getState().setBlendStageNeutralSource("stage_base", {
      sourceType: "direct-values",
      values: { smile: 0.25 },
    });

    expect(
      store
        .getState()
        .poseConfigDraft?.blendStages?.find(
          (stage) => stage.id === "stage_base",
        )?.neutral,
    ).toEqual({
      sourceType: "direct-values",
      values: { smile: 0.25 },
    });
    expect(
      store
        .getState()
        .poseIrDraft?.blendStages?.find((stage) => stage.id === "stage_base")
        ?.neutral,
    ).toEqual({
      sourceType: "direct-values",
      values: { smile: 0.25 },
    });

    store.getState().clearBlendStageNeutralSource("stage_base");

    expect(
      store
        .getState()
        .poseConfigDraft?.blendStages?.find(
          (stage) => stage.id === "stage_base",
        )?.neutral,
    ).toBeUndefined();
    expect(
      store
        .getState()
        .poseIrDraft?.blendStages?.find((stage) => stage.id === "stage_base")
        ?.neutral,
    ).toBeUndefined();
  });

  it("retains scoped neutral fields across projection rebuild paths", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPoseGroup("emotion");
    store.getState().createBlendStage("stage_base");

    store.getState().setPoseGroupNeutralSource("emotion", {
      sourceType: "direct-values",
      values: { smile: 0.1 },
    });
    store.getState().setBlendStageNeutralSource("stage_base", {
      sourceType: "inherit",
    });

    store.getState().setRigName("Renamed");
    store.getState().setPoseGroupBlendMode("emotion", "additive");
    store.getState().setBlendStageMode("stage_base", "average");

    expect(
      store
        .getState()
        .poseConfigDraft?.poseGroups?.find((group) => group.id === "emotion")
        ?.neutral,
    ).toEqual({
      sourceType: "direct-values",
      values: { smile: 0.1 },
    });
    expect(
      store
        .getState()
        .poseConfigDraft?.blendStages?.find(
          (stage) => stage.id === "stage_base",
        )?.neutral,
    ).toEqual({
      sourceType: "inherit",
    });
    expect(
      store
        .getState()
        .poseIrDraft?.groups.find((group) => group.id === "emotion")?.neutral,
    ).toEqual({
      sourceType: "direct-values",
      values: { smile: 0.1 },
    });
    expect(
      store
        .getState()
        .poseIrDraft?.blendStages?.find((stage) => stage.id === "stage_base")
        ?.neutral,
    ).toEqual({
      sourceType: "inherit",
    });
  });

  it("supports blend-stage authoring actions and recompiles through IR projection", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPoseGroup("emotion");
    store.getState().createPoseGroup("viseme");

    store.getState().createPose("Emotion Pose", "emotion");
    const emotionPoseId = store.getState().poses[0]?.id;
    expect(emotionPoseId).toBeTruthy();
    if (!emotionPoseId) {
      return;
    }
    store.getState().updatePose(emotionPoseId, (pose) => ({
      ...pose,
      values: { smile: 0.8 },
    }));

    store.getState().createPose("Viseme Pose", "viseme");
    const visemePoseId = store.getState().poses[1]?.id;
    expect(visemePoseId).toBeTruthy();
    if (!visemePoseId) {
      return;
    }
    store.getState().updatePose(visemePoseId, (pose) => ({
      ...pose,
      values: { smile: 0.4 },
    }));

    store.getState().createBlendStage("stage_base");
    store.getState().setBlendStageSources("stage_base", [
      { kind: "group", id: "emotion" },
      { kind: "group", id: "viseme" },
    ]);

    const applyNodeId = "pose_stage_smile_1_stage_base_apply";
    expect(
      store
        .getState()
        .poseGraphSpec?.nodes.some(
          (node: { id: string }) => node.id === applyNodeId,
        ),
    ).toBe(true);

    store.getState().setBlendStageMode("stage_base", "average");
    const overlayNodeId = "pose_stage_smile_1_stage_base_overlay";
    expect(
      store
        .getState()
        .poseGraphSpec?.nodes.some(
          (node: { id: string }) => node.id === overlayNodeId,
        ),
    ).toBe(true);
    expect(
      store
        .getState()
        .poseGraphSpec?.nodes.some(
          (node: { id: string }) => node.id === applyNodeId,
        ),
    ).toBe(false);

    store.getState().renameBlendStage("stage_base", "Base Layer");
    expect(store.getState().poseConfigDraft?.blendStages?.[0]?.name).toBe(
      "Base Layer",
    );

    store.getState().createBlendStage("stage_final");
    store.getState().setBlendStageSources("stage_final", [
      { kind: "stage", id: "stage_base" },
      { kind: "group", id: "viseme" },
    ]);

    store.getState().createBlendStage("stage_cleanup");
    store.getState().reorderBlendStage(2, 1);
    expect(
      store.getState().poseConfigDraft?.blendStages?.map((stage) => stage.id),
    ).toEqual(["stage_base", "stage_cleanup", "stage_final"]);

    store.getState().deleteBlendStage("stage_cleanup");
    expect(
      store.getState().poseConfigDraft?.blendStages?.map((stage) => stage.id),
    ).toEqual(["stage_base", "stage_final"]);
  });

  it("blocks invalid blend-stage topology edits", () => {
    const store = createPoseRigStore();
    store.getState().setStandardInputs([createInput("smile")]);
    store.getState().createPoseGroup("emotion");
    store.getState().createPoseGroup("viseme");

    store.getState().createBlendStage("stage_a");
    store.getState().createBlendStage("stage_b");
    store
      .getState()
      .setBlendStageSources("stage_b", [{ kind: "stage", id: "stage_a" }]);

    const expected = [
      {
        id: "stage_a",
        name: "stage_a",
        mode: "add",
        sources: [{ kind: "group", id: "emotion" }],
      },
      {
        id: "stage_b",
        name: "stage_b",
        mode: "add",
        sources: [{ kind: "stage", id: "stage_a" }],
      },
    ];
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store
      .getState()
      .setBlendStageSources("stage_a", [{ kind: "stage", id: "stage_b" }]);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store
      .getState()
      .setBlendStageSources("stage_b", [{ kind: "stage", id: "stage_b" }]);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store
      .getState()
      .setBlendStageSources("stage_b", [
        { kind: "stage", id: "missing_stage" },
      ]);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store
      .getState()
      .setBlendStageSources("stage_b", [
        { kind: "group", id: "missing_group" },
      ]);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store.getState().setBlendStageSources("stage_b", [
      { kind: "stage", id: "stage_a" },
      { kind: "stage", id: "stage_a" },
    ]);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store.getState().setBlendStageSources("stage_b", []);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store.getState().deleteBlendStage("stage_a");
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);

    store.getState().reorderBlendStage(1, 0);
    expect(store.getState().poseConfigDraft?.blendStages).toEqual(expected);
  });
});

describe("createPoseFromValues", () => {
  it("creates a pose already holding the supplied values", () => {
    // Taking a pose from an animation frame cannot go through `capturePose`,
    // which snapshots `currentValues` — those only change when an Inputs
    // slider moves, so at a playhead they are the last slider positions, not
    // the frame.
    const store = createPoseRigStore();
    const id = store.getState().createPoseFromValues({
      name: "Frame 24",
      values: { lids_blink: 1, gaze_left_right: -0.5 },
    });

    expect(id).toBeTruthy();
    const pose = store.getState().poses.find((entry) => entry.id === id);
    expect(pose?.name).toBe("Frame 24");
    expect(pose?.values).toEqual({ lids_blink: 1, gaze_left_right: -0.5 });
  });

  it("selects the new pose and leaves existing poses alone", () => {
    const store = createPoseRigStore();
    const first = store.getState().createPoseFromValues({
      name: "One",
      values: { lids_blink: 1 },
    });
    const second = store.getState().createPoseFromValues({
      name: "Two",
      values: { lids_blink: 0 },
    });

    expect(store.getState().selectedPoseId).toBe(second);
    const kept = store.getState().poses.find((entry) => entry.id === first);
    expect(kept?.values).toEqual({ lids_blink: 1 });
    expect(store.getState().poses).toHaveLength(2);
  });

  it("gives each pose a distinct id even with the same name", () => {
    const store = createPoseRigStore();
    const a = store
      .getState()
      .createPoseFromValues({ name: "Frame", values: { lids_blink: 1 } });
    const b = store
      .getState()
      .createPoseFromValues({ name: "Frame", values: { lids_blink: 0 } });

    expect(a).not.toBe(b);
    expect(store.getState().poses).toHaveLength(2);
  });
});

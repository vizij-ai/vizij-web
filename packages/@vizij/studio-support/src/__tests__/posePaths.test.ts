import { describe, expect, it } from "vitest";
import {
  buildPoseWeightPathMap,
  buildPoseWeightRelativePath,
  buildRigInputPath,
  buildSemanticPoseWeightPathMap,
  getPoseSemanticKey,
  resolvePoseMembership,
  resolvePoseSemantics,
} from "../index";

describe("studio support pose paths", () => {
  it("builds canonical pose weight paths from pose ids", () => {
    const paths = buildPoseWeightPathMap(
      [
        { id: "pose_happy", values: {} },
        { id: "pose_a", values: {} },
      ],
      "quori_latest",
    );

    expect(paths.get("pose_happy")).toBe(
      "rig/quori_latest/poses/pose_happy.weight",
    );
    expect(paths.get("pose_a")).toBe("rig/quori_latest/poses/pose_a.weight");
    expect(buildPoseWeightRelativePath("pose_a")).toBe("/poses/pose_a.weight");
  });

  it("re-homes relative and absolute rig paths to the current face", () => {
    expect(buildRigInputPath("robot", "/poses/pose_a.weight")).toBe(
      "rig/robot/poses/pose_a.weight",
    );
    expect(
      buildRigInputPath("robot", "rig/other_face/poses/pose_a.weight"),
    ).toBe("rig/robot/poses/pose_a.weight");
    expect(buildRigInputPath("robot", "rig/robot/poses/pose_a.weight")).toBe(
      "rig/robot/poses/pose_a.weight",
    );
  });

  it("resolves pose memberships from group ids and group paths", () => {
    const membership = resolvePoseMembership(
      {
        group: "visemes",
        groupId: "default",
        groupIds: ["default"],
      },
      [
        { id: "default", name: "Visemes", path: "visemes" },
        { id: "emotionsv2", name: "Emotions", path: "emotions" },
      ],
    );

    expect(membership.groupIds).toEqual(["default"]);
    expect(membership.primaryGroupId).toBe("default");
    expect(membership.primaryGroupPath).toBe("visemes");
    expect(membership.groupPathsById).toEqual({ default: "visemes" });
  });

  it("derives canonical semantic pose keys from current export ids", () => {
    expect(
      getPoseSemanticKey({ id: "pose_d_concerned_d", name: "Concerned" }),
    ).toBe("concerned");
    expect(getPoseSemanticKey({ id: "pose_e_2", name: "E 2" })).toBe("e_2");
    expect(getPoseSemanticKey({ id: "pose_at", name: "At" })).toBe("at");
  });

  it("classifies Hugo and Quori pose semantics from actual export shapes", () => {
    const quoriGroups = [
      { id: "default", name: "Visemes", path: "visemes" },
      { id: "emotionsv2", name: "Emotions", path: "emotions" },
    ];
    const hugoGroups = [
      { id: "default", name: "Default", path: "default" },
      { id: "visemes", name: "Visemes", path: "visemes" },
    ];

    expect(
      resolvePoseSemantics(
        {
          id: "pose_a",
          name: "A",
          group: "visemes",
          groupId: "default",
          groupIds: ["default"],
        },
        quoriGroups,
      ),
    ).toMatchObject({ key: "a", kind: "viseme" });

    expect(
      resolvePoseSemantics(
        {
          id: "pose_d_happy_d",
          name: "Happy",
          group: "emotions",
          groupId: "emotionsv2",
          groupIds: ["emotionsv2"],
        },
        quoriGroups,
      ),
    ).toMatchObject({ key: "happy", kind: "emotion" });

    expect(
      resolvePoseSemantics(
        {
          id: "pose_happy",
          name: "Happy",
          group: "default",
          groupId: "default",
          groupIds: ["default"],
        },
        hugoGroups,
      ),
    ).toMatchObject({ key: "happy", kind: "emotion" });
  });

  it("builds semantic pose-path maps for visemes and emotions", () => {
    const groups = [
      { id: "default", name: "Visemes", path: "visemes" },
      { id: "emotionsv2", name: "Emotions", path: "emotions" },
    ];
    const poses = [
      {
        id: "pose_at",
        name: "At",
        group: "visemes",
        groupId: "default",
        groupIds: ["default"],
        values: {},
      },
      {
        id: "pose_d_happy_d",
        name: "Happy",
        group: "emotions",
        groupId: "emotionsv2",
        groupIds: ["emotionsv2"],
        values: {},
      },
    ];

    expect(
      buildSemanticPoseWeightPathMap(
        poses,
        groups,
        "quori_latest",
        "viseme",
      ).get("at"),
    ).toBe("rig/quori_latest/poses/pose_at.weight");
    expect(
      buildSemanticPoseWeightPathMap(
        poses,
        groups,
        "quori_latest",
        "emotion",
      ).get("happy"),
    ).toBe("rig/quori_latest/poses/pose_d_happy_d.weight");
  });
});

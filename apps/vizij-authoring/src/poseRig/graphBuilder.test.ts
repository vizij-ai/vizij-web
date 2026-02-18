import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseGraphSpec } from "./graphBuilder";

const stdInput = (id: string, path: string): StandardRigInput => ({
  id,
  path,
  sourceId: id,
  label: id,
  group: "test",
  defaultValue: 0,
  range: { min: -1, max: 1 },
});

function findNode(specNodes: any[] | undefined, id: string) {
  return specNodes?.find((node) => node.id === id);
}

function findNodeByPrefix(
  specNodes: any[] | undefined,
  prefix: string,
  type?: string,
) {
  return specNodes?.find(
    (node) => node.id?.startsWith(prefix) && (type ? node.type === type : true),
  );
}

function findEdge(
  edges: any[] | undefined,
  from: string,
  to: string,
  input?: string,
  selectorField?: string,
) {
  return edges?.find(
    (edge) =>
      edge.from?.node_id === from &&
      edge.to?.node_id === to &&
      (input ? edge.to?.input === input : true) &&
      (selectorField
        ? edge.selector?.some(
            (seg: any) =>
              typeof seg === "object" && seg.field === selectorField,
          )
        : true),
  );
}

describe("buildPoseGraphSpec", () => {
  const mouth = stdInput("mouth_open", "/mouth/open");
  const brow = stdInput("brow_raise", "/brow/raise");
  const standardInputs = [mouth, brow];

  const poses = [
    {
      id: "pose_a",
      name: "A",
      values: { mouth_open: 1, brow_raise: 0 },
      createdAt: "now",
      updatedAt: "now",
      group: null,
      description: "",
    },
    {
      id: "pose_b",
      name: "B",
      values: { mouth_open: 0, brow_raise: -0.5 },
      createdAt: "now",
      updatedAt: "now",
      group: null,
      description: "",
    },
  ];

  it("builds per-input weighted-average overlay chains with masks", () => {
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses,
      standardInputs,
    });

    const mouthWs = findNodeByPrefix(
      spec.nodes,
      "pose_group_ws_mouth_open",
      "weightedsumvector",
    );
    expect(mouthWs?.type).toBe("weightedsumvector");
    const mouthOverlay = findNodeByPrefix(
      spec.nodes,
      "pose_group_overlay_mouth_open",
      "blendweightedaverageoverlay",
    );
    expect(mouthOverlay?.type).toBe("blendweightedaverageoverlay");
    const mouthMask = findNodeByPrefix(
      spec.nodes,
      "pose_group_mask_mouth_open",
    );
    expect(mouthMask?.params?.value?.vector).toEqual([1, 0]);

    const weightsJoin = findNodeByPrefix(spec.nodes, "pose_weights_group_");
    expect(weightsJoin?.type).toBe("join");

    // group weights join feeds weighted-sum
    expect(
      findEdge(spec.edges, weightsJoin!.id, mouthWs!.id, "weights"),
    ).toBeTruthy();
    // overlay feeds output
    expect(
      findEdge(spec.edges, mouthOverlay!.id, "out_mouth_open", "in"),
    ).toBeTruthy();
    // base comes from neutral record selector
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_record",
        mouthOverlay!.id,
        "base",
        "mouth_open",
      ),
    ).toBeTruthy();

    // Brow has its own chain
    const browWs = findNodeByPrefix(
      spec.nodes,
      "pose_group_ws_brow_raise",
      "weightedsumvector",
    );
    expect(browWs?.type).toBe("weightedsumvector");
  });

  it("builds additive chains when blendMode is additive", () => {
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses,
      standardInputs,
      blendMode: "additive",
    });

    const addNode = findNodeByPrefix(
      spec.nodes,
      "pose_group_add_mouth_open",
      "add",
    );
    expect(addNode?.type).toBe("add");
    expect(findNodeByPrefix(spec.nodes, "pose_group_overlay_mouth_open")).toBe(
      undefined,
    );
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_record",
        addNode!.id,
        "b",
        "mouth_open",
      ),
    ).toBeTruthy();
  });

  it("builds cross-group additive blend nodes for shared targets", () => {
    const groupedPoses = [
      { ...poses[0], group: "emotion" },
      {
        ...poses[1],
        group: "viseme",
        values: { mouth_open: -0.25, brow_raise: -0.5 },
      },
    ];
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses: groupedPoses,
      standardInputs,
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "additive",
    });

    expect(findNode(spec.nodes, "pose_cross_apply_mouth_open")?.type).toBe(
      "add",
    );
  });

  it("builds cross-group average overlay nodes when requested", () => {
    const groupedPoses = [
      { ...poses[0], group: "emotion" },
      {
        ...poses[1],
        group: "viseme",
        values: { mouth_open: -0.25, brow_raise: -0.5 },
      },
    ];
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses: groupedPoses,
      standardInputs,
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "average",
    });

    expect(findNode(spec.nodes, "pose_cross_overlay_mouth_open")?.type).toBe(
      "blendweightedaverageoverlay",
    );
  });

  it("resolves pose memberships from canonical groupIds", () => {
    const groupedPoses = [
      {
        ...poses[0],
        group: null,
        groupId: null,
        groupIds: ["emotion"],
      },
      {
        ...poses[1],
        group: null,
        groupId: null,
        groupIds: ["viseme"],
        values: { mouth_open: -0.25, brow_raise: -0.5 },
      },
    ];
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses: groupedPoses,
      standardInputs,
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "additive",
    });

    expect(findNode(spec.nodes, "pose_cross_apply_mouth_open")?.type).toBe(
      "add",
    );
  });
});

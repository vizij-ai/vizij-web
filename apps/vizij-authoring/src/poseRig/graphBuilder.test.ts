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

function extractRecord(node: any): Record<string, number> {
  const record =
    node?.params?.value?.record?.values?.record ??
    ({} as Record<string, { float?: unknown }>);
  return Object.fromEntries(
    Object.entries(record).flatMap(([inputId, value]) => {
      const floatValue = (value as { float?: unknown } | undefined)?.float;
      if (!Number.isFinite(floatValue)) {
        return [];
      }
      return [[inputId, floatValue as number] as const];
    }),
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

  it("emits pose-control output paths keyed by canonical input ids", () => {
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses,
      standardInputs,
      blendMode: "average",
    });

    const mouthOutput = findNode(spec.nodes, "out_mouth_open");
    const browOutput = findNode(spec.nodes, "out_brow_raise");

    expect(mouthOutput?.type).toBe("output");
    expect(mouthOutput?.params?.path).toBe("rig/face/pose/control/mouth_open");
    expect(browOutput?.type).toBe("output");
    expect(browOutput?.params?.path).toBe("rig/face/pose/control/brow_raise");
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

  it("keeps synthetic group signals internal and does not emit ghost input nodes", () => {
    const groupedPoses = [
      { ...poses[0], id: "pose_emotion", group: "emotion" },
      {
        ...poses[1],
        id: "pose_viseme",
        group: "viseme",
        values: { mouth_open: -0.25, brow_raise: -0.5 },
      },
      {
        ...poses[0],
        id: "pose_shared",
        group: "emotion",
        values: { mouth_open: 0.5, brow_raise: 0.25 },
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

    const inputNodes = (spec.nodes ?? []).filter(
      (node: any) => node.type === "input",
    ) as Array<{ params?: { path?: string } }>;
    expect(inputNodes).toHaveLength(groupedPoses.length);
    inputNodes.forEach((node) => {
      expect(node.params?.path).toContain("/poses/");
      expect(node.params?.path).toContain(".weight");
    });

    const groupMouthSignals = (spec.nodes ?? []).filter(
      (node: any) =>
        node.type === "weightedsumvector" &&
        node.id?.startsWith("pose_group_ws_mouth_open"),
    );
    expect(groupMouthSignals).toHaveLength(2);
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

  it("builds priority cross-group topology when channel override mode is priority", () => {
    const groupedPoses = [
      { ...poses[0], id: "pose_emotion", group: "emotion" },
      {
        ...poses[1],
        id: "pose_viseme",
        group: "viseme",
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
      crossGroupBlendMode: "average",
      crossGroupChannelOverrides: {
        mouth_open: {
          mode: "priority",
          priorityOrder: ["viseme", "emotion"],
          tieBreak: "group-order",
        },
      },
    });

    expect(
      findNode(spec.nodes, "pose_priority_mouth_open_2_viseme_overlay")?.type,
    ).toBe("blendweightedaverageoverlay");
    expect(
      findNode(spec.nodes, "pose_cross_overlay_mouth_open"),
    ).toBeUndefined();
    expect(findNode(spec.nodes, "pose_cross_apply_mouth_open")).toBeUndefined();
  });

  it("keeps default compile parity when cross-group overrides are absent or empty", () => {
    const groupedPoses = [
      { ...poses[0], group: "emotion" },
      {
        ...poses[1],
        group: "viseme",
        values: { mouth_open: -0.25, brow_raise: -0.5 },
      },
    ];
    const baseOptions = {
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      poses: groupedPoses,
      standardInputs,
      defaultGroupBlendMode: "average" as const,
      crossGroupBlendMode: "average" as const,
    };

    const legacy = buildPoseGraphSpec(baseOptions);
    const explicitEmptyOverride = buildPoseGraphSpec({
      ...baseOptions,
      crossGroupChannelOverrides: {},
    });

    expect(explicitEmptyOverride.spec).toEqual(legacy.spec);
    expect(explicitEmptyOverride.summary).toEqual(legacy.summary);
  });

  it("compiles explicit multi-stage blend chains", () => {
    const groupedPoses = [
      { ...poses[0], id: "pose_emotion", group: "emotion" },
      {
        ...poses[1],
        id: "pose_viseme",
        group: "viseme",
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
      blendStages: [
        {
          id: "stage_base",
          mode: "average",
          sources: [
            { kind: "group", id: "emotion" },
            { kind: "group", id: "viseme" },
          ],
        },
        {
          id: "stage_final",
          mode: "add",
          sources: [
            { kind: "stage", id: "stage_base" },
            { kind: "group", id: "emotion" },
          ],
        },
      ],
    });

    expect(
      findNode(spec.nodes, "pose_stage_mouth_open_1_stage_base_overlay")?.type,
    ).toBe("blendweightedaverageoverlay");
    expect(
      findNode(spec.nodes, "pose_stage_mouth_open_2_stage_final_apply")?.type,
    ).toBe("add");
    expect(
      findEdge(
        spec.edges,
        "pose_stage_mouth_open_2_stage_final_apply",
        "out_mouth_open",
        "in",
      ),
    ).toBeTruthy();
    expect(findNode(spec.nodes, "pose_cross_apply_mouth_open")).toBeUndefined();
  });

  it("resolves scoped neutral precedence as stage > group > global > default > 0", () => {
    const scopedInputs: StandardRigInput[] = [
      {
        ...stdInput("smile", "/face/smile"),
        defaultValue: 0.2,
      },
      {
        ...stdInput("jaw", "/face/jaw"),
        defaultValue: 0.25,
      },
      {
        ...stdInput("brow", "/face/brow"),
        defaultValue: Number.NaN,
      },
    ];
    const scopedPoses = [
      {
        id: "pose_emotion",
        name: "Emotion",
        values: { smile: 0.9, jaw: 0.8, brow: 0.6 },
        createdAt: "now",
        updatedAt: "now",
        group: "emotion",
        description: "",
      },
      {
        id: "pose_viseme",
        name: "Viseme",
        values: { smile: -0.3, jaw: -0.2, brow: 0.4 },
        createdAt: "now",
        updatedAt: "now",
        group: "viseme",
        description: "",
      },
    ];

    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { smile: 0.1 },
      poses: scopedPoses,
      standardInputs: scopedInputs,
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          neutral: {
            sourceType: "direct-values",
            values: { smile: 0.55 },
          },
        },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      blendStages: [
        {
          id: "stage_mix",
          mode: "average",
          neutral: {
            sourceType: "direct-values",
            values: { brow: 0.7 },
          },
          sources: [
            { kind: "group", id: "emotion" },
            { kind: "group", id: "viseme" },
          ],
        },
      ],
    });

    const globalNeutral = findNode(spec.nodes, "pose_neutral_record");
    const groupNeutral = findNode(spec.nodes, "pose_neutral_group_1_emotion");
    const stageNeutral = findNode(spec.nodes, "pose_neutral_stage_1_stage_mix");
    expect(extractRecord(globalNeutral)).toMatchObject({
      smile: 0.1,
      jaw: 0.25,
      brow: 0,
    });
    expect(extractRecord(groupNeutral)).toMatchObject({
      smile: 0.55,
      jaw: 0.25,
      brow: 0,
    });
    expect(extractRecord(stageNeutral)).toMatchObject({
      smile: 0.55,
      jaw: 0.25,
      brow: 0.7,
    });

    expect(
      findEdge(
        spec.edges,
        "pose_neutral_group_1_emotion",
        "pose_group_overlay_smile_1_emotion",
        "base",
        "smile",
      ),
    ).toBeTruthy();
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_stage_1_stage_mix",
        "pose_stage_smile_1_stage_mix_overlay",
        "base",
        "smile",
      ),
    ).toBeTruthy();
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_stage_1_stage_mix",
        "pose_stage_brow_1_stage_mix_overlay",
        "base",
        "brow",
      ),
    ).toBeTruthy();
  });

  it("resolves pose-reference scoped neutrals with per-channel lower-layer fallback", () => {
    const { spec } = buildPoseGraphSpec({
      faceId: "face",
      neutralInputs: { mouth_open: 0.1, brow_raise: -0.25 },
      poses: [
        {
          id: "pose_primary",
          name: "Primary",
          values: { mouth_open: 0.9, brow_raise: 0.6 },
          createdAt: "now",
          updatedAt: "now",
          group: "emotion",
          description: "",
        },
        {
          id: "pose_reference",
          name: "Reference",
          values: { mouth_open: 0.35 },
          createdAt: "now",
          updatedAt: "now",
          group: "emotion",
          description: "",
        },
      ],
      standardInputs,
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          neutral: {
            sourceType: "pose-reference",
            poseId: "pose_reference",
          },
        },
      ],
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "average",
    });

    const groupNeutral = findNode(spec.nodes, "pose_neutral_group_1_emotion");
    expect(extractRecord(groupNeutral)).toMatchObject({
      mouth_open: 0.35,
      brow_raise: -0.25,
    });
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_group_1_emotion",
        "pose_group_overlay_mouth_open_1_emotion",
        "base",
        "mouth_open",
      ),
    ).toBeTruthy();
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

  it("keeps shared-pose compile output deterministic across groupIds order", () => {
    const sharedPose = {
      ...poses[0],
      id: "pose_shared",
      name: "Shared Smile",
      group: null,
      groupId: null,
      groupIds: ["viseme_main", "emotion_main"],
      values: { mouth_open: 0.8, brow_raise: 0.4 },
    };
    const poseGroups = [
      { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
      { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
    ];
    const options = {
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      standardInputs,
      poseGroups,
      defaultGroupBlendMode: "average" as const,
      crossGroupBlendMode: "additive" as const,
    };

    const firstCompile = buildPoseGraphSpec({
      ...options,
      poses: [sharedPose],
    });
    const secondCompile = buildPoseGraphSpec({
      ...options,
      poses: [
        {
          ...sharedPose,
          groupIds: ["emotion_main", "viseme_main"],
        },
      ],
    });

    expect(secondCompile.spec).toEqual(firstCompile.spec);
    expect(secondCompile.summary).toEqual(firstCompile.summary);

    const poseInputNodeId = "pose_pose_shared";
    const sharedWeightEdges = (firstCompile.spec.edges ?? []).filter(
      (edge: any) =>
        edge.from?.node_id === poseInputNodeId &&
        typeof edge.to?.node_id === "string" &&
        edge.to.node_id.startsWith("pose_weights_group_"),
    );
    expect(sharedWeightEdges).toHaveLength(2);
  });

  it("keeps multi-stage compile output deterministic across groupIds order", () => {
    const sharedPose = {
      ...poses[0],
      id: "pose_shared",
      name: "Shared Smile",
      group: null,
      groupId: null,
      groupIds: ["viseme_main", "emotion_main"],
      values: { mouth_open: 0.8, brow_raise: 0.4 },
    };
    const poseGroups = [
      { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
      { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
    ];
    const options = {
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      standardInputs,
      poseGroups,
      defaultGroupBlendMode: "average" as const,
      crossGroupBlendMode: "additive" as const,
      blendStages: [
        {
          id: "stage_base",
          mode: "add" as const,
          sources: [
            { kind: "group" as const, id: "emotion_main" },
            { kind: "group" as const, id: "viseme_main" },
          ],
        },
      ],
    };

    const firstCompile = buildPoseGraphSpec({
      ...options,
      poses: [sharedPose],
    });
    const secondCompile = buildPoseGraphSpec({
      ...options,
      poses: [
        {
          ...sharedPose,
          groupIds: ["emotion_main", "viseme_main"],
        },
      ],
    });

    expect(secondCompile.spec).toEqual(firstCompile.spec);
    expect(secondCompile.summary).toEqual(firstCompile.summary);
    expect(
      findNode(
        firstCompile.spec.nodes,
        "pose_stage_mouth_open_1_stage_base_apply",
      ),
    ).toBeTruthy();
  });

  it("keeps priority compile deterministic across groupIds order with group-id tie break", () => {
    const sharedPose = {
      ...poses[0],
      id: "pose_shared",
      name: "Shared Smile",
      group: null,
      groupId: null,
      groupIds: ["viseme_main", "emotion_main"],
      values: { mouth_open: 0.8, brow_raise: 0.4 },
    };
    const poseGroups = [
      { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
      { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
    ];
    const options = {
      faceId: "face",
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      standardInputs,
      poseGroups,
      defaultGroupBlendMode: "average" as const,
      crossGroupBlendMode: "average" as const,
      crossGroupChannelOverrides: {
        mouth_open: {
          mode: "priority" as const,
          tieBreak: "group-id" as const,
        },
      },
    };

    const firstCompile = buildPoseGraphSpec({
      ...options,
      poses: [sharedPose],
    });
    const secondCompile = buildPoseGraphSpec({
      ...options,
      poses: [
        {
          ...sharedPose,
          groupIds: ["emotion_main", "viseme_main"],
        },
      ],
    });

    expect(secondCompile.spec).toEqual(firstCompile.spec);
    expect(secondCompile.summary).toEqual(firstCompile.summary);
  });
});

import { describe, expect, it } from "vitest";
import { buildRigPipelineV1LinkId, type StandardRigInput } from "@vizij/utils";
import {
  buildStandardInputIdRemap,
  remapPipelineMetadataInputIds,
  remapPoseConfigInputIds,
  remapPoseIrInputIds,
  type VizijPipelineMetadataV1,
} from "../utils/standardInputRemap";

function makeInput(
  id: string,
  path: string,
  sourceId?: string,
): StandardRigInput {
  return {
    id,
    path,
    label: id,
    group: "test",
    defaultValue: 0,
    range: { min: 0, max: 1 },
    sourceId,
  };
}

describe("standardInputRemap", () => {
  it("builds an id remap from stable source ids", () => {
    const previous = [
      makeInput("old_input", "/propsrig/old/jaw/value", "component:jaw"),
    ];
    const next = [
      makeInput("new_input", "/propsrig/new/jaw/value", "component:jaw"),
    ];

    expect(buildStandardInputIdRemap(previous, next)).toEqual(
      new Map([["old_input", "new_input"]]),
    );
  });

  it("remaps pipeline metadata byInputId and links", () => {
    const metadata: VizijPipelineMetadataV1 = {
      byInputId: {
        old_child: {
          inputId: "old_child",
          parents: [{ inputId: "old_parent", linkId: "stale" }],
        },
      },
      links: {
        stale: {
          linkId: "stale",
          parentInputId: "old_parent",
          childInputId: "old_child",
        },
      },
    };

    const remapped = remapPipelineMetadataInputIds(
      metadata,
      new Map([
        ["old_parent", "new_parent"],
        ["old_child", "new_child"],
      ]),
    );

    const expectedLinkId = buildRigPipelineV1LinkId("new_parent", "new_child");
    expect(remapped?.byInputId).toEqual({
      new_child: {
        inputId: "new_child",
        parents: [{ inputId: "new_parent", linkId: expectedLinkId }],
      },
    });
    expect(remapped?.links).toEqual({
      [expectedLinkId]: {
        linkId: expectedLinkId,
        parentInputId: "new_parent",
        childInputId: "new_child",
      },
    });
  });

  it("remaps pose config channels across neutral, poses, overrides, and stage neutrals", () => {
    const config = {
      version: 1,
      faceId: "face",
      neutralInputs: { old_input: 0.1 },
      crossGroupBlendMode: "additive",
      neutralMode: "explicit",
      crossGroupChannelOverrides: {
        old_input: { mode: "priority", priorityOrder: ["emotion"] },
      },
      blendStages: [
        {
          id: "stage_1",
          mode: "add",
          sources: [],
          neutral: {
            sourceType: "direct-values",
            values: { old_input: 0.2 },
          },
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          values: { old_input: 0.8 },
          composeModes: { old_input: "add" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const remapped = remapPoseConfigInputIds(
      config,
      new Map([["old_input", "new_input"]]),
    );

    expect(remapped?.neutralInputs).toEqual({ new_input: 0.1 });
    expect(remapped?.crossGroupChannelOverrides).toEqual({
      new_input: { mode: "priority", priorityOrder: ["emotion"] },
    });
    expect(remapped?.poses[0]?.values).toEqual({ new_input: 0.8 });
    expect(remapped?.poses[0]?.composeModes).toEqual({ new_input: "add" });
    expect(remapped?.blendStages?.[0]?.neutral).toEqual({
      sourceType: "direct-values",
      values: { new_input: 0.2 },
    });
  });

  it("remaps pose ir channels across neutral, targets, overrides, and group neutrals", () => {
    const ir = {
      version: 1,
      faceId: "face",
      contracts: {
        targetIds: "canonical-standard-input-id",
        syntheticNodes: "compiled-graph-synthetic-only",
      },
      neutral: {
        mode: "explicit",
        values: { old_input: 0.1 },
      },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "add",
          poseIds: ["pose_smile"],
          neutral: {
            sourceType: "direct-values",
            values: { old_input: 0.2 },
          },
        },
      ],
      crossGroupPolicy: {
        mode: "add",
        overrides: {
          old_input: { mode: "priority", priorityOrder: ["emotion"] },
        },
      },
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          targets: { old_input: 0.9 },
          composeModes: { old_input: "add" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const remapped = remapPoseIrInputIds(
      ir,
      new Map([["old_input", "new_input"]]),
    );

    expect(remapped?.neutral.values).toEqual({ new_input: 0.1 });
    expect(remapped?.crossGroupPolicy.overrides).toEqual({
      new_input: { mode: "priority", priorityOrder: ["emotion"] },
    });
    expect(remapped?.poses[0]?.targets).toEqual({ new_input: 0.9 });
    expect(remapped?.poses[0]?.composeModes).toEqual({ new_input: "add" });
    expect(remapped?.groups[0]?.neutral).toEqual({
      sourceType: "direct-values",
      values: { new_input: 0.2 },
    });
  });
});

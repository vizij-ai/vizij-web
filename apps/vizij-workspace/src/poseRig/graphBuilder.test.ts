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

    const mouthWs = findNode(spec.nodes, "pose_ws_mouth_open");
    expect(mouthWs?.type).toBe("weightedsumvector");
    const mouthOverlay = findNode(spec.nodes, "pose_overlay_mouth_open");
    expect(mouthOverlay?.type).toBe("blendweightedaverageoverlay");
    const mouthMask = findNode(spec.nodes, "pose_mask_mouth_open");
    expect(mouthMask?.params?.value?.vector).toEqual([1, 0]);

    // weights join feeds weighted-sum
    expect(
      findEdge(
        spec.edges,
        "pose_weights_join",
        "pose_ws_mouth_open",
        "weights",
      ),
    ).toBeTruthy();
    // overlay feeds output
    expect(
      findEdge(spec.edges, "pose_overlay_mouth_open", "out_mouth_open", "in"),
    ).toBeTruthy();
    // base comes from neutral record selector
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_record",
        "pose_overlay_mouth_open",
        "base",
        "mouth_open",
      ),
    ).toBeTruthy();

    // Brow has its own chain
    const browWs = findNode(spec.nodes, "pose_ws_brow_raise");
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

    expect(findNode(spec.nodes, "pose_add_mouth_open")?.type).toBe("add");
    expect(findNode(spec.nodes, "pose_overlay_mouth_open")).toBeUndefined();
    expect(
      findEdge(
        spec.edges,
        "pose_neutral_record",
        "pose_add_mouth_open",
        "b",
        "mouth_open",
      ),
    ).toBeTruthy();
  });
});

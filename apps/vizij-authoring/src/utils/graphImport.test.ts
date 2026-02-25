import { describe, expect, it } from "vitest";
import {
  extractGraphFaceId,
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineLinksMapFromMetadata,
  extractVizijPipelineMetadataV1,
  remapGraphSpecFace,
  withVizijPipelineMetadataV1,
} from "./graphImport";

describe("graph import helpers", () => {
  it("extracts the face id from vizij metadata", () => {
    const payload = {
      metadata: { vizij: { faceId: "legacy_face" } },
    };
    expect(extractGraphFaceId(payload)).toBe("legacy_face");
    expect(extractGraphFaceId({})).toBeNull();
  });

  it("remaps rig prefixes and updates metadata when face ids differ", () => {
    const payload = {
      metadata: { vizij: { faceId: "legacy_face" } },
      nodes: [
        {
          id: "pose_input",
          type: "input",
          params: { path: "rig/legacy_face/poses/smile.weight" },
        },
      ],
    };
    const remapped = remapGraphSpecFace(payload, "current_face", {
      previousFaceId: "legacy_face",
    }) as { metadata: { vizij: { faceId: string } }; nodes: unknown[] };
    expect(remapped).not.toBe(payload);
    expect(remapped.metadata.vizij.faceId).toBe("current_face");
    const inputNode = remapped.nodes[0] as {
      params: { path: string };
    };
    expect(inputNode.params.path).toBe("rig/current_face/poses/smile.weight");
    // original payload should stay untouched
    const originalInput = (payload.nodes[0] as { params: { path: string } })
      .params.path;
    expect(originalInput).toBe("rig/legacy_face/poses/smile.weight");
  });

  it("extracts pipeline metadata + byInputId map from vizij metadata", () => {
    const payload = {
      metadata: {
        vizij: {
          faceId: "legacy_face",
          pipelineV1: {
            links: {
              link_jaw: { scale: 1, offset: 0 },
            },
            byInputId: {
              jaw_open: {
                clamp: { enabled: true },
              },
              invalid_entry: 42,
            },
          },
        },
      },
    };
    const pipelineMetadata = extractVizijPipelineMetadataV1(payload);
    const byInputId =
      extractVizijPipelineConfigMapFromMetadata(pipelineMetadata);
    const links = extractVizijPipelineLinksMapFromMetadata(pipelineMetadata);
    expect(pipelineMetadata).toMatchObject({
      links: {
        link_jaw: { scale: 1, offset: 0 },
      },
      byInputId: {
        jaw_open: {
          clamp: { enabled: true },
        },
        invalid_entry: 42,
      },
    });
    expect(byInputId).toEqual({
      jaw_open: {
        clamp: { enabled: true },
      },
    });
    expect(links).toEqual({
      link_jaw: { scale: 1, offset: 0 },
    });
  });

  it("attaches and clears pipeline metadata without mutating input payload", () => {
    const payload = {
      metadata: { vizij: { faceId: "legacy_face" } },
      nodes: [],
      edges: [],
    };
    const enriched = withVizijPipelineMetadataV1(payload, {
      byInputId: {
        jaw_open: { directInput: { enabled: false } },
      },
      links: {},
    }) as {
      metadata: {
        vizij: {
          pipelineV1?: unknown;
          faceId?: string;
        };
      };
    };
    expect(enriched).not.toBe(payload);
    expect(enriched.metadata.vizij.faceId).toBe("legacy_face");
    expect(enriched.metadata.vizij.pipelineV1).toEqual({
      byInputId: {
        jaw_open: { directInput: { enabled: false } },
      },
      links: {},
    });

    const cleared = withVizijPipelineMetadataV1(enriched, null) as {
      metadata: { vizij: { pipelineV1?: unknown } };
    };
    expect(cleared.metadata.vizij.pipelineV1).toBeUndefined();
    expect(
      (payload as { metadata: { vizij: { pipelineV1?: unknown } } }).metadata
        .vizij.pipelineV1,
    ).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  extractGraphFaceId,
  prepareSpecForImport,
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineLinksMapFromMetadata,
  extractVizijPipelineMetadataV1,
  remapGraphSpecFace,
  withVizijPipelineMetadataV1,
} from "../utils/graphImport";

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

  it("prefers IR vizij metadata when preparing spec import with payload metadata present", () => {
    const irGraph = {
      id: "ir-1",
      faceId: "ir_face",
      nodes: [],
      edges: [],
      constants: [],
      issues: [],
      summary: {
        faceId: "ir_face",
        inputs: [],
        outputs: [],
        bindings: [],
      },
      metadata: {
        source: "test",
        annotations: {
          graphSpecMetadata: {
            vizij: {
              faceId: "ir_face",
              inputs: [{ id: "ir_input", path: "/propsrig/jaw_open" }],
              bindings: [{ targetId: "jaw_target" }],
              pipelineV1: {
                byInputId: {
                  ir_input: {
                    directInput: { enabled: false },
                  },
                },
              },
            },
          },
        },
      },
    };
    const payload = {
      metadata: {
        vizij: {
          faceId: "payload_face",
          inputs: [],
          bindings: [],
          pipelineV1: {
            byInputId: {
              payload_input: {
                directInput: { enabled: true },
              },
            },
          },
          preservedOnlyInPayload: true,
        },
      },
    };

    const prepared = prepareSpecForImport(payload, irGraph) as {
      metadata: {
        vizij: {
          faceId: string;
          inputs: unknown[];
          bindings: unknown[];
          pipelineV1: Record<string, unknown>;
          preservedOnlyInPayload?: boolean;
        };
      };
    };

    expect(prepared.metadata.vizij.faceId).toBe("ir_face");
    expect(prepared.metadata.vizij.inputs).toEqual([
      { id: "ir_input", path: "/propsrig/jaw_open" },
    ]);
    expect(prepared.metadata.vizij.bindings).toEqual([
      { targetId: "jaw_target" },
    ]);
    expect(prepared.metadata.vizij.pipelineV1).toEqual({
      byInputId: {
        ir_input: {
          directInput: { enabled: false },
        },
      },
    });
    expect(prepared.metadata.vizij.preservedOnlyInPayload).toBe(true);
  });

  it("preserves payload-only vizij input and binding metadata when compiled IR metadata is incomplete", () => {
    const irGraph = {
      id: "ir-partial",
      faceId: "ir_face",
      nodes: [],
      edges: [],
      constants: [],
      issues: [],
      summary: {
        faceId: "ir_face",
        inputs: [],
        outputs: [],
        bindings: [],
      },
      metadata: {
        source: "test",
        annotations: {
          graphSpecMetadata: {
            vizij: {
              faceId: "ir_face",
              inputs: [
                {
                  id: "compiled_input",
                  path: "/propsrig/jaw_open",
                  label: "Compiled Jaw",
                },
              ],
              bindings: [{ targetId: "compiled_target", expression: "x" }],
            },
          },
        },
      },
    };
    const payload = {
      metadata: {
        vizij: {
          faceId: "payload_face",
          inputs: [
            {
              id: "compiled_input",
              path: "/propsrig/jaw_open",
              label: "Payload Jaw",
              sourceId: "payload-source",
            },
            {
              id: "payload_only_input",
              path: "/propsrig/chin/value",
              label: "Payload Chin",
              sourceId: "payload-chin-source",
            },
          ],
          bindings: [
            {
              targetId: "compiled_target",
              expression: "payload-x",
              metadata: { source: "payload" },
            },
            {
              targetId: "payload_only_target",
              expression: "payload-y",
            },
          ],
        },
      },
    };

    const prepared = prepareSpecForImport(payload, irGraph) as {
      metadata: {
        vizij: {
          faceId: string;
          inputs: Array<Record<string, unknown>>;
          bindings: Array<Record<string, unknown>>;
        };
      };
    };

    expect(prepared.metadata.vizij.faceId).toBe("ir_face");
    expect(prepared.metadata.vizij.inputs).toEqual([
      {
        id: "compiled_input",
        path: "/propsrig/jaw_open",
        label: "Compiled Jaw",
        sourceId: "payload-source",
      },
      {
        id: "payload_only_input",
        path: "/propsrig/chin/value",
        label: "Payload Chin",
        sourceId: "payload-chin-source",
      },
    ]);
    expect(prepared.metadata.vizij.bindings).toEqual([
      {
        targetId: "compiled_target",
        expression: "x",
        metadata: { source: "payload" },
      },
      {
        targetId: "payload_only_target",
        expression: "payload-y",
      },
    ]);
  });

  it("falls back to payload vizij metadata when compiled IR spec has no metadata section", () => {
    const irGraph = {
      id: "ir-no-metadata",
      faceId: "ir_face",
      nodes: [],
      edges: [],
      constants: [],
      issues: [],
      summary: {
        faceId: "ir_face",
        inputs: [],
        outputs: [],
        bindings: [],
      },
      metadata: {
        source: "test",
      },
    };
    const payload = {
      metadata: {
        vizij: {
          faceId: "payload_face",
          pipelineV1: {
            byInputId: {
              payload_input: {
                directInput: { enabled: true },
              },
            },
          },
        },
      },
    };

    const prepared = prepareSpecForImport(payload, irGraph) as {
      metadata: { vizij: { faceId: string; pipelineV1: unknown } };
    };

    expect(prepared.metadata.vizij.faceId).toBe("payload_face");
    expect(prepared.metadata.vizij.pipelineV1).toEqual({
      byInputId: {
        payload_input: {
          directInput: { enabled: true },
        },
      },
    });
  });
});

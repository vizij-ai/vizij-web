import { describe, expect, it } from "vitest";
import { extractGraphFaceId, remapGraphSpecFace } from "./graphImport";

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
});

import { describe, expect, it } from "vitest";
import { computeDiscrepancySignatureKey } from "./useRigGraphImport";

describe("computeDiscrepancySignatureKey", () => {
  it("does not collide for equal-length but different content payloads", async () => {
    const keyA = await computeDiscrepancySignatureKey({
      importedComparable: { value: "aaaa" },
      rebuiltComparable: { value: "bbbb" },
      importedFaceId: "legacy_face",
      faceId: "robot",
    });
    const keyB = await computeDiscrepancySignatureKey({
      importedComparable: { value: "cccc" },
      rebuiltComparable: { value: "dddd" },
      importedFaceId: "legacy_face",
      faceId: "robot",
    });

    expect(keyA).not.toBe(keyB);
  });

  it("returns a deterministic key for the same source artifact", async () => {
    const payload = {
      importedComparable: {
        nodes: [{ id: "a", params: { path: "rig/legacy_face/input/a" } }],
        edges: [],
      },
      rebuiltComparable: {
        nodes: [{ id: "a", params: { path: "rig/robot/input/a" } }],
        edges: [],
      },
      importedFaceId: "legacy_face",
      faceId: "robot",
    };

    const first = await computeDiscrepancySignatureKey(payload);
    const second = await computeDiscrepancySignatureKey(payload);

    expect(first).toBe(second);
  });
});

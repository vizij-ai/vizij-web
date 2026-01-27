import { describe, expect, it } from "vitest";
import { computeBundleKey } from "./storage";
import type { GlbAsset, GraphAsset } from "./types";

describe("storage helpers", () => {
  const glb: GlbAsset = {
    id: "glb-1",
    label: "Face A",
    fileName: "face.glb",
    dataUrl: "data://stub",
    size: 1024,
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  const low: GraphAsset = {
    id: "low-1",
    label: "Low Rig",
    fileName: "low.json",
    spec: { nodes: [], edges: [] },
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  it("computes stable bundle keys", () => {
    const first = computeBundleKey(glb, low);
    const second = computeBundleKey({ ...glb }, { ...low });
    expect(first).toBe(second);
  });

  it("changes key when inputs differ", () => {
    const alteredGlb = { ...glb, label: "Face B" };
    expect(computeBundleKey(glb, low)).not.toBe(
      computeBundleKey(alteredGlb, low),
    );
  });
});

import { describe, expect, it } from "vitest";
import { resolveMainFaceLoadingPolicy } from "./mainFaceLoadingPolicy";

describe("resolveMainFaceLoadingPolicy", () => {
  it("returns asset-load stage while import payload is loading", () => {
    const policy = resolveMainFaceLoadingPolicy({
      rootId: null,
      isAssetLoading: true,
      hasRuntimeInputBridge: false,
    });

    expect(policy).toEqual({
      stage: "asset-load",
      interactionEnabled: false,
      label: "Loading face asset",
      detail: "Preparing world and graph payloads.",
    });
  });

  it("returns idle stage when no face is loaded", () => {
    const policy = resolveMainFaceLoadingPolicy({
      rootId: null,
      isAssetLoading: false,
      hasRuntimeInputBridge: false,
    });

    expect(policy).toEqual({
      stage: "idle",
      interactionEnabled: false,
      label: "No face loaded",
      detail: "Import a face to begin authoring.",
    });
  });

  it("returns face-visible stage when runtime controls are still wiring", () => {
    const policy = resolveMainFaceLoadingPolicy({
      rootId: "root-1",
      isAssetLoading: false,
      hasRuntimeInputBridge: false,
    });

    expect(policy).toEqual({
      stage: "face-visible",
      interactionEnabled: false,
      label: "Face visible, preparing controls",
      detail: "Graph registration and input bridge are still settling.",
    });
  });

  it("returns controls-ready stage when runtime input bridge is available", () => {
    const policy = resolveMainFaceLoadingPolicy({
      rootId: "root-1",
      isAssetLoading: false,
      hasRuntimeInputBridge: true,
    });

    expect(policy).toEqual({
      stage: "controls-ready",
      interactionEnabled: true,
      label: "Controls ready",
      detail: "Authoring panels are fully interactive.",
    });
  });
});

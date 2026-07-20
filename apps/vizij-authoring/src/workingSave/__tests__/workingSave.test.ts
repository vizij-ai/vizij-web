import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkingSignature,
  clearWorkingDocument,
  loadWorkingDocument,
  saveWorkingDocument,
  type WorkingSaveContent,
} from "../workingSave";
import { ANIMATION_CLIP_IR_SCHEMA_VERSION } from "../../types/animationClipIr";

function content(overrides?: Partial<WorkingSaveContent>): WorkingSaveContent {
  return {
    faceId: "quori",
    pose: { config: null, ir: null },
    animations: [
      {
        schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
        id: "clip-1",
        name: "Wave",
        duration: 2,
        tracks: [],
      },
    ],
    behaviors: [
      {
        programId: "prog-1",
        name: "Idle",
        snapshot: {
          nodes: [{ id: "n1" }],
          edges: [],
          enabledOutputs: ["rig/quori/x"],
          enabledInputs: [],
          customInputPaths: [],
        },
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  clearWorkingDocument("quori");
});

describe("workingSave", () => {
  it("round-trips a working document through localStorage", () => {
    const saved = saveWorkingDocument(content());
    expect(saved).not.toBeNull();
    expect(saved!.savedAt).toBeTruthy();

    const loaded = loadWorkingDocument("quori");
    expect(loaded).not.toBeNull();
    expect(loaded!.faceId).toBe("quori");
    expect(loaded!.animations[0]!.name).toBe("Wave");
    expect(loaded!.behaviors[0]!.snapshot.enabledOutputs).toEqual([
      "rig/quori/x",
    ]);
    expect(buildWorkingSignature(loaded!)).toBe(
      buildWorkingSignature(content()),
    );
  });

  it("returns null for missing, other-face, or invalid payloads", () => {
    expect(loadWorkingDocument("quori")).toBeNull();
    saveWorkingDocument(content());
    expect(loadWorkingDocument("toasty")).toBeNull();

    window.localStorage.setItem(
      "vizij-authoring:working-save:v1:quori",
      "not json",
    );
    expect(loadWorkingDocument("quori")).toBeNull();

    window.localStorage.setItem(
      "vizij-authoring:working-save:v1:quori",
      JSON.stringify({ version: 99 }),
    );
    expect(loadWorkingDocument("quori")).toBeNull();
  });

  it("does not save without a face id", () => {
    expect(saveWorkingDocument(content({ faceId: "  " }))).toBeNull();
  });

  it("signature changes with document content but not savedAt", () => {
    const base = buildWorkingSignature(content());
    expect(buildWorkingSignature(content())).toBe(base);
    expect(buildWorkingSignature(content({ animations: [] }))).not.toBe(base);
    const saved = saveWorkingDocument(content());
    expect(buildWorkingSignature(saved!)).toBe(base);
  });

  it("clearWorkingDocument removes the stored payload", () => {
    saveWorkingDocument(content());
    clearWorkingDocument("quori");
    expect(loadWorkingDocument("quori")).toBeNull();
  });
});

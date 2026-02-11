import { describe, expect, it } from "vitest";
import { resolvePoseGraphSourceInputId } from "../usePoseGraphImport";

describe("resolvePoseGraphSourceInputId", () => {
  it("prefers currentInputId when available", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "legacy/input/id",
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy/input/id");
  });

  it("falls back to poseSlug when no currentInputId is present", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: null,
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy_input_id");
  });

  it("returns null when both ids are missing", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "   ",
        poseSlug: "",
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { appendStandardInputPathSuffix } from "../useRigController";

describe("useRigController standard input path helpers", () => {
  it("appends duplicate suffixes to the leaf path segment", () => {
    expect(appendStandardInputPathSuffix("/gaze/up", "_copy")).toBe(
      "/gaze/up_copy",
    );
    expect(
      appendStandardInputPathSuffix("/rig/face/head/rotation/x", "_copy"),
    ).toBe("/rig/face/head/rotation/x_copy");
  });
});

import { describe, expect, it } from "vitest";
import {
  importFailure,
  poseGraphFailure,
  rigGraphCompileFailure,
  rigGraphFatalIssuesFailure,
} from "./faceLoadFailures";

describe("face load failures", () => {
  it("names one fatal rig issue, or counts several", () => {
    expect(rigGraphFatalIssuesFailure(["jaw: unknown slot"])).toBe(
      "The face's rig graph has a fatal issue: jaw: unknown slot",
    );
    expect(rigGraphFatalIssuesFailure(["a", "b"])).toBe(
      "The face's rig graph has 2 fatal issues: a; b",
    );
  });

  it("carries the compiler's message", () => {
    expect(rigGraphCompileFailure("IR compile failed.")).toBe(
      "The face's rig graph does not compile: IR compile failed.",
    );
  });

  it("carries an import's error message, whatever was thrown", () => {
    expect(importFailure("rig graph", new Error("bad spec"))).toBe(
      "The face's rig graph failed to import: bad spec",
    );
    expect(importFailure("pose config", "not a config")).toBe(
      "The face's pose config failed to import: not a config",
    );
    expect(poseGraphFailure(new Error(""))).toBe(
      "The face's pose graph failed to build: unknown error",
    );
  });
});

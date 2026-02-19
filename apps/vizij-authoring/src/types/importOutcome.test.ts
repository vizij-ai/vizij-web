import { describe, expect, it } from "vitest";
import {
  createPoseImportResult,
  isImportOutcomeSuccess,
  resolveImportSuccessStatus,
  resolveRigImportSuccessStatus,
  type ImportOutcomeStatus,
} from "./importOutcome";

describe("importOutcome helpers", () => {
  it("treats only success variants as successful outcomes", () => {
    const cases: Array<[ImportOutcomeStatus, boolean]> = [
      ["success", true],
      ["success_with_repair", true],
      ["blocked_recoverable", false],
      ["blocked_fatal", false],
    ];
    cases.forEach(([status, expected]) => {
      expect(isImportOutcomeSuccess(status)).toBe(expected);
    });
  });

  it("maps success status by repair presence deterministically", () => {
    expect(resolveImportSuccessStatus(false)).toBe("success");
    expect(resolveImportSuccessStatus(true)).toBe("success_with_repair");
  });

  it("marks rig import as repaired when any repair signal is present", () => {
    expect(
      resolveRigImportSuccessStatus({
        discrepancyReviewed: false,
        normalizationCount: 0,
        animatableFallbackCount: 0,
        missingBlueprintPathCount: 0,
      }),
    ).toBe("success");

    expect(
      resolveRigImportSuccessStatus({
        discrepancyReviewed: true,
        normalizationCount: 0,
        animatableFallbackCount: 0,
        missingBlueprintPathCount: 0,
      }),
    ).toBe("success_with_repair");

    expect(
      resolveRigImportSuccessStatus({
        discrepancyReviewed: false,
        normalizationCount: 1,
        animatableFallbackCount: 0,
        missingBlueprintPathCount: 0,
      }),
    ).toBe("success_with_repair");

    expect(
      resolveRigImportSuccessStatus({
        discrepancyReviewed: false,
        normalizationCount: 0,
        animatableFallbackCount: 1,
        missingBlueprintPathCount: 0,
      }),
    ).toBe("success_with_repair");

    expect(
      resolveRigImportSuccessStatus({
        discrepancyReviewed: false,
        normalizationCount: 0,
        animatableFallbackCount: 0,
        missingBlueprintPathCount: 1,
      }),
    ).toBe("success_with_repair");
  });

  it("creates pose import results with optional message", () => {
    expect(createPoseImportResult("success")).toEqual({
      status: "success",
      message: undefined,
    });
    expect(
      createPoseImportResult(
        "blocked_recoverable",
        "Pose graph import requires remap decisions.",
      ),
    ).toEqual({
      status: "blocked_recoverable",
      message: "Pose graph import requires remap decisions.",
    });
    expect(createPoseImportResult("blocked_fatal", "Failure")).toEqual({
      status: "blocked_fatal",
      message: "Failure",
    });
  });
});

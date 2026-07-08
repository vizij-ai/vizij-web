import { describe, expect, it } from "vitest";
import {
  computePoseContributionSemantics,
  formatContributionStrength,
} from "./poseContributionSemantics";

describe("pose contribution semantics", () => {
  it("computes contribution strength from neutral to target delta", () => {
    const semantics = computePoseContributionSemantics({
      targetValue: 1,
      appliedValue: 0.25,
      neutralValue: 0,
    });

    expect(semantics.targetOffset).toBe(1);
    expect(semantics.appliedOffset).toBe(0.25);
    expect(semantics.contributionStrength).toBe(0.25);
  });

  it("supports targets below neutral without changing semantics", () => {
    const semantics = computePoseContributionSemantics({
      targetValue: -1,
      appliedValue: 0,
      neutralValue: 1,
    });

    expect(semantics.targetOffset).toBe(-2);
    expect(semantics.appliedOffset).toBe(-1);
    expect(semantics.contributionStrength).toBe(0.5);
  });

  it("returns null strength when target equals neutral", () => {
    const semantics = computePoseContributionSemantics({
      targetValue: 0.2,
      appliedValue: 0.35,
      neutralValue: 0.2,
    });

    expect(semantics.targetOffset).toBe(0);
    expect(semantics.contributionStrength).toBeNull();
  });

  it("formats strength as percent", () => {
    expect(formatContributionStrength(0.328)).toBe("33%");
    expect(formatContributionStrength(null)).toBe("N/A");
    expect(formatContributionStrength(Number.NaN)).toBe("N/A");
  });
});

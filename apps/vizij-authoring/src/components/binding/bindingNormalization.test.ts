import { describe, expect, it } from "vitest";

import {
  buildPiecewiseNormalizeSnippet,
  formatScalarLiteral,
  normalizeSlotExpression,
} from "./bindingNormalization";

describe("bindingNormalization", () => {
  it("formats scalar literals with trimming", () => {
    expect(formatScalarLiteral(1)).toBe("1");
    expect(formatScalarLiteral(0.3333333)).toBe("0.3333");
    expect(formatScalarLiteral(Number.NaN)).toBe("0");
  });

  it("builds a piecewise snippet", () => {
    expect(buildPiecewiseNormalizeSnippet("s1", -1, 0.25, 2)).toBe(
      "piecewise_remap(s1, vec(-1, 0, 1), vec(-1, 0.25, 2))",
    );
  });

  it("wraps aliases inside primitive expressions", () => {
    const snippet = buildPiecewiseNormalizeSnippet("s1", -1, 0, 1);
    const result = normalizeSlotExpression({
      expression: "s1 + sin(s1)",
      alias: "s1",
      snippet,
    });
    expect(result).toEqual({
      status: "applied",
      expression: `${snippet} + sin(${snippet})`,
    });
  });

  it("skips when alias not present", () => {
    const snippet = buildPiecewiseNormalizeSnippet("s1", -1, 0, 1);
    expect(
      normalizeSlotExpression({
        expression: "s10 + 1",
        alias: "s1",
        snippet,
      }),
    ).toEqual({ status: "alias-missing" });
  });

  it("avoids double wrapping", () => {
    const snippet = buildPiecewiseNormalizeSnippet("s1", -1, 0, 1);
    expect(
      normalizeSlotExpression({
        expression: `${snippet} + 1`,
        alias: "s1",
        snippet,
      }),
    ).toEqual({ status: "already-normalized" });
  });

  it("handles empty expressions", () => {
    const snippet = buildPiecewiseNormalizeSnippet("s1", -1, 0, 1);
    expect(
      normalizeSlotExpression({
        expression: "   ",
        alias: "s1",
        snippet,
      }),
    ).toEqual({ status: "applied", expression: snippet });
  });
});

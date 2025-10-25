import { describe, expect, it } from "vitest";

import {
  collectExpressionReferences,
  parseControlExpression,
} from "./expression";

describe("parseControlExpression", () => {
  it("parses arithmetic expressions with references", () => {
    const result = parseControlExpression("A * (B + C)");
    expect(result.errors).toHaveLength(0);
    expect(result.node).not.toBeNull();
    const refs = collectExpressionReferences(result.node);
    expect(Array.from(refs).sort()).toEqual(["A", "B", "C"]);
  });

  it("parses averaged expressions", () => {
    const result = parseControlExpression("(A + B + C) / 3");
    expect(result.errors).toHaveLength(0);
    expect(result.node?.type).toBe("Binary");
    const refs = collectExpressionReferences(result.node);
    expect(Array.from(refs).sort()).toEqual(["A", "B", "C"]);
  });

  it("returns errors for invalid tokens", () => {
    const result = parseControlExpression("A + @");
    expect(result.node).toBeNull();
    expect(
      result.errors.some((error) => error.message.includes("Unexpected")),
    ).toBe(true);
  });
});

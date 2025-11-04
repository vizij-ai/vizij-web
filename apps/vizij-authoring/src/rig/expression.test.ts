import { describe, expect, it } from "vitest";

import {
  collectExpressionReferences,
  parseControlExpression,
} from "@vizij/node-graph-authoring";

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

  it("parses function calls with arguments", () => {
    const result = parseControlExpression("sin(A) + clamp(B, 0, 1)");
    expect(result.errors).toHaveLength(0);
    const refs = collectExpressionReferences(result.node);
    expect(Array.from(refs).sort()).toEqual(["A", "B"]);
  });

  it("reports errors for dangling commas in function calls", () => {
    const result = parseControlExpression("sin(A,)");
    expect(result.node).toBeNull();
    expect(
      result.errors.some((error) =>
        error.message.includes('Expected expression after ","'),
      ),
    ).toBe(true);
  });

  it("parses time and oscillator helpers", () => {
    const result = parseControlExpression("oscillator(A, time())");
    expect(result.errors).toHaveLength(0);
    const refs = collectExpressionReferences(result.node);
    expect(Array.from(refs).sort()).toEqual(["A"]);
  });

  it("parses comparison and logical expressions", () => {
    const result = parseControlExpression("A > B && !C");
    expect(result.errors).toHaveLength(0);
    expect(result.node).not.toBeNull();
    const refs = collectExpressionReferences(result.node);
    expect(Array.from(refs).sort()).toEqual(["A", "B", "C"]);
  });

  it("reports unsupported comparison operators", () => {
    const result = parseControlExpression("A >= B");
    expect(result.node).toBeNull();
    expect(
      result.errors.some((error) =>
        error.message.includes('Operator ">=" is not supported.'),
      ),
    ).toBe(true);
  });

  it("returns errors for invalid tokens", () => {
    const result = parseControlExpression("A + @");
    expect(result.node).toBeNull();
    expect(
      result.errors.some((error) => error.message.includes("Unexpected")),
    ).toBe(true);
  });
});

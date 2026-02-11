import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import { resolveRuntimeGraphSpec } from "../runtimeGraphSpec";

describe("resolveRuntimeGraphSpec", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const legacySpec: GraphSpec = {
    nodes: [{ id: "legacy", type: "input", params: { path: "rig/face/x" } }],
  };
  const compiledSpec: GraphSpec = {
    nodes: [{ id: "compiled", type: "input", params: { path: "rig/face/y" } }],
  };

  it("keeps last-known-good when IR compile fails", () => {
    const lastKnownGood = { spec: compiledSpec, source: "ir" as const };
    const compile = vi.fn(() => {
      throw new Error("compile failed");
    });
    const rigGraphBuild = {
      spec: legacySpec,
      ir: { compile } as unknown as BuildGraphResult["ir"],
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, lastKnownGood);

    expect(result.runtimeSpec).toBe(lastKnownGood);
    expect(result.blocked).toBe(true);
    expect(result.warning).toMatch(/compile failed/i);
  });

  it("uses compiled spec and updates last-known-good on success", () => {
    const lastKnownGood = null;
    const compile = vi.fn(() => ({ spec: compiledSpec, issues: [] }));
    const rigGraphBuild = {
      spec: legacySpec,
      ir: { compile } as unknown as BuildGraphResult["ir"],
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, lastKnownGood);

    expect(result.runtimeSpec?.spec).toEqual(compiledSpec);
    expect(result.runtimeSpec?.source).toBe("ir");
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("falls back to legacy spec when IR compile reports errors", () => {
    const lastKnownGood = null;
    const compile = vi.fn(() => ({
      spec: compiledSpec,
      issues: [
        {
          id: "issue_1",
          severity: "error",
          message: "Missing standard input",
        },
      ],
    }));
    const rigGraphBuild = {
      spec: legacySpec,
      ir: { compile } as unknown as BuildGraphResult["ir"],
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, lastKnownGood);

    expect(result.runtimeSpec?.spec).toEqual(legacySpec);
    expect(result.runtimeSpec?.source).toBe("legacy");
    expect(result.blocked).toBe(false);
    expect(result.warning).toMatch(/legacy spec/i);
    expect(warnSpy).toHaveBeenCalledWith(
      "[vizij-authoring] IR runtime compile reported issues",
      expect.any(Array),
    );
  });
});

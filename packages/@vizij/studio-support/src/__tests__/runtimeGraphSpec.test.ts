import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { resolveRuntimeGraphSpec } from "../index";

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

  it("uses compiled spec on clean IR compile", () => {
    const compile = vi.fn(() => ({ spec: compiledSpec, issues: [] }));
    const rigGraphBuild = {
      spec: legacySpec,
      ir: { compile } as unknown as BuildGraphResult["ir"],
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, null);

    expect(result.runtimeSpec?.spec).toEqual(compiledSpec);
    expect(result.runtimeSpec?.source).toBe("ir");
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("blocks runtime promotion when IR compile reports issues", () => {
    const lastKnownGood = { spec: compiledSpec, source: "ir" as const };
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
      summary: { faceId: "face" },
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, lastKnownGood);

    expect(result.runtimeSpec).toBe(lastKnownGood);
    expect(result.blocked).toBe(true);
    expect(result.warning).toMatch(/blocked/i);
    expect(warnSpy).toHaveBeenCalledWith(
      "[vizij-studio-support] IR runtime compile reported issues",
      expect.any(Array),
    );
  });

  it("uses legacy graph specs only when no IR is available", () => {
    const rigGraphBuild = {
      spec: legacySpec,
    } as BuildGraphResult;

    const result = resolveRuntimeGraphSpec(rigGraphBuild, null);

    expect(result.runtimeSpec).toEqual({ spec: legacySpec, source: "legacy" });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBeNull();
  });
});

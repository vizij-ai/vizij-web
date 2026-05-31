import { describe, expect, it, vi } from "vitest";
import { resolveRuntimeGraphSpecWithCache } from "../rigController/rigGraphCompiler";
import type { RuntimeGraphSpec } from "../runtimeGraphSpec";

describe("resolveRuntimeGraphSpecWithCache", () => {
  it("preserves last known good spec when runtime resolution is blocked", () => {
    const lastKnownGood: RuntimeGraphSpec = {
      spec: { nodes: [] } as any,
      source: "legacy",
    };
    const blockedBuild = {
      spec: { nodes: [] },
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], byTarget: {} },
      ir: {
        compile: () => ({ issues: [] }),
      },
    } as any;

    const { resolved, nextLastKnownGood } = resolveRuntimeGraphSpecWithCache(
      blockedBuild,
      lastKnownGood,
    );

    expect(resolved.blocked).toBe(true);
    expect(resolved.runtimeSpec).toBe(lastKnownGood);
    expect(nextLastKnownGood).toBe(lastKnownGood);
  });

  it("updates last known good spec on successful resolution", () => {
    const legacyBuild = {
      spec: { nodes: [{ id: "node", type: "const", params: {} }] },
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], byTarget: {} },
    } as any;

    const { resolved, nextLastKnownGood } = resolveRuntimeGraphSpecWithCache(
      legacyBuild,
      null,
    );

    expect(resolved.blocked).toBe(false);
    expect(resolved.runtimeSpec?.source).toBe("legacy");
    expect(nextLastKnownGood).toEqual(resolved.runtimeSpec);
  });

  it("does not promote legacy fallback when IR reports issues", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lastKnownGood: RuntimeGraphSpec = {
      spec: { nodes: [{ id: "previous", type: "const", params: {} }] } as any,
      source: "ir",
    };
    const buildWithIrIssues = {
      spec: { nodes: [{ id: "legacy", type: "const", params: {} }] },
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], byTarget: {} },
      ir: {
        compile: () => ({
          spec: { nodes: [{ id: "compiled", type: "const", params: {} }] },
          issues: [
            {
              id: "issue_1",
              severity: "error",
              message: "Missing input",
            },
          ],
        }),
      },
    } as any;

    const { resolved, nextLastKnownGood } = resolveRuntimeGraphSpecWithCache(
      buildWithIrIssues,
      lastKnownGood,
    );

    expect(resolved.blocked).toBe(true);
    expect(resolved.runtimeSpec).toBe(lastKnownGood);
    expect(nextLastKnownGood).toBe(lastKnownGood);
    warnSpy.mockRestore();
  });
});

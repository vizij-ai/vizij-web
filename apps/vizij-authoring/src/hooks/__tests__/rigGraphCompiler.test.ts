import { describe, expect, it, vi } from "vitest";
import {
  buildBindingIssuesMap,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
  resolveRuntimeGraphSpecWithCache,
} from "../rigController/rigGraphCompiler";
import type { RuntimeGraphSpec } from "../runtimeGraphSpec";

describe("buildRigGraphCompile", () => {
  it("returns null when no face id is available", () => {
    const result = buildRigGraphCompile({
      faceId: null,
      animatables: {},
      components: [],
      bindings: {} as any,
      inputsById: new Map(),
      inputBindings: {} as any,
      inputMetadata: new Map(),
      poseConfig: null,
    });
    expect(result).toBeNull();
  });

  it("delegates graph compilation and returns the build result", () => {
    const result = buildRigGraphCompile({
      faceId: "face",
      animatables: {},
      components: [],
      bindings: {} as any,
      inputsById: new Map(),
      inputBindings: {} as any,
      inputMetadata: new Map(),
      pipelineConfigByInputId: {
        jaw: {
          directInput: { enabled: true },
        },
      },
      poseConfig: {
        poses: [
          {
            values: { jaw: 0.7 },
            composeModes: { jaw: "average" },
          },
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result?.summary.faceId).toBe("face");
  });
});

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

describe("buildBindingIssuesMap", () => {
  it("clones issue arrays from build results", () => {
    const issues = {
      target_jaw: ["missing input"],
    };
    const result = {
      issues: { fatal: [], byTarget: issues },
    } as any;

    const map = buildBindingIssuesMap(result);
    issues.target_jaw.push("later mutation");

    expect(map.get("target_jaw")).toEqual(["missing input"]);
  });
});

describe("createGraphInsightSnapshot", () => {
  it("captures immutable insight payloads from graph builds", () => {
    const result = {
      summary: {
        faceId: "face",
        inputs: ["in_a"],
        outputs: ["out_a"],
        bindings: [{ id: "binding_1" }],
      },
      issues: {
        fatal: ["fatal_issue"],
        byTarget: {
          targetA: ["warning_a"],
        },
      },
    } as any;

    const snapshot = createGraphInsightSnapshot(result);
    result.summary.inputs.push("mutated");
    result.issues.byTarget.targetA.push("mutated");

    expect(snapshot.summary).toEqual({
      faceId: "face",
      inputs: ["in_a"],
      outputs: ["out_a"],
      bindings: 1,
    });
    expect(snapshot.issues).toEqual({
      fatal: ["fatal_issue"],
      byTarget: { targetA: ["warning_a"] },
    });
    expect(typeof snapshot.generatedAt).toBe("string");
  });
});

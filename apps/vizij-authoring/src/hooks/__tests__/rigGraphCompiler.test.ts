import { describe, expect, it, vi } from "vitest";
import * as graphAuthoring from "@vizij/node-graph-authoring";
import {
  buildBindingIssuesMap,
  buildPoseComposeModeByInputId,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
  resolveRuntimeGraphSpecWithCache,
} from "../rigController/rigGraphCompiler";
import type { RuntimeGraphSpec } from "../runtimeGraphSpec";

describe("buildPoseComposeModeByInputId", () => {
  it("projects compose modes only for targeted inputs", () => {
    const modes = buildPoseComposeModeByInputId({
      poses: [
        {
          values: { jaw: 0.4, smile: 1 },
          composeModes: { jaw: "average" },
        },
        {
          values: { smile: 0.2, blink: 1 },
          composeModes: { smile: "average", blink: "unsupported" },
        },
      ],
    });

    expect(modes).toEqual({
      jaw: "average",
      smile: "average",
      blink: "add",
    });
  });
});

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

  it("passes compose modes through to the graph compiler", () => {
    const buildRigGraphSpecSpy = vi
      .spyOn(graphAuthoring, "buildRigGraphSpec")
      .mockReturnValue({
        spec: { nodes: [] },
        summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
        issues: { fatal: [], byTarget: {} },
      } as any);

    const result = buildRigGraphCompile({
      faceId: "face",
      animatables: {},
      components: [],
      bindings: {} as any,
      inputsById: new Map(),
      inputBindings: {} as any,
      inputMetadata: new Map(),
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
    expect(buildRigGraphSpecSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        faceId: "face",
        inputComposeModesById: { jaw: "average" },
      }),
    );
    buildRigGraphSpecSpy.mockRestore();
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

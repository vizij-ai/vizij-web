import { describe, expect, it } from "vitest";
import {
  buildBindingIssuesMap,
  buildGraphMachineReport,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
} from "../utils/rigGraphCompiler";

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

describe("buildGraphMachineReport", () => {
  it("returns null when no graph build exists", () => {
    expect(buildGraphMachineReport(null)).toBeNull();
  });

  it("normalizes graph builds into machine reports", () => {
    const result = buildRigGraphCompile({
      faceId: "face",
      animatables: {},
      components: [],
      bindings: {} as any,
      inputsById: new Map(),
      inputBindings: {} as any,
      inputMetadata: new Map(),
      poseConfig: null,
    });

    const report = buildGraphMachineReport(result);

    expect(report).toMatchObject({
      faceId: "face",
      summary: {
        faceId: "face",
      },
    });
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

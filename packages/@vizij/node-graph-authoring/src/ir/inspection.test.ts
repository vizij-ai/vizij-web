import { describe, expect, it } from "vitest";

import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { BuildGraphResult } from "../graphBuilder";
import type { RemapSettings } from "@vizij/utils";
import type { MachineReport } from "./inspection";
import type { IrGraph } from "./types";
import {
  MACHINE_REPORT_VERSION,
  buildMachineReport,
  diffMachineReports,
} from "./inspection";

function createRemap(overrides?: Partial<RemapSettings>): RemapSettings {
  return {
    inLow: -1,
    inAnchor: -0.5,
    inHigh: 1,
    outLow: 0,
    outAnchor: 0.5,
    outHigh: 1,
    ...overrides,
  };
}

function createIrGraph(): IrGraph {
  return {
    id: "graph-b",
    faceId: "face-1",
    nodes: [
      {
        id: "node-b",
        type: "math",
        params: {
          zebra: 2,
          alpha: 1,
        },
        metadata: {
          order: {
            second: 2,
            first: 1,
          },
          inner: {
            z: 2,
            a: 1,
          },
        },
      },
      {
        id: "node-a",
        type: "input",
        metadata: {
          foo: "bar",
        },
      },
    ],
    edges: [
      {
        from: { nodeId: "node-a" },
        to: { nodeId: "node-b", portId: "in" },
        metadata: { zebra: true, alpha: false },
      },
    ],
    constants: [
      {
        id: "const-b",
        value: 2,
        valueType: "scalar",
        metadata: { z: 2, a: 1 },
      },
      { id: "const-a", value: 1, valueType: "scalar" },
    ],
    issues: [
      {
        id: "issue-b",
        severity: "warning",
        message: "warn",
        tags: ["beta", "alpha"],
      },
      {
        id: "issue-a",
        severity: "error",
        message: "err",
      },
    ],
    summary: {
      faceId: "face-1",
      inputs: ["z-in", "a-in"],
      outputs: ["z-out", "a-out"],
      bindings: [
        {
          targetId: "target-b",
          animatableId: "anim-b",
          component: "x",
          slotId: "slot-b",
          slotAlias: "slotB",
          inputId: "input-b",
          remap: {
            zebra: 2,
            alpha: 1,
          },
          expression: "expr-b",
          valueType: "scalar",
          nodeId: "node-slot-b",
          expressionNodeId: "expr-node-b",
          issues: ["issue-2", "issue-1"],
        },
      ],
    },
    metadata: {
      source: "graphBuilder",
      registryVersion: "1.0.0",
      generatedAt: "2025-11-07T10:00:00.000Z",
      annotations: { zebra: true, alpha: false },
    },
  };
}

function createBuildGraphResult(): BuildGraphResult {
  const remapA = createRemap({
    inLow: -2,
    outHigh: 2,
  });
  const remapB = createRemap({
    inLow: -3,
    outLow: -1,
  });
  const caseMetadata = {
    kind: "case" as const,
    selector: {
      kind: "slot" as const,
      slotId: "slot-a",
      alias: "slotA",
    },
    defaultBranch: {
      kind: "literal" as const,
      literalValue: 0,
    },
    branches: [
      {
        kind: "literal" as const,
        literalValue: 1,
      },
      {
        kind: "slot" as const,
        slotId: "slot-b",
        alias: "slotB",
        inputId: "input-b",
      },
    ],
  };
  return {
    spec: {} as GraphSpec,
    summary: {
      faceId: "face-1",
      inputs: ["input-b", "input-a"],
      outputs: ["out-b", "out-a"],
      bindings: [
        {
          targetId: "zeta-target",
          animatableId: "anim-b",
          component: "y",
          slotId: "slot-b",
          slotAlias: "slotB",
          inputId: "input-b",
          remap: remapB,
          expression: "expr-b",
          valueType: "scalar",
          nodeId: "node-zeta",
          expressionNodeId: "expr-zeta",
          issues: ["binding-issue-b", "binding-issue-a"],
          metadata: {
            expression: {
              case: caseMetadata,
            },
            tags: ["alpha", "zeta"],
          },
        },
        {
          targetId: "alpha-target",
          animatableId: "anim-a",
          slotId: "slot-a",
          slotAlias: "slotA",
          inputId: null,
          remap: remapA,
          expression: "expr-a",
          valueType: "vector",
          nodeId: "node-alpha",
          expressionNodeId: "expr-alpha",
          issues: ["binding-issue-c"],
        },
      ],
    },
    issues: {
      fatal: ["fatal-b", "fatal-a"],
      byTarget: {
        "zeta-target": ["target-issue-b", "target-issue-a"],
        "alpha-target": ["target-issue-c"],
      },
    },
    ir: {
      graph: createIrGraph(),
      compile: () => ({
        spec: {} as GraphSpec,
        issues: [],
      }),
    },
  };
}

describe("buildMachineReport", () => {
  it("normalizes result data for deterministic dumps", () => {
    const buildResult = createBuildGraphResult();
    const report = buildMachineReport(buildResult);

    expect(report.reportVersion).toBe(MACHINE_REPORT_VERSION);
    expect(report.summary.inputs).toEqual(["input-a", "input-b"]);
    expect(report.summary.outputs).toEqual(["out-a", "out-b"]);
    expect(report.summary.bindings.map((binding) => binding.targetId)).toEqual([
      "alpha-target",
      "zeta-target",
    ]);
    expect(report.summary.bindings[1].issues).toEqual([
      "binding-issue-a",
      "binding-issue-b",
    ]);
    expect(report.summary.bindings[1].metadata).toEqual({
      expression: {
        case: {
          kind: "case",
          selector: {
            kind: "slot",
            slotId: "slot-a",
            alias: "slotA",
          },
          defaultBranch: {
            kind: "literal",
            literalValue: 0,
          },
          branches: [
            {
              kind: "literal",
              literalValue: 1,
            },
            {
              kind: "slot",
              slotId: "slot-b",
              alias: "slotB",
              inputId: "input-b",
            },
          ],
        },
      },
      tags: ["alpha", "zeta"],
    });
    expect(report.summary.bindings[1].metadata).not.toBe(
      buildResult.summary.bindings[0].metadata,
    );

    expect(report.issues.fatal).toEqual(["fatal-a", "fatal-b"]);
    expect(Object.keys(report.issues.byTarget)).toEqual([
      "alpha-target",
      "zeta-target",
    ]);
    expect(report.issues.byTarget["zeta-target"]).toEqual([
      "target-issue-a",
      "target-issue-b",
    ]);

    expect(report.irGraph).toBeDefined();
    const metadata = report.irGraph?.metadata;
    expect(metadata).toBeDefined();
    if (!metadata) {
      throw new Error("Expected metadata on the IR graph");
    }
    expect(metadata).not.toHaveProperty("generatedAt");
    expect(metadata.annotations).toEqual({ alpha: false, zebra: true });
    expect(report.irGraph?.nodes.map((node) => node.id)).toEqual([
      "node-a",
      "node-b",
    ]);
    expect(report.irGraph?.nodes[1].metadata).toEqual({
      inner: { a: 1, z: 2 },
      order: { first: 1, second: 2 },
    });
    const registryAnnotation = report.irGraph?.nodes[0].annotations?.registry;
    expect(registryAnnotation?.typeId).toBe("input");
    expect(registryAnnotation?.inputs).toEqual(expect.any(Array));
    expect(report.irGraph?.summary.inputs).toEqual(["a-in", "z-in"]);
    expect(report.irGraph?.summary.bindings[0].issues).toEqual([
      "issue-1",
      "issue-2",
    ]);
  });
});

describe("diffMachineReports", () => {
  it("detects mismatches across nested structures", () => {
    const baseline = buildMachineReport(createBuildGraphResult());
    const changed: MachineReport = JSON.parse(
      JSON.stringify(baseline),
    ) as MachineReport;
    changed.summary.inputs.push("input-c");
    changed.summary.bindings[0].slotAlias = "slotA-updated";
    changed.irGraph!.nodes[0].type = "input-updated";

    const diff = diffMachineReports(changed, baseline);

    expect(diff.equal).toBe(false);
    expect(
      diff.differences.some(
        (entry) =>
          entry.path === "$.summary.inputs[2]" && entry.kind === "unexpected",
      ),
    ).toBe(true);
    expect(
      diff.differences.some(
        (entry) =>
          entry.path === "$.summary.bindings[0].slotAlias" &&
          entry.kind === "mismatch",
      ),
    ).toBe(true);
    expect(
      diff.differences.some(
        (entry) =>
          entry.path === "$.irGraph.nodes[0].type" && entry.kind === "mismatch",
      ),
    ).toBe(true);
  });

  it("respects diff entry limits", () => {
    const baseline = buildMachineReport(createBuildGraphResult());
    const changed: MachineReport = JSON.parse(
      JSON.stringify(baseline),
    ) as MachineReport;
    changed.summary.inputs.push("input-extra");
    changed.summary.outputs.push("out-extra");

    const diff = diffMachineReports(changed, baseline, { limit: 1 });

    expect(diff.differences).toHaveLength(1);
    expect(diff.limitReached).toBe(true);
  });
});

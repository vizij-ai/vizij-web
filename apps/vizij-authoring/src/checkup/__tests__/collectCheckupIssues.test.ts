import { describe, expect, it } from "vitest";
import {
  buildCheckupReport,
  collectBundleIssues,
  collectImportIssues,
  collectPoseIssues,
  collectRigGraphIssues,
  collectRobotDataIssues,
} from "../collectCheckupIssues";
import type { BundleGraphAuditEntry } from "../../utils/bundleAudit";
import type { RobotDataAuditResult } from "../../utils/robotDataAudit";
import type { DiscrepancyReviewState } from "../../types/discrepancy";

function bundleEntry(
  overrides: Partial<BundleGraphAuditEntry>,
): BundleGraphAuditEntry {
  return {
    id: "graph-1",
    kind: "rig",
    faceId: "robot",
    status: "match",
    diffCount: 0,
    diffLimitReached: false,
    issues: [],
    outputs: [],
    ...overrides,
  };
}

const EMPTY_ROBOT_RESULT: RobotDataAuditResult = {
  totalNodes: 10,
  robotDataNodes: 10,
  nodesWithoutRobotData: [],
  refsUnavailable: [],
  missingAnimatables: [],
  nameMismatches: [],
  drifts: [],
};

describe("collectRigGraphIssues", () => {
  it("maps graph errors, machine issues, and binding issues by severity", () => {
    const issues = collectRigGraphIssues({
      graphStatus: "error",
      graphError: "graph failed to build",
      graphWarning: "one input unbound",
      machineReport: {
        reportVersion: 1,
        faceId: "robot",
        summary: { faceId: "robot", inputs: [], outputs: [], bindings: [] },
        issues: {
          fatal: ["missing output node"],
          byTarget: { jaw: ["dangling slot"] },
        },
      },
      bindingIssues: new Map([["brow", ["unknown input id"]]]),
    });
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(
      2,
    );
    expect(issues.filter((issue) => issue.severity === "warning")).toHaveLength(
      3,
    );
  });

  it("is empty for a healthy graph", () => {
    expect(
      collectRigGraphIssues({
        graphStatus: "ready",
        graphError: null,
        graphWarning: null,
        machineReport: null,
        bindingIssues: new Map(),
      }),
    ).toHaveLength(0);
  });
});

describe("collectBundleIssues", () => {
  it("returns nothing when the audit has not run", () => {
    expect(collectBundleIssues(null)).toHaveLength(0);
  });

  it("maps diff, missing-ir, error, and missing output targets", () => {
    const issues = collectBundleIssues([
      bundleEntry({ id: "a", status: "diff", diffCount: 3 }),
      bundleEntry({ id: "b", status: "missing-ir" }),
      bundleEntry({ id: "c", status: "error", error: "boom" }),
      bundleEntry({
        id: "d",
        status: "match",
        outputs: [
          { nodeId: "n1", path: "rig/x", status: "missing-target" },
          { nodeId: "n2", path: "rig/y", status: "ok" },
        ],
      }),
    ]);
    expect(issues.map((issue) => issue.severity).sort()).toEqual([
      "error",
      "error",
      "info",
      "warning",
    ]);
    const missingTargets = issues.find((issue) =>
      issue.id.endsWith("missing-targets"),
    );
    expect(missingTargets?.details).toContain("rig/x");
    expect(missingTargets?.details).not.toContain("rig/y");
  });
});

describe("collectRobotDataIssues", () => {
  it("returns nothing before the audit runs and nothing when clean", () => {
    expect(collectRobotDataIssues(null)).toHaveLength(0);
    expect(collectRobotDataIssues(EMPTY_ROBOT_RESULT)).toHaveLength(0);
  });

  it("aggregates each category with counts and previews", () => {
    const issues = collectRobotDataIssues({
      ...EMPTY_ROBOT_RESULT,
      nodesWithoutRobotData: Array.from({ length: 12 }, (_, i) => `node-${i}`),
      missingAnimatables: [
        {
          nodeId: "n1",
          nodeName: "Jaw",
          feature: "rotation",
          animatableId: "anim-1",
        },
      ],
    });
    expect(issues).toHaveLength(2);
    const missing = issues.find((issue) => issue.severity === "error");
    expect(missing?.message).toContain("1 RobotData feature");
    const withoutData = issues.find((issue) => issue.severity === "warning");
    expect(withoutData?.message).toContain("12 scene nodes");
    expect(withoutData?.details?.at(-1)).toContain("more");
  });
});

describe("collectPoseIssues / collectImportIssues", () => {
  it("passes pose diagnostics through and aggregates unmatched outputs", () => {
    const issues = collectPoseIssues({
      poseDiagnostics: [
        {
          id: "d1",
          severity: "error",
          message: "bad pose",
          code: "pose/invalid",
          source: "pose-config",
        },
        {
          id: "d2",
          severity: "info",
          message: "fyi",
          code: "pose/note",
          source: "pose-ir",
        },
      ],
      unmatchedPoseOutputs: [{ poseName: "Smile", inputId: "jaw", value: 1 }],
    });
    expect(issues).toHaveLength(3);
    expect(issues[2]!.message).toContain("1 active expression output");
  });

  it("maps a pending discrepancy review to warnings", () => {
    const review: DiscrepancyReviewState = {
      id: "r1",
      createdAt: "2026-01-01T00:00:00Z",
      faceId: "robot",
      importedFaceId: "robot-old",
      mismatchReasons: ["face id changed"],
      diff: { entries: [{ id: "e1" }] as never, limitReached: false },
      missingAutoInputs: ["left_eye"],
    };
    const issues = collectImportIssues(review);
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(collectImportIssues(null)).toHaveLength(0);
  });
});

describe("buildCheckupReport", () => {
  it("rolls sections up into an overall status with counts", () => {
    const report = buildCheckupReport([
      { id: "rig-graph", issues: [], hasResult: true },
      {
        id: "bundle",
        issues: [
          {
            id: "bundle/x",
            section: "bundle",
            severity: "warning",
            message: "w",
          },
        ],
        hasResult: true,
      },
      { id: "robot-data", issues: [], hasResult: false },
    ]);
    expect(report.overall).toBe("warnings");
    expect(report.totalWarnings).toBe(1);
    expect(report.totalErrors).toBe(0);
    expect(report.sections.map((section) => section.status)).toEqual([
      "pass",
      "warnings",
      "not-run",
    ]);
  });

  it("prefers running over error rollups and counts errors", () => {
    const report = buildCheckupReport([
      {
        id: "rig-graph",
        issues: [
          {
            id: "rig-graph/x",
            section: "rig-graph",
            severity: "error",
            message: "e",
          },
        ],
        hasResult: true,
      },
      { id: "robot-data", issues: [], running: true, hasResult: false },
    ]);
    expect(report.overall).toBe("running");
    expect(report.totalErrors).toBe(1);
    expect(report.sections[0]!.status).toBe("errors");
    expect(report.sections[1]!.status).toBe("running");
  });

  it("reports pass when every section is clean", () => {
    const report = buildCheckupReport([
      { id: "rig-graph", issues: [], hasResult: true },
      { id: "poses", issues: [], hasResult: true },
    ]);
    expect(report.overall).toBe("pass");
  });
});

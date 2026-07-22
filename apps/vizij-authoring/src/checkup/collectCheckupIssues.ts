import type { MachineReport } from "@vizij/node-graph-authoring";
import type { BundleGraphAuditEntry } from "../utils/bundleAudit";
import type { RobotDataAuditResult } from "../utils/robotDataAudit";
import type { DiscrepancyReviewState } from "../types/discrepancy";
import type { PoseDiagnostic } from "../poseRig/types";
import type {
  CheckupIssue,
  CheckupOverallStatus,
  CheckupReport,
  CheckupSectionId,
  CheckupSectionStatus,
  CheckupSectionSummary,
} from "./types";

const DETAIL_PREVIEW_LIMIT = 8;

function preview(values: readonly string[]): string[] {
  const shown = values.slice(0, DETAIL_PREVIEW_LIMIT);
  const hidden = values.length - shown.length;
  return hidden > 0 ? [...shown, `…and ${hidden} more`] : [...shown];
}

export interface RigGraphCheckupInput {
  graphStatus: string;
  graphError: string | null | undefined;
  graphWarning: string | null | undefined;
  machineReport: MachineReport | null;
  bindingIssues: ReadonlyMap<string, readonly string[]>;
}

export function collectRigGraphIssues(
  input: RigGraphCheckupInput,
): CheckupIssue[] {
  const issues: CheckupIssue[] = [];
  if (input.graphError) {
    issues.push({
      id: "rig-graph/error",
      section: "rig-graph",
      severity: "error",
      message: input.graphError,
    });
  }
  if (input.graphWarning) {
    issues.push({
      id: "rig-graph/warning",
      section: "rig-graph",
      severity: "warning",
      message: input.graphWarning,
    });
  }
  input.machineReport?.issues.fatal.forEach((message, index) => {
    issues.push({
      id: `rig-graph/fatal/${index}`,
      section: "rig-graph",
      severity: "error",
      message,
    });
  });
  const byTarget = input.machineReport?.issues.byTarget ?? {};
  Object.entries(byTarget).forEach(([targetId, messages]) => {
    if (!messages.length) {
      return;
    }
    issues.push({
      id: `rig-graph/target/${targetId}`,
      section: "rig-graph",
      severity: "warning",
      message: `Control "${targetId}" has ${messages.length} graph issue${
        messages.length === 1 ? "" : "s"
      }`,
      details: preview(messages),
    });
  });
  input.bindingIssues.forEach((messages, targetId) => {
    if (!messages.length) {
      return;
    }
    issues.push({
      id: `rig-graph/binding/${targetId}`,
      section: "rig-graph",
      severity: "warning",
      message: `Link "${targetId}" has ${messages.length} issue${
        messages.length === 1 ? "" : "s"
      }`,
      details: preview(messages),
    });
  });
  return issues;
}

export function collectBundleIssues(
  audits: readonly BundleGraphAuditEntry[] | null,
): CheckupIssue[] {
  if (!audits) {
    return [];
  }
  const issues: CheckupIssue[] = [];
  audits.forEach((entry) => {
    const label = entry.label ?? entry.id;
    if (entry.status === "error") {
      issues.push({
        id: `bundle/${entry.id}/error`,
        section: "bundle",
        severity: "error",
        message: `Face Package graph "${label}" failed to audit${
          entry.error ? `: ${entry.error}` : ""
        }`,
      });
    } else if (entry.status === "diff") {
      issues.push({
        id: `bundle/${entry.id}/diff`,
        section: "bundle",
        severity: "warning",
        message: `Face Package graph "${label}" differs from its rebuilt IR (${
          entry.diffCount
        }${entry.diffLimitReached ? "+" : ""} difference${
          entry.diffCount === 1 ? "" : "s"
        })`,
        details: preview(entry.issues),
      });
    } else if (entry.status === "missing-ir") {
      issues.push({
        id: `bundle/${entry.id}/missing-ir`,
        section: "bundle",
        severity: "info",
        message: `Face Package graph "${label}" has no IR payload, so it cannot be verified`,
      });
    }
    const missingTargets = entry.outputs.filter(
      (output) => output.status === "missing-target",
    );
    if (missingTargets.length > 0) {
      issues.push({
        id: `bundle/${entry.id}/missing-targets`,
        section: "bundle",
        severity: "error",
        message: `Face Package graph "${label}" writes ${missingTargets.length} output${
          missingTargets.length === 1 ? "" : "s"
        } with no runtime target`,
        details: preview(
          missingTargets.map(
            (output) => output.path ?? `(node ${output.nodeId})`,
          ),
        ),
      });
    }
  });
  return issues;
}

export function collectRobotDataIssues(
  result: RobotDataAuditResult | null,
): CheckupIssue[] {
  if (!result) {
    return [];
  }
  const issues: CheckupIssue[] = [];
  if (result.missingAnimatables.length > 0) {
    issues.push({
      id: "robot-data/missing-animatables",
      section: "robot-data",
      severity: "error",
      message: `${result.missingAnimatables.length} RobotData feature${
        result.missingAnimatables.length === 1 ? "" : "s"
      } reference missing animatables`,
      details: preview(
        result.missingAnimatables.map(
          (entry) =>
            `${entry.nodeName} · ${entry.feature} → ${entry.animatableId}`,
        ),
      ),
    });
  }
  if (result.nodesWithoutRobotData.length > 0) {
    issues.push({
      id: "robot-data/nodes-without",
      section: "robot-data",
      severity: "warning",
      message: `${result.nodesWithoutRobotData.length} scene node${
        result.nodesWithoutRobotData.length === 1 ? "" : "s"
      } have no RobotData identity`,
      details: preview(result.nodesWithoutRobotData),
    });
  }
  if (result.nameMismatches.length > 0) {
    issues.push({
      id: "robot-data/name-mismatches",
      section: "robot-data",
      severity: "warning",
      message: `${result.nameMismatches.length} node name${
        result.nameMismatches.length === 1 ? "" : "s"
      } differ between RobotData and the scene`,
      details: preview(
        result.nameMismatches.map(
          (entry) => `${entry.storedName} ↔ ${entry.objectName}`,
        ),
      ),
    });
  }
  if (result.drifts.length > 0) {
    issues.push({
      id: "robot-data/drift",
      section: "robot-data",
      severity: "warning",
      message: `${result.drifts.length} feature value${
        result.drifts.length === 1 ? "" : "s"
      } drift from their stored RobotData`,
      details: preview(
        result.drifts.map(
          (entry) =>
            `${entry.nodeName} · ${entry.feature} (Δ ${entry.delta.toFixed(4)})`,
        ),
      ),
    });
  }
  if (result.refsUnavailable.length > 0) {
    issues.push({
      id: "robot-data/refs-unavailable",
      section: "robot-data",
      severity: "info",
      message: `${result.refsUnavailable.length} node${
        result.refsUnavailable.length === 1 ? "" : "s"
      } could not be inspected (refs unavailable)`,
      details: preview(result.refsUnavailable),
    });
  }
  return issues;
}

export interface PoseCheckupInput {
  poseDiagnostics: readonly PoseDiagnostic[];
  unmatchedPoseOutputs: readonly {
    poseName: string;
    inputId: string;
    value: number;
  }[];
}

export function collectPoseIssues(input: PoseCheckupInput): CheckupIssue[] {
  const issues: CheckupIssue[] = [];
  input.poseDiagnostics.forEach((diagnostic) => {
    issues.push({
      id: `poses/diagnostic/${diagnostic.id}`,
      section: "poses",
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  });
  if (input.unmatchedPoseOutputs.length > 0) {
    issues.push({
      id: "poses/unmatched-outputs",
      section: "poses",
      severity: "warning",
      message: `${input.unmatchedPoseOutputs.length} active expression output${
        input.unmatchedPoseOutputs.length === 1 ? "" : "s"
      } are not mapped into any control chain`,
      details: preview(
        input.unmatchedPoseOutputs.map(
          (output) => `${output.poseName} → ${output.inputId}`,
        ),
      ),
    });
  }
  return issues;
}

export function collectImportIssues(
  review: DiscrepancyReviewState | null,
): CheckupIssue[] {
  if (!review) {
    return [];
  }
  const issues: CheckupIssue[] = [];
  if (review.diff.entries.length > 0) {
    issues.push({
      id: "import/discrepancies",
      section: "import",
      severity: "warning",
      message: `Imported graph differs from the rebuilt graph (${
        review.diff.entries.length
      }${review.diff.limitReached ? "+" : ""} difference${
        review.diff.entries.length === 1 ? "" : "s"
      } awaiting review)`,
      details: preview(review.mismatchReasons),
    });
  }
  if (review.missingAutoInputs.length > 0) {
    issues.push({
      id: "import/missing-auto-inputs",
      section: "import",
      severity: "warning",
      message: `${review.missingAutoInputs.length} imported input${
        review.missingAutoInputs.length === 1 ? "" : "s"
      } have no matching auto input`,
      details: preview(review.missingAutoInputs),
    });
  }
  return issues;
}

const SECTION_LABELS: Record<CheckupSectionId, string> = {
  "rig-graph": "Controls Graph",
  bundle: "Face Package Graphs",
  "robot-data": "Robot Data",
  poses: "Expressions",
  import: "Import",
};

export interface CheckupSectionInput {
  id: CheckupSectionId;
  issues: CheckupIssue[];
  /** True while this section's audit is currently running. */
  running?: boolean;
  /** True when the section's audit has produced a result (or needs none). */
  hasResult: boolean;
}

function sectionStatus(input: CheckupSectionInput): CheckupSectionStatus {
  if (input.running) {
    return "running";
  }
  if (!input.hasResult) {
    return "not-run";
  }
  if (input.issues.some((issue) => issue.severity === "error")) {
    return "errors";
  }
  if (input.issues.some((issue) => issue.severity === "warning")) {
    return "warnings";
  }
  return "pass";
}

export function buildCheckupReport(
  sections: CheckupSectionInput[],
): CheckupReport {
  const summaries: CheckupSectionSummary[] = sections.map((section) => ({
    id: section.id,
    label: SECTION_LABELS[section.id],
    status: sectionStatus(section),
    issues: section.issues,
  }));
  const allIssues = summaries.flatMap((section) => section.issues);
  const totalErrors = allIssues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const totalWarnings = allIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  let overall: CheckupOverallStatus = "pass";
  if (summaries.some((section) => section.status === "running")) {
    overall = "running";
  } else if (totalErrors > 0) {
    overall = "errors";
  } else if (totalWarnings > 0) {
    overall = "warnings";
  }
  return { sections: summaries, overall, totalErrors, totalWarnings };
}

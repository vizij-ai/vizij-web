/**
 * The unified Checkup model: one severity-rolled issue list spanning the
 * previously separate audit surfaces (rig graph diagnostics, bundle graph
 * audit, RobotData audit, pose diagnostics, import discrepancy review).
 */

export type CheckupSeverity = "error" | "warning" | "info";

export type CheckupSectionId =
  | "rig-graph"
  | "bundle"
  | "robot-data"
  | "poses"
  | "import";

export interface CheckupIssue {
  id: string;
  section: CheckupSectionId;
  severity: CheckupSeverity;
  message: string;
  /** Optional supporting lines (paths, node ids, first N offenders). */
  details?: string[];
}

export type CheckupSectionStatus =
  | "pass"
  | "warnings"
  | "errors"
  | "running"
  | "not-run";

export interface CheckupSectionSummary {
  id: CheckupSectionId;
  label: string;
  status: CheckupSectionStatus;
  issues: CheckupIssue[];
}

export type CheckupOverallStatus = "pass" | "warnings" | "errors" | "running";

export interface CheckupReport {
  sections: CheckupSectionSummary[];
  overall: CheckupOverallStatus;
  totalErrors: number;
  totalWarnings: number;
}

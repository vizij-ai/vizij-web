import { useCallback, useEffect, useMemo, useState } from "react";
import {
  diffMachineReports,
  type MachineDiffEntry,
  type MachineDiffResult,
  type MachineReport,
} from "@vizij/node-graph-authoring";

const BUG_REPORT_DIFF_PREVIEW_LIMIT = 8;

export interface UseMachineReportDiffOptions {
  open: boolean;
  report: MachineReport | null;
  diffLimit: number;
}

export interface UseMachineReportDiffResult {
  diffText: string;
  setDiffText: (value: string) => void;
  diffResult: MachineDiffResult | null;
  diffError: string | null;
  graphJson: string | null;
  bugReportTemplate: string | null;
  compareReports: () => void;
  loadDiffTextFromFile: (file: File) => Promise<void>;
}

export function useMachineReportDiff({
  open,
  report,
  diffLimit,
}: UseMachineReportDiffOptions): UseMachineReportDiffResult {
  const [diffText, setDiffText] = useState("");
  const [diffResult, setDiffResult] = useState<MachineDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [graphJson, setGraphJson] = useState<string | null>(null);

  useEffect(() => {
    if (open && report?.irGraph) {
      setGraphJson(JSON.stringify(report.irGraph, null, 2));
    } else {
      setGraphJson(null);
    }
  }, [open, report]);

  useEffect(() => {
    if (!open) {
      setDiffText("");
      setDiffResult(null);
      setDiffError(null);
    }
  }, [open]);

  const compareReports = useCallback(() => {
    if (!report) {
      setDiffError("Generate a current IR snapshot before diffing.");
      return;
    }
    const trimmed = diffText.trim();
    if (!trimmed) {
      setDiffError("Paste a saved machine report JSON to diff against.");
      return;
    }
    let target: MachineReport | null = null;
    try {
      const parsed = JSON.parse(trimmed);
      if (isMachineReportCandidate(parsed)) {
        target = parsed;
      }
    } catch {
      // ignored: surfaced via generic parse error below
    }
    if (!target) {
      setDiffError("Pasted JSON did not look like a machine report.");
      return;
    }
    const diff = diffMachineReports(report, target, { limit: diffLimit });
    setDiffError(null);
    setDiffResult(diff);
  }, [diffLimit, diffText, report]);

  const loadDiffTextFromFile = useCallback(async (file: File) => {
    try {
      const value = await file.text();
      setDiffText(value);
      setDiffError(null);
    } catch {
      setDiffError("Unable to read the selected file.");
    }
  }, []);

  const bugReportTemplate = useMemo(() => {
    if (!report || !diffResult) {
      return null;
    }
    return buildBugReportTemplate(report, diffResult);
  }, [diffResult, report]);

  return {
    diffText,
    setDiffText,
    diffResult,
    diffError,
    graphJson,
    bugReportTemplate,
    compareReports,
    loadDiffTextFromFile,
  };
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const asString = JSON.stringify(value);
    return asString.length > 60 ? `${asString.slice(0, 57)}…` : asString;
  } catch {
    return String(value);
  }
}

function formatDiffEntrySummary(entry: MachineDiffEntry): string {
  const path = entry.path || "/";
  switch (entry.kind) {
    case "missing":
      return `- missing ${path} (expected ${formatDiffValue(entry.expected)})`;
    case "unexpected":
      return `- unexpected ${path} (actual ${formatDiffValue(entry.actual)})`;
    default:
      return `- mismatch ${path} (expected ${formatDiffValue(
        entry.expected,
      )}, actual ${formatDiffValue(entry.actual)})`;
  }
}

export function isMachineReportCandidate(
  value: unknown,
): value is MachineReport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MachineReport>;
  return (
    typeof candidate.reportVersion === "number" &&
    typeof candidate.summary === "object" &&
    typeof candidate.issues === "object"
  );
}

export function buildVizijIrDiffCommand(faceId?: string | null): string {
  const safeFaceId =
    faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
  return `vizij-ir-report --diff ${safeFaceId}_machine-report.json saved-report.json`;
}

export function buildBugReportTemplate(
  report: MachineReport,
  diff: MachineDiffResult,
): string {
  const previewEntries = diff.differences.slice(
    0,
    BUG_REPORT_DIFF_PREVIEW_LIMIT,
  );
  const diffSummary =
    previewEntries.length > 0
      ? previewEntries.map(formatDiffEntrySummary).join("\n")
      : "- No structural differences captured.";
  const remaining = diff.differences.length - previewEntries.length;
  const remainderLine =
    remaining > 0
      ? `\n…plus ${remaining} additional difference${remaining === 1 ? "" : "s"}.`
      : "";
  const registry = report.irGraph?.metadata?.registryVersion ?? "—";
  const faceLabel =
    report.faceId && report.faceId.trim().length > 0
      ? report.faceId.trim()
      : "unknown";
  const diffCommand = buildVizijIrDiffCommand(report.faceId);
  const timestamp = new Date().toISOString();

  return `### IR dual-run divergence report

            - Face: ${faceLabel}
            - Registry: ${registry}
            - Bindings captured: ${report.summary.bindings.length}
            - Fatal issues: ${report.issues.fatal.length}
            - Diff limit reached: ${diff.limitReached ? "yes" : "no"}

            #### Diff summary (${previewEntries.length}${remaining > 0 ? "+" : ""})
            ${diffSummary}${remainderLine}

            #### Suggested reproduction steps
            1. Export the current machine report (Graph Diagnostics ▸ Download machine report).
            2. Run \`${diffCommand}\`.
            3. Attach the exported IR JSON, baseline report, and diff output.

            #### Notes
            - Observed at ${timestamp}
            - Add expectations / extra context here.
            `;
}

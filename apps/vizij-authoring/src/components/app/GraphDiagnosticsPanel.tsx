import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  diffMachineReports,
  type MachineDiffEntry,
  type MachineDiffResult,
  type MachineReport,
} from "@vizij/node-graph-authoring";
import { downloadBlob } from "../../utils/download";
import { alertDialog } from "../../utils/dialogs";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { Button, Input, ListRow, Chip } from "../ui";
import "./graph-diagnostics.css";

const REVEAL_EVENT = "vizij-authoring:reveal-binding-target";

interface IssueEntry {
  targetId: string;
  label: string;
  issues: string[];
  isStandardInput: boolean;
  rootKey: string | null;
}

export function GraphDiagnosticsPanel() {
  const faceId = useGraphRuntime((state) => state.faceId);
  const graphInsights = useGraphRuntime((state) => state.graphInsights);
  const graphReport = useGraphRuntime((state) => state.graphMachineReport);
  const getGraphIr = useGraphRuntime((state) => state.getGraphIr);
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );

  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issueFilter, setIssueFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const entriesById = useMemo(
    () =>
      new Map(managedStandardInputs.map((entry) => [entry.input.id, entry])),
    [managedStandardInputs],
  );

  const issueEntries = useMemo<IssueEntry[]>(() => {
    if (!graphInsights) {
      return [];
    }
    const byTarget = graphInsights.issues?.byTarget ?? {};
    return Object.entries(byTarget)
      .map(([targetId, rawMessages]) => {
        const messages = rawMessages.filter(
          (message) => typeof message === "string" && message.trim().length > 0,
        );
        const entry = entriesById.get(targetId);
        const standardInput = entry?.input ?? null;
        return {
          targetId,
          label:
            standardInput?.path ??
            standardInput?.label ??
            entry?.input.label ??
            targetId,
          issues:
            messages.length > 0 ? messages : ["Unknown issue reported in IR"],
          isStandardInput: Boolean(standardInput),
          rootKey: entry?.metadata?.root ?? entry?.input.group ?? null,
        };
      })
      .sort((a, b) => {
        if (b.issues.length !== a.issues.length) {
          return b.issues.length - a.issues.length;
        }
        return a.label.localeCompare(b.label);
      });
  }, [entriesById, graphInsights]);

  const totalIssueCount = useMemo(
    () => issueEntries.reduce((sum, entry) => sum + entry.issues.length, 0),
    [issueEntries],
  );

  const filteredIssueEntries = useMemo(() => {
    const token = issueFilter.trim().toLowerCase();
    if (!token) {
      return issueEntries;
    }
    return issueEntries.filter((entry) => {
      if (entry.label.toLowerCase().includes(token)) {
        return true;
      }
      if (entry.targetId.toLowerCase().includes(token)) {
        return true;
      }
      return entry.issues.some((issue) => issue.toLowerCase().includes(token));
    });
  }, [issueEntries, issueFilter]);

  const issueToggleLabel = issuePanelOpen
    ? "Hide binding issues"
    : `Show binding issues (${issueEntries.length})`;

  useEffect(() => {
    if (!graphReport) {
      setInspectorOpen(false);
    }
  }, [graphReport]);

  useEffect(() => {
    if (issueEntries.length === 0) {
      setIssuePanelOpen(false);
      if (issueFilter) {
        setIssueFilter("");
      }
    }
  }, [issueEntries.length, issueFilter]);

  const handleDownloadIr = useCallback(() => {
    const graph = getGraphIr();
    if (!graph) {
      alertDialog("No IR graph is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const fileName = `${safeFaceId}_rig.ir.json`;
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, fileName);
  }, [faceId, getGraphIr]);

  const handleDownloadMachineReport = useCallback(() => {
    if (!graphReport) {
      alertDialog("No machine report is ready yet. Build the graph first.");
      return;
    }
    const safeFaceId =
      faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
    const blob = new Blob([JSON.stringify(graphReport, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `${safeFaceId}_machine-report.json`);
  }, [faceId, graphReport]);

  const handleRevealIssueTarget = useCallback((targetId: string) => {
    window.dispatchEvent(
      new CustomEvent(REVEAL_EVENT, { detail: { targetId } }),
    );
  }, []);

  return (
    <div className="graph-diagnostics">
      <div className="graph-diagnostics__actions graph-card">
        <Button variant="secondary" size="sm" onClick={handleDownloadIr}>
          Download IR graph
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownloadMachineReport}
          disabled={!graphReport}
        >
          Download machine report
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setInspectorOpen((previous) => !previous)}
          disabled={!graphReport}
          data-active={inspectorOpen ? "true" : undefined}
        >
          {inspectorOpen ? "Hide IR inspector" : "Open IR inspector"}
        </Button>
      </div>

      {issueEntries.length > 0 ? (
        <div className="graph-card graph-diagnostics__summary">
          <div>
            <strong>{totalIssueCount}</strong> issue
            {totalIssueCount === 1 ? "" : "s"} across {issueEntries.length}{" "}
            binding{issueEntries.length === 1 ? "" : "s"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIssuePanelOpen((previous) => !previous)}
            data-active={issuePanelOpen ? "true" : undefined}
          >
            {issueToggleLabel}
          </Button>
        </div>
      ) : (
        <p className="sidebar__hint">
          Build the rig to capture a machine report and populate diagnostics.
        </p>
      )}

      {issuePanelOpen && issueEntries.length > 0 ? (
        <IssueListPanel
          entries={filteredIssueEntries}
          totalTargets={issueEntries.length}
          totalIssues={totalIssueCount}
          filter={issueFilter}
          onFilterChange={setIssueFilter}
          onReveal={handleRevealIssueTarget}
        />
      ) : null}

      <IrInspectorDrawer
        open={inspectorOpen}
        report={graphReport}
        onClose={() => setInspectorOpen(false)}
        onDownloadIr={handleDownloadIr}
        onDownloadReport={handleDownloadMachineReport}
      />
    </div>
  );
}

interface IssueListPanelProps {
  entries: IssueEntry[];
  totalTargets: number;
  totalIssues: number;
  filter: string;
  onFilterChange: (value: string) => void;
  onReveal: (targetId: string) => void;
}

function IssueListPanel({
  entries,
  totalTargets,
  totalIssues,
  filter,
  onFilterChange,
  onReveal,
}: IssueListPanelProps) {
  const handleFilterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onFilterChange(event.target.value);
    },
    [onFilterChange],
  );

  return (
    <div className="graph-card">
      <div className="graph-diagnostics__filter">
        <label className="graph-diagnostics__filter-label">
          <span>Filter binding issues</span>
          <Input
            value={filter}
            onChange={handleFilterChange}
            placeholder="Search by id or message"
          />
        </label>
        <span className="graph-diagnostics__filter-summary">
          Showing {entries.length} of {totalTargets} targets ({totalIssues}{" "}
          issues)
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="graph-diagnostics__empty">
          No bindings match the current filter.
        </p>
      ) : (
        <div className="graph-diagnostics__issue-list">
          {entries.map((entry) => (
            <ListRow
              key={entry.targetId}
              title={entry.label}
              description={
                <span className="graph-diagnostics__code-group">
                  <code className="graph-diagnostics__code">
                    {entry.targetId}
                  </code>
                  {entry.rootKey ? (
                    <span className="graph-diagnostics__root">
                      · {entry.rootKey}
                    </span>
                  ) : null}
                </span>
              }
              meta={
                entry.isStandardInput ? (
                  <Chip tone="info">Standard</Chip>
                ) : (
                  <Chip tone="muted">Non-standard</Chip>
                )
              }
              actions={
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => onReveal(entry.targetId)}
                  disabled={!entry.isStandardInput}
                  title={
                    entry.isStandardInput
                      ? "Reveal this input card"
                      : "Issue targets a non-standard binding"
                  }
                >
                  Reveal
                </Button>
              }
            >
              <ul className="graph-diagnostics__issue-messages">
                {entry.issues.map((issue, index) => (
                  <li key={`${entry.targetId}-${index}`}>{issue}</li>
                ))}
              </ul>
            </ListRow>
          ))}
        </div>
      )}
    </div>
  );
}

interface IrInspectorDrawerProps {
  open: boolean;
  report: MachineReport | null;
  onClose(): void;
  onDownloadIr(): void;
  onDownloadReport(): void;
}

const IR_DIFF_LIMIT = 200;
const BUG_REPORT_DIFF_PREVIEW_LIMIT = 8;

function IrInspectorDrawer({
  open,
  report,
  onClose,
  onDownloadIr,
  onDownloadReport,
}: IrInspectorDrawerProps) {
  const [diffText, setDiffText] = useState("");
  const [diffResult, setDiffResult] = useState<MachineDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [cliFeedback, setCliFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [bugTemplateFeedback, setBugTemplateFeedback] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [graphJson, setGraphJson] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setCopyFeedback("idle");
      setCliFeedback("idle");
      setBugTemplateFeedback("idle");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  const bindingCount = report?.summary.bindings.length ?? 0;
  const fatalCount = report?.issues.fatal.length ?? 0;
  const issueTargetCount = report
    ? Object.keys(report.issues.byTarget ?? {}).length
    : 0;
  const nodeCount = report?.irGraph?.nodes.length ?? 0;
  const edgeCount = report?.irGraph?.edges.length ?? 0;
  const constantCount = report?.irGraph?.constants.length ?? 0;
  const registryVersion = report?.irGraph?.metadata?.registryVersion ?? "—";

  const bugReportTemplate = useMemo(() => {
    if (!report || !diffResult) {
      return null;
    }
    return buildBugReportTemplate(report, diffResult);
  }, [diffResult, report]);

  const handleCopyReport = useCallback(async () => {
    if (!report) {
      return;
    }
    const payload = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard?.writeText(payload);
      setCopyFeedback("copied");
      setTimeout(() => setCopyFeedback("idle"), 1500);
    } catch (error) {
      console.warn("[vizij-authoring] Failed to copy IR report", error);
      setCopyFeedback("error");
    }
  }, [report]);

  const handleCliCommand = useCallback(async () => {
    if (!report) {
      return;
    }
    try {
      const command = buildVizijIrDiffCommand(report.faceId);
      await navigator.clipboard?.writeText(command);
      setCliFeedback("copied");
      setTimeout(() => setCliFeedback("idle"), 1500);
    } catch (error) {
      console.warn("[vizij-authoring] Failed to copy CLI command", error);
      setCliFeedback("error");
      setTimeout(() => setCliFeedback("idle"), 1500);
    }
  }, [report]);

  const handleDiffCompare = useCallback(() => {
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
    } catch (error) {
      console.warn("[vizij-authoring] Failed to parse diff payload", error);
    }
    if (!target) {
      setDiffError("Pasted JSON did not look like a machine report.");
      return;
    }
    const diff = diffMachineReports(report, target, { limit: IR_DIFF_LIMIT });
    setDiffError(null);
    setDiffResult(diff);
  }, [diffText, report]);

  const handleDiffFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    file
      .text()
      .then((value) => {
        setDiffText(value);
      })
      .catch((error) => {
        console.warn("[vizij-authoring] Failed to load diff file", error);
        setDiffError("Unable to read the selected file.");
      });
  }, []);

  return (
    <div
      className="graph-diagnostics__drawer graph-card"
      data-open={open ? "true" : undefined}
      aria-hidden={!open}
    >
      <div className="graph-diagnostics__drawer-header">
        <div>
          <h3>IR inspector</h3>
          <p>
            Review machine report metadata, diff against saved snapshots, and
            generate bug report templates.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {!report ? (
        <p className="graph-diagnostics__empty">
          Build the rig to capture an IR snapshot before using the inspector.
        </p>
      ) : (
        <>
          <dl className="graph-diagnostics__grid">
            <div>
              <dt>Bindings</dt>
              <dd>{bindingCount}</dd>
            </div>
            <div>
              <dt>Fatal issues</dt>
              <dd>{fatalCount}</dd>
            </div>
            <div>
              <dt>Issue targets</dt>
              <dd>{issueTargetCount}</dd>
            </div>
            <div>
              <dt>Nodes</dt>
              <dd>{nodeCount}</dd>
            </div>
            <div>
              <dt>Edges</dt>
              <dd>{edgeCount}</dd>
            </div>
            <div>
              <dt>Constants</dt>
              <dd>{constantCount}</dd>
            </div>
            <div>
              <dt>Registry</dt>
              <dd>{registryVersion}</dd>
            </div>
          </dl>

          <div className="graph-diagnostics__drawer-actions">
            <Button variant="secondary" size="sm" onClick={onDownloadIr}>
              Download IR JSON
            </Button>
            <Button variant="secondary" size="sm" onClick={onDownloadReport}>
              Download machine report
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCopyReport}>
              {copyFeedback === "copied" ? "Copied!" : "Copy report JSON"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCliCommand}>
              {cliFeedback === "copied"
                ? "Command copied!"
                : "Copy diff CLI command"}
            </Button>
          </div>

          <div className="graph-diagnostics__section">
            <h4>Compare against saved machine report</h4>
            <p>
              Paste or upload a previous machine report JSON to diff it against
              the current snapshot. Limit {IR_DIFF_LIMIT} differences.
            </p>
            <textarea
              className="graph-diagnostics__textarea"
              placeholder="Paste saved machine report JSON..."
              value={diffText}
              onChange={(event) => setDiffText(event.target.value)}
            />
            <div className="graph-diagnostics__upload">
              <input
                type="file"
                accept="application/json"
                ref={fileInputRef}
                onChange={handleDiffFile}
              />
              <Button variant="secondary" size="sm" onClick={handleDiffCompare}>
                Compare reports
              </Button>
            </div>
            {diffError ? (
              <p className="graph-diagnostics__error">{diffError}</p>
            ) : (
              <DiffResultList
                entries={diffResult?.differences ?? []}
                limitReached={Boolean(diffResult?.limitReached)}
              />
            )}
          </div>

          <div className="graph-diagnostics__section">
            <h4>Saved IR payload</h4>
            {graphJson ? (
              <pre className="graph-diagnostics__pre" aria-live="polite">
                {graphJson}
              </pre>
            ) : (
              <p className="graph-diagnostics__empty">
                Build the graph to capture IR JSON for inspection.
              </p>
            )}
          </div>

          {bugReportTemplate ? (
            <div className="graph-diagnostics__section">
              <h4>Bug report template</h4>
              <p>
                Copy a filled template containing registry metadata and trimmed
                diff output.
              </p>
              <textarea
                className="graph-diagnostics__textarea"
                readOnly
                value={bugReportTemplate}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(bugReportTemplate);
                    setBugTemplateFeedback("copied");
                    setTimeout(() => setBugTemplateFeedback("idle"), 1500);
                  } catch (error) {
                    console.warn(
                      "[vizij-authoring] Failed to copy bug template",
                      error,
                    );
                    setBugTemplateFeedback("error");
                    setTimeout(() => setBugTemplateFeedback("idle"), 1500);
                  }
                }}
              >
                {bugTemplateFeedback === "copied"
                  ? "Template copied!"
                  : bugTemplateFeedback === "error"
                    ? "Copy failed"
                    : "Copy template"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

interface DiffResultListProps {
  entries: MachineDiffResult["differences"];
  limitReached: boolean;
}

function DiffResultList({ entries, limitReached }: DiffResultListProps) {
  if (!entries.length) {
    return <p className="graph-diagnostics__note">No differences detected.</p>;
  }
  return (
    <div className="graph-diagnostics__diff-results">
      <p>
        {entries.length} difference{entries.length === 1 ? "" : "s"}
        {limitReached ? " (diff limit reached)" : null}
      </p>
      <ul>
        {entries.map((entry, index) => (
          <li key={`${entry.path}-${index}`}>
            <code>{entry.path}</code> – {entry.kind}
            {entry.kind === "mismatch" && (
              <>
                : expected {formatDiffValue(entry.expected)}, actual{" "}
                {formatDiffValue(entry.actual)}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
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

function isMachineReportCandidate(value: unknown): value is MachineReport {
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

function buildVizijIrDiffCommand(faceId?: string | null): string {
  const safeFaceId =
    faceId && faceId.trim().length > 0 ? faceId.trim() : "vizij";
  return `vizij-ir-report --diff ${safeFaceId}_machine-report.json saved-report.json`;
}

function buildBugReportTemplate(
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

export type { IssueEntry };
export { REVEAL_EVENT };

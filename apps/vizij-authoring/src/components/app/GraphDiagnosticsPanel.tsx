import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  type MachineDiffResult,
  type MachineReport,
} from "@vizij/node-graph-authoring";
import { Download, Search } from "lucide-react";
import { downloadBlob } from "../../utils/download";
import { alertDialog } from "../../utils/dialogs";
import {
  buildVizijIrDiffCommand,
  useMachineReportDiff,
} from "../../hooks/useMachineReportDiff";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import {
  Button,
  Input,
  ListRow,
  Chip,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardDescription,
} from "../ui";
import { cn } from "../../utils/cn";

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
    <Card className="bg-bg-panel border border-border-default shadow-md">
      <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-border-default">
        <div className="space-y-1">
          <CardTitle className="text-sm font-bold text-text-primary">
            Graph Diagnostics
          </CardTitle>
          <CardDescription className="text-xs text-text-muted">
            Analyze compiled graph status and debug configuration issues.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadIr}
            title="Download IR Graph"
          >
            <Download className="h-4 w-4 text-text-muted" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setInspectorOpen((prev) => !prev)}
            disabled={!graphReport}
            title="Open Inspector"
            className={cn(inspectorOpen && "bg-accent-subtle text-accent")}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardBody className="pt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadMachineReport}
            disabled={!graphReport}
            className="flex-1"
          >
            Download Report
          </Button>
        </div>

        {issueEntries.length > 0 ? (
          <div className="flex items-center justify-between gap-4 p-4 bg-bg-secondary/40 border border-border-subtle rounded-xl">
            <div className="text-sm text-text-secondary">
              <strong className="text-accent">{totalIssueCount}</strong> issue
              {totalIssueCount === 1 ? "" : "s"} across {issueEntries.length}{" "}
              binding{issueEntries.length === 1 ? "" : "s"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIssuePanelOpen((previous) => !previous)}
              className={cn(
                "h-8 text-xs font-bold uppercase tracking-wider",
                issuePanelOpen && "text-accent",
              )}
            >
              {issueToggleLabel}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-text-muted italic px-4">
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
      </CardBody>

      <IrInspectorDrawer
        open={inspectorOpen}
        report={graphReport}
        onClose={() => setInspectorOpen(false)}
        onDownloadIr={handleDownloadIr}
        onDownloadReport={handleDownloadMachineReport}
      />
    </Card>
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
    <div className="bg-bg-secondary/40 border border-border-default rounded-xl p-5 flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
            Filter binding issues
          </span>
          <Input
            value={filter}
            onChange={handleFilterChange}
            placeholder="Search by id or message"
            className="h-9"
          />
        </div>
        <span className="text-[10px] font-bold text-text-muted mb-2">
          Showing {entries.length} of {totalTargets} targets ({totalIssues}{" "}
          issues)
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm italic bg-bg-secondary/20 rounded-lg border border-dashed border-border-default">
          No bindings match the current filter.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <ListRow
              key={entry.targetId}
              title={entry.label}
              description={
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <code className="text-[10px] bg-bg-panel/60 px-1.5 py-0.5 rounded border border-border-default text-accent font-mono">
                    {entry.targetId}
                  </code>
                  {entry.rootKey ? (
                    <span className="text-[10px] text-text-muted font-medium tracking-tight">
                      · {entry.rootKey}
                    </span>
                  ) : null}
                </div>
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
                  className="h-7 text-[10px] px-3 font-bold"
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
              <ul className="mt-2 space-y-1.5 list-none">
                {entry.issues.map((issue, index) => (
                  <li
                    key={`${entry.targetId}-${index}`}
                    className="text-[11px] text-text-secondary flex gap-2"
                  >
                    <span className="text-red-500 shrink-0 mt-0.5">●</span>
                    {issue}
                  </li>
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

function IrInspectorDrawer({
  open,
  report,
  onClose,
  onDownloadIr,
  onDownloadReport,
}: IrInspectorDrawerProps) {
  const {
    diffText,
    setDiffText,
    diffResult,
    diffError,
    graphJson,
    bugReportTemplate,
    compareReports,
    loadDiffTextFromFile,
  } = useMachineReportDiff({
    open,
    report,
    diffLimit: IR_DIFF_LIMIT,
  });
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [cliFeedback, setCliFeedback] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [bugTemplateFeedback, setBugTemplateFeedback] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
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
    compareReports();
  }, [compareReports]);

  const handleDiffFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];
      if (!file) {
        return;
      }
      void loadDiffTextFromFile(file);
    },
    [loadDiffTextFromFile],
  );

  return (
    <div
      className={cn(
        "bg-bg-panel shadow-2xl border-t border-border-default overflow-y-auto flex-col gap-6 p-6 transition-all duration-300",
        open ? "flex h-[80vh] opacity-100" : "h-0 opacity-0 overflow-hidden",
      )}
      aria-hidden={!open}
    >
      <div className="flex justify-between items-start">
        <div className="max-w-xl">
          <h3 className="text-lg font-bold text-text-primary tracking-tight">
            IR Inspector
          </h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed font-medium">
            Review machine report metadata, diff against saved snapshots, and
            generate bug report templates.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose} className="h-8">
          Close
        </Button>
      </div>

      {!report ? (
        <p className="text-center py-12 text-text-muted text-sm italic bg-bg-secondary/20 rounded-xl border border-dashed border-border-default">
          Build the rig to capture an IR snapshot before using the inspector.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <dl className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
            {[
              { label: "Bindings", value: bindingCount },
              { label: "Fatal Issues", value: fatalCount },
              { label: "Issue Targets", value: issueTargetCount },
              { label: "Nodes", value: nodeCount },
              { label: "Edges", value: edgeCount },
              { label: "Constants", value: constantCount },
              { label: "Registry", value: registryVersion },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <dt className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  {item.label}
                </dt>
                <dd className="text-sm font-bold text-text-primary">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onDownloadIr}
              className="h-8 text-[11px]"
            >
              Download IR JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onDownloadReport}
              className="h-8 text-[11px]"
            >
              Download machine report
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyReport}
              className="h-8 text-[11px]"
            >
              {copyFeedback === "copied" ? "Copied!" : "Copy report JSON"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCliCommand}
              className="h-8 text-[11px]"
            >
              {cliFeedback === "copied"
                ? "Command copied!"
                : "Copy diff CLI command"}
            </Button>
          </div>

          <div className="bg-bg-secondary/20 rounded-xl border border-border-default p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold text-text-primary">
                Compare against saved machine report
              </h4>
              <p className="text-[11px] text-text-muted">
                Paste or upload a previous machine report JSON to diff it
                against the current snapshot. Limit {IR_DIFF_LIMIT} differences.
              </p>
            </div>

            <textarea
              className="w-full h-32 bg-bg-input border border-border-default rounded-lg p-3 text-[12px] font-mono text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
              placeholder="Paste saved machine report JSON..."
              value={diffText}
              onChange={(event) => setDiffText(event.target.value)}
            />

            <div className="flex items-center gap-4 flex-wrap">
              <input
                type="file"
                accept="application/json"
                ref={fileInputRef}
                onChange={handleDiffFile}
                className="text-xs text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-bg-secondary file:text-text-primary hover:file:bg-bg-secondary-hover transition-all"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleDiffCompare}
                className="h-8 px-6"
              >
                Compare reports
              </Button>
            </div>

            {diffError ? (
              <p className="text-xs text-red-400 font-medium px-1 italic">
                {diffError}
              </p>
            ) : (
              <DiffResultList
                entries={diffResult?.differences ?? []}
                limitReached={Boolean(diffResult?.limitReached)}
              />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-text-primary px-1">
              Saved IR payload
            </h4>
            {graphJson ? (
              <pre className="bg-bg-secondary/60 border border-border-default rounded-xl p-4 max-h-80 overflow-auto text-[11px] font-mono text-text-secondary leading-relaxed scrollbar-thin scrollbar-thumb-border-default">
                {graphJson}
              </pre>
            ) : (
              <p className="text-center py-8 text-text-muted text-xs italic bg-bg-secondary/20 rounded-xl border border-dashed border-border-default">
                Build the graph to capture IR JSON for inspection.
              </p>
            )}
          </div>

          {bugReportTemplate ? (
            <div className="bg-accent-subtle border border-accent/10 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h4 className="text-xs font-bold text-accent">
                  Bug report template
                </h4>
                <p className="text-[11px] text-accent-subtle font-medium">
                  Copy a filled template containing registry metadata and
                  trimmed diff output.
                </p>
              </div>

              <textarea
                className="w-full h-32 bg-bg-input border border-accent/20 rounded-lg p-3 text-[11px] font-mono text-text-muted focus:outline-none"
                readOnly
                value={bugReportTemplate}
              />

              <Button
                variant="primary"
                size="sm"
                className="h-9 px-6 self-start bg-accent hover:bg-accent-hover"
                onClick={async () => {
                  if (!bugReportTemplate) return;
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
        </div>
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
    return (
      <p className="text-xs text-text-muted italic mt-2">
        No differences detected.
      </p>
    );
  }
  return (
    <div className="bg-bg-panel border border-border-default rounded-lg p-4 flex flex-col gap-3">
      <p className="text-[11px] font-bold text-text-muted">
        {entries.length} difference{entries.length === 1 ? "" : "s"}
        {limitReached ? " (diff limit reached)" : null}
      </p>
      <ul className="space-y-1.5 list-none">
        {entries.map((entry, index) => (
          <li
            key={`${entry.path}-${index}`}
            className="text-[11px] text-text-secondary flex gap-2 overflow-hidden"
          >
            <code className="text-accent shrink-0">{entry.path}</code>
            <span className="text-text-muted shrink-0">–</span>
            <span className="truncate">
              {entry.kind}
              {entry.kind === "mismatch" && (
                <>
                  : expected {formatDiffValue(entry.expected)}, actual{" "}
                  {formatDiffValue(entry.actual)}
                </>
              )}
            </span>
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

export type { IssueEntry };
export { REVEAL_EVENT };

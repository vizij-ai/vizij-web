import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { MachineReport } from "@vizij/node-graph-authoring";
import {
  buildVizijIrDiffCommand,
  useMachineReportDiff,
} from "../../../hooks/useMachineReportDiff";
import { Button } from "../../ui";
import { cn } from "../../../utils/cn";
import { DiffResultList } from "./DiffResultList";

interface IrInspectorDrawerProps {
  open: boolean;
  report: MachineReport | null;
  onClose(): void;
  onDownloadIr(): void;
  onDownloadReport(): void;
}

const IR_DIFF_LIMIT = 200;

export function IrInspectorDrawer({
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

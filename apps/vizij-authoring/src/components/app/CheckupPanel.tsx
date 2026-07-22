import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button, Chip, CollapsibleGroup } from "../ui";
import { cn } from "../../utils/cn";
import type {
  CheckupIssue,
  CheckupReport,
  CheckupSectionId,
  CheckupSectionStatus,
  CheckupSectionSummary,
} from "../../checkup/types";

interface CheckupPanelProps {
  report: CheckupReport;
  canRun: boolean;
  running: boolean;
  onRunAll: () => void;
  /** Optional drill-down into the detailed view for a section. */
  onOpenSection?: (sectionId: CheckupSectionId) => void;
}

const SEVERITY_ICONS = {
  error: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
  info: <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
} as const;

function statusChip(status: CheckupSectionStatus) {
  switch (status) {
    case "pass":
      return (
        <Chip tone="success">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Pass
        </Chip>
      );
    case "warnings":
      return (
        <Chip tone="warning">
          <AlertTriangle className="w-3 h-3 mr-1" /> Warnings
        </Chip>
      );
    case "errors":
      return (
        <Chip tone="danger">
          <XCircle className="w-3 h-3 mr-1" /> Errors
        </Chip>
      );
    case "running":
      return (
        <Chip tone="info">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
        </Chip>
      );
    case "not-run":
    default:
      return (
        <Chip tone="muted">
          <CircleDashed className="w-3 h-3 mr-1" /> Not run
        </Chip>
      );
  }
}

function overallBanner(report: CheckupReport) {
  if (report.overall === "running") {
    return {
      icon: <Loader2 className="w-5 h-5 animate-spin text-blue-400" />,
      text: "Checkup running…",
      className: "border-blue-500/30 bg-blue-500/5 text-blue-300",
    };
  }
  if (report.overall === "errors") {
    return {
      icon: <XCircle className="w-5 h-5 text-red-400" />,
      text: `Checkup found ${report.totalErrors} error${
        report.totalErrors === 1 ? "" : "s"
      } and ${report.totalWarnings} warning${
        report.totalWarnings === 1 ? "" : "s"
      }`,
      className: "border-red-500/30 bg-red-500/5 text-red-300",
    };
  }
  if (report.overall === "warnings") {
    return {
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      text: `Checkup found ${report.totalWarnings} warning${
        report.totalWarnings === 1 ? "" : "s"
      }`,
      className: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    };
  }
  return {
    icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
    text: "Checkup passed — no issues found",
    className: "border-green-500/30 bg-green-500/5 text-green-300",
  };
}

function IssueRow({ issue }: { issue: CheckupIssue }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2 rounded-md bg-bg-secondary/30 border border-border-default/60">
      <div className="flex items-start gap-2">
        {SEVERITY_ICONS[issue.severity]}
        <span className="text-[11px] leading-relaxed text-text-primary">
          {issue.message}
        </span>
      </div>
      {issue.details && issue.details.length > 0 ? (
        <ul className="pl-6 space-y-0.5">
          {issue.details.map((detail, index) => (
            <li
              key={`${issue.id}/detail/${index}`}
              className="text-[10px] font-mono text-text-muted leading-relaxed break-all"
            >
              {detail}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SectionGroup({
  section,
  onOpenSection,
}: {
  section: CheckupSectionSummary;
  onOpenSection?: (sectionId: CheckupSectionId) => void;
}) {
  return (
    <CollapsibleGroup
      title={section.label}
      defaultCollapsed={section.issues.length === 0}
      actions={
        <div className="flex items-center gap-1.5">
          {statusChip(section.status)}
          {onOpenSection ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(event) => {
                event.stopPropagation();
                onOpenSection(section.id);
              }}
              title={`Open the detailed ${section.label} view`}
              aria-label={`Open the detailed ${section.label} view`}
            >
              <ArrowRight className="w-3 h-3" />
            </Button>
          ) : null}
        </div>
      }
    >
      {section.issues.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-text-secondary">
          {section.status === "not-run"
            ? "This check has not been run yet."
            : section.status === "running"
              ? "Running…"
              : "No issues."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 p-2">
          {section.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </ul>
      )}
    </CollapsibleGroup>
  );
}

/**
 * The unified Checkup: one severity-rolled summary of every validation
 * surface (rig graph, bundle graphs, robot data, poses, import review), with
 * a single Run action and drill-down links into the detailed views.
 */
export function CheckupPanel({
  report,
  canRun,
  running,
  onRunAll,
  onOpenSection,
}: CheckupPanelProps) {
  const banner = overallBanner(report);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3 rounded-xl border",
          banner.className,
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {banner.icon}
          <span className="text-xs font-semibold leading-snug">
            {banner.text}
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onRunAll}
          disabled={!canRun || running}
          className="h-8 shrink-0 font-bold"
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Running…
            </>
          ) : (
            "Run Checkup"
          )}
        </Button>
      </div>
      <div className="flex flex-col">
        {report.sections.map((section) => (
          <SectionGroup
            key={section.id}
            section={section}
            onOpenSection={onOpenSection}
          />
        ))}
      </div>
    </div>
  );
}

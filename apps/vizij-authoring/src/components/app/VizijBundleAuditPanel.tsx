import type { BundleGraphAuditEntry } from "../../utils/bundleAudit";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  Chip,
} from "../ui";

interface VizijBundleAuditPanelProps {
  audits: readonly BundleGraphAuditEntry[] | null;
  status: "idle" | "running" | "error";
  error: string | null;
  onRefresh: () => void;
  onOverwrite: (graphId: string) => void;
  onRenameOutput: (
    graphId: string,
    nodeId: string,
    currentPath: string | null,
  ) => void;
}

function statusLabel(entry: BundleGraphAuditEntry): string {
  switch (entry.status) {
    case "match":
      return "Aligned";
    case "diff":
      return `${entry.diffCount} diff${entry.diffCount === 1 ? "" : "s"}`;
    case "missing-ir":
      return "No IR";
    case "error":
    default:
      return "Error";
  }
}

export function VizijBundleAuditPanel({
  audits,
  status,
  error,
  onRefresh,
  onOverwrite,
  onRenameOutput,
}: VizijBundleAuditPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vizij Bundle Graphs</CardTitle>
        <CardDescription>
          Recompile bundled IR graphs and compare them to the saved specs before
          exporting a GLB.
        </CardDescription>
      </CardHeader>
      <CardBody compact className="bundle-audit">
        <div className="bundle-audit__toolbar">
          <span className="bundle-audit__status">
            {status === "running" && "Auditing graphs…"}
            {status === "error" && (error ?? "Audit failed")}
            {status === "idle" &&
              (audits?.length ? "Audit complete" : "No graphs found")}
          </span>
          <Button
            variant="subtle"
            onClick={onRefresh}
            disabled={status === "running"}
          >
            Refresh
          </Button>
        </div>

        {audits && audits.length > 0 ? (
          <ul className="bundle-audit__list">
            {audits.map((entry) => (
              <li
                key={entry.id}
                className={`bundle-audit__item bundle-audit__item--${entry.status}`}
              >
                <div>
                  <p className="bundle-audit__item-title">
                    {entry.label ?? entry.id}
                    <span className="bundle-audit__item-kind">
                      {entry.kind}
                    </span>
                  </p>
                  <p className="bundle-audit__item-meta">
                    Face: {entry.faceId ?? "Unknown"}
                  </p>
                  {entry.status === "diff" && entry.diff && (
                    <p className="bundle-audit__item-meta">
                      Showing first {entry.diffCount}
                      {entry.diffLimitReached ? "+" : ""} differences
                    </p>
                  )}
                  {entry.status === "error" && entry.error && (
                    <p className="bundle-audit__item-error">{entry.error}</p>
                  )}
                  {entry.status === "diff" && entry.issues.length > 0 && (
                    <ul className="bundle-audit__issues">
                      {entry.issues.map((issue, index) => (
                        <li key={`${entry.id}-issue-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {entry.status === "diff" &&
                    entry.diff &&
                    entry.diff.entries.length > 0 && (
                      <div className="bundle-audit__diff-preview">
                        <strong>Differences</strong>
                        <ul>
                          {entry.diff.entries.slice(0, 5).map((diffEntry) => (
                            <li key={diffEntry.id}>
                              <span
                                className={`bundle-audit__diff-kind bundle-audit__diff-kind--${diffEntry.kind}`}
                              >
                                {diffEntry.kind}
                              </span>
                              <code>{diffEntry.path}</code>
                            </li>
                          ))}
                        </ul>
                        {entry.diff.entries.length > 5 ? (
                          <p className="bundle-audit__hint">
                            …{entry.diff.entries.length - 5} more differences
                            (overwrite to reconcile).
                          </p>
                        ) : null}
                      </div>
                    )}
                  {entry.outputs && entry.outputs.length > 0 && (
                    <div className="bundle-audit__outputs">
                      <strong>Graph outputs</strong>
                      <ul>
                        {entry.outputs.map((output) => (
                          <li
                            key={`${entry.id}-${output.nodeId}`}
                            className={
                              output.status === "missing-target"
                                ? "bundle-audit__output-missing"
                                : undefined
                            }
                          >
                            {output.path ?? "(missing path)"}
                            {output.status === "missing-target" && (
                              <Button
                                variant="subtle"
                                onClick={() =>
                                  onRenameOutput(
                                    entry.id,
                                    output.nodeId,
                                    output.path ?? null,
                                  )
                                }
                              >
                                Rename
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="bundle-audit__item-actions">
                  <Chip
                    tone={
                      entry.status === "error"
                        ? "danger"
                        : entry.status === "diff"
                          ? "warning"
                          : "info"
                    }
                  >
                    {statusLabel(entry)}
                  </Chip>
                  {entry.status === "diff" && entry.compiledSpec ? (
                    <Button onClick={() => onOverwrite(entry.id)}>
                      Overwrite with IR
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bundle-audit__empty">
            Load a Vizij GLB with graphs to audit.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

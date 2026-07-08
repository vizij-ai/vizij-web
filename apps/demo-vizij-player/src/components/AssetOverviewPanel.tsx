import type { VizijRuntimeStatus } from "@vizij/runtime-react";
import type { DemoBundleSummary } from "../lib/bundleSummary";

type AssetOverviewPanelProps = {
  sourceLabel: string;
  sourceMeta: string;
  summary: DemoBundleSummary;
  status: Pick<
    VizijRuntimeStatus,
    "loading" | "ready" | "error" | "controllers"
  >;
};

function RuntimeStateChip({
  status,
}: {
  status: Pick<VizijRuntimeStatus, "loading" | "ready" | "error">;
}) {
  const label = status.error
    ? "Error"
    : status.loading
      ? "Loading"
      : status.ready
        ? "Ready"
        : "Idle";
  return (
    <span className={`runtime-chip runtime-chip-${label.toLowerCase()}`}>
      {label}
    </span>
  );
}

function summarizeLabels(labels: string[], emptyLabel: string) {
  if (labels.length === 0) {
    return emptyLabel;
  }
  if (labels.length <= 3) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

type OverviewRow = {
  label: string;
  count: number | string;
  coverage: string;
  detail: string;
};

export function AssetOverviewPanel({
  sourceLabel,
  sourceMeta,
  summary,
  status,
}: AssetOverviewPanelProps) {
  const rows: OverviewRow[] = [
    {
      label: "Rig stack",
      count: summary.rigCount,
      coverage:
        summary.graphKinds.length > 0
          ? summary.graphKinds.join(", ")
          : "No bundle graphs",
      detail:
        summary.graphIds.length > 0
          ? summarizeLabels(summary.graphIds, "No graph ids")
          : (summary.faceId ?? "No face id declared"),
    },
    {
      label: "Pose system",
      count: summary.poseCount,
      coverage:
        summary.poseGroupCount > 0
          ? `${summary.poseGroupCount} groups`
          : summary.poseCount > 0
            ? "Ungrouped poses"
            : "No pose system",
      detail: summarizeLabels(summary.poseGroupLabels, "Direct controls only"),
    },
    {
      label: "Clip layer",
      count: summary.animationCount,
      coverage:
        summary.animationCount > 0
          ? "Embedded timeline clips"
          : "No embedded clips",
      detail: summarizeLabels(summary.animationLabels, "No clip labels"),
    },
    {
      label: "Procedural layer",
      count: summary.programCount,
      coverage:
        summary.programCount > 0
          ? "Bundled motiongraph programs"
          : "No bundled programs",
      detail: summarizeLabels(summary.programLabels, "No procedural labels"),
    },
    {
      label: "Direct inputs",
      count: summary.controlInputCount,
      coverage:
        summary.controlInputCount > 0
          ? "Manual rig channels surfaced"
          : "No direct input metadata",
      detail:
        summary.metadataKeys.length > 0
          ? `${summary.metadataKeys.length} metadata keys`
          : "No bundle metadata keys",
    },
    {
      label: "Runtime surfacing",
      count: `${status.controllers.graphs.length}/${status.controllers.anims.length}`,
      coverage: "Graphs / animations listed",
      detail:
        status.controllers.graphs.length > 0 ||
        status.controllers.anims.length > 0
          ? "Controller ids are available in diagnostics."
          : "No controller ids surfaced yet.",
    },
  ];

  return (
    <section className="panel" aria-labelledby="asset-overview-title">
      <header className="panel-header panel-header-stack">
        <div>
          <p className="eyebrow">Selected bundle</p>
          <h2 id="asset-overview-title">{sourceLabel}</h2>
        </div>
        <RuntimeStateChip status={status} />
      </header>
      <div className="panel-body overview-body">
        <div className="overview-meta-row">
          <p className="overview-copy">{sourceMeta}</p>
          <div className="overview-meta-badges">
            <span className="soft-badge">
              Face {summary.faceId ?? "Undeclared"}
            </span>
            <span className="soft-badge">{summary.graphCount} graphs</span>
            <span className="soft-badge">
              {summary.metadataKeys.length} metadata
            </span>
          </div>
        </div>
        <div className="overview-table-shell">
          <table className="overview-table">
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Count</th>
                <th scope="col">Coverage</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.count}</td>
                  <td>{row.coverage}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overview-detail">
          <strong>Key concepts</strong>
          <div className="badge-row">
            {summary.graphKinds.length > 0 ? (
              summary.graphKinds.map((kind) => (
                <span key={kind} className="soft-badge">
                  {kind}
                </span>
              ))
            ) : (
              <span className="soft-badge is-muted">No bundle graphs</span>
            )}
            {summary.capabilities.poses ? (
              <span className="soft-badge">Pose-driven states</span>
            ) : null}
            {summary.capabilities.animations ? (
              <span className="soft-badge">Timeline clips</span>
            ) : null}
            {summary.capabilities.programs ? (
              <span className="soft-badge">Procedural motion</span>
            ) : null}
            {summary.controlInputCount > 0 ? (
              <span className="soft-badge">
                {summary.controlInputCount} direct inputs
              </span>
            ) : null}
          </div>
        </div>
        <div className="overview-detail">
          <strong>Surfaced controller ids</strong>
          <p>
            {status.controllers.graphs.length} graphs listed,{" "}
            {status.controllers.anims.length} animations listed.
          </p>
        </div>
      </div>
    </section>
  );
}

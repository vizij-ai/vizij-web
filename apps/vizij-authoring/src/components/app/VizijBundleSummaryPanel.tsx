export interface VizijBundleSummary {
  present: boolean;
  version?: number;
  exportedAt?: string | null;
  graphCount: number;
  poseCount: number;
  animationCount: number;
  metadataKeys: string[];
}

interface VizijBundleSummaryPanelProps {
  summary: VizijBundleSummary;
}

export function VizijBundleSummaryPanel({
  summary,
}: VizijBundleSummaryPanelProps) {
  return (
    <article className="asset-card">
      <header className="asset-card__header">
        <h2 className="asset-card__title">Imported Vizij Bundle</h2>
        <p className="asset-card__description">
          Snapshot of bundle metadata found in the loaded GLB (if any). These
          assets feed the rig and pose authoring views automatically.
        </p>
      </header>

      <div className="asset-card__body asset-card__body--compact">
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.35rem 0.8rem",
            fontSize: "0.78rem",
            color: "#cbd5f5",
          }}
        >
          <dt>Status</dt>
          <dd>{summary.present ? "Detected" : "Not present"}</dd>
          <dt>Version</dt>
          <dd>{summary.version ?? "–"}</dd>
          <dt>Exported</dt>
          <dd>{summary.exportedAt ?? "unknown"}</dd>
          <dt>Rig graphs</dt>
          <dd>{summary.graphCount}</dd>
          <dt>Pose definitions</dt>
          <dd>{summary.poseCount}</dd>
          <dt>Vizij clips</dt>
          <dd>{summary.animationCount}</dd>
        </dl>

        {summary.metadataKeys.length > 0 ? (
          <p className="asset-card__hint">
            Metadata keys: {summary.metadataKeys.slice(0, 4).join(", ")}
            {summary.metadataKeys.length > 4 ? "…" : ""}
          </p>
        ) : (
          <p className="asset-card__hint">
            No additional bundle metadata detected.
          </p>
        )}
      </div>
    </article>
  );
}

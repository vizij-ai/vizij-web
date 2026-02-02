import { Card, CardHeader, CardBody, CardTitle, CardDescription } from "../ui";

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
    <Card className="bg-slate-900 border border-slate-800 shadow-md">
      <CardHeader className="pb-3 border-b border-slate-800">
        <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2">
          Imported Vizij Bundle
          {summary.present && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wide">
              Active
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Snapshot of bundle metadata found in the loaded GLB (if any). These
          assets feed the rig and pose authoring views automatically.
        </CardDescription>
      </CardHeader>

      <CardBody className="pt-4 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-slate-500 font-medium">Status</dt>
          <dd className="text-slate-200 font-mono">
            {summary.present ? (
              <span className="text-green-400">Detected</span>
            ) : (
              <span className="text-slate-600 italic">Not present</span>
            )}
          </dd>

          <dt className="text-slate-500 font-medium">Version</dt>
          <dd className="text-slate-200 font-mono">{summary.version ?? "–"}</dd>

          <dt className="text-slate-500 font-medium">Exported</dt>
          <dd
            className="text-slate-200 font-mono truncate"
            title={summary.exportedAt ?? ""}
          >
            {summary.exportedAt ?? "unknown"}
          </dd>

          <dt className="text-slate-500 font-medium">Rig graphs</dt>
          <dd className="text-slate-200 font-mono">{summary.graphCount}</dd>

          <dt className="text-slate-500 font-medium">Pose definitions</dt>
          <dd className="text-slate-200 font-mono">{summary.poseCount}</dd>

          <dt className="text-slate-500 font-medium">Vizij clips</dt>
          <dd className="text-slate-200 font-mono">{summary.animationCount}</dd>
        </dl>

        {summary.metadataKeys.length > 0 ? (
          <div className="pt-3 border-t border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Metadata Keys
            </span>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {summary.metadataKeys.slice(0, 4).join(", ")}
              {summary.metadataKeys.length > 4 ? "…" : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-600 italic border-t border-slate-800 pt-3">
            No additional bundle metadata detected.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

import { ChangeEvent } from "react";
import type { GraphGenerationSummary } from "../rigging/types";

interface GraphSummaryPanelProps {
  summary: GraphGenerationSummary | null;
  faceId: string | null;
  configIssues: string[];
  onExportConfig: () => void;
  onExportGraph: () => void;
  onImportConfig: (file: File) => void;
  graphLoaded: boolean;
  graphError: string | null;
}

export function GraphSummaryPanel({
  summary,
  faceId,
  configIssues,
  onExportConfig,
  onExportGraph,
  onImportConfig,
  graphLoaded,
  graphError,
}: GraphSummaryPanelProps) {
  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }
    onImportConfig(event.target.files[0]);
    event.target.value = "";
  };

  return (
    <div className="panel graph-summary-panel">
      <div className="panel-header">
        <h2>Graph & Persistence</h2>
        <div className="graph-actions">
          <button type="button" className="button" onClick={onExportGraph}>
            Export graph (.json)
          </button>
          <button type="button" className="button" onClick={onExportConfig}>
            Export rig config
          </button>
          <label className="button">
            Import rig config
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImport}
              hidden
            />
          </label>
        </div>
      </div>
      <div className="panel-body graph-summary-body">
        <div className="graph-summary-section">
          <h3>Low-level graph runtime</h3>
          <p>
            {graphError
              ? `Error loading graph: ${graphError}`
              : graphLoaded
                ? `Graph loaded for face ${faceId ?? "unknown"}. Blend authoring reflects the live wasm execution.`
                : "Load the low-level graph spec exported by demo-vizij-render."}
          </p>
        </div>

        {summary ? (
          <div className="graph-summary-section">
            <h3>Emotion graph overview</h3>
            <ul className="graph-summary-list">
              {summary.inputs.map((input) => (
                <li key={input.id}>
                  <div className="graph-summary-input">
                    <span className="graph-summary-label">{input.path}</span>
                    <span className="graph-summary-neutral">
                      Neutral {input.neutral.toFixed(3)}
                    </span>
                  </div>
                  {input.contributions.length ? (
                    <ul className="graph-contribution-list">
                      {input.contributions.map((contribution) => (
                        <li key={`${input.id}-${contribution.emotionId}`}>
                          <span className="graph-contribution-name">
                            {contribution.emotionName}
                          </span>
                          <span className="graph-contribution-delta">
                            Δ {contribution.delta.toFixed(3)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="graph-contribution-empty">
                      No emotion overrides.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {configIssues.length > 0 ? (
          <div className="alert alert-warning">
            <h3>Validation</h3>
            <ul>
              {configIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

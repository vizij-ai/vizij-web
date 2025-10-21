import { ChangeEvent } from "react";
import type { GraphGenerationSummary } from "../rigging/types";

interface GraphSummaryPanelProps {
  summary: GraphGenerationSummary | null;
  faceId: string | null;
  configIssues: string[];
  onExportConfig: () => void;
  onExportGraph: () => void;
  onLogEmotionPoses: () => void;
  onCaptureNeutral: () => void;
  onApplyNeutral: () => void;
  onApplyPose: (poseId: string) => void;
  poseLibrary: {
    neutral: Record<string, number>;
    poses: Array<{ id: string; name: string }>;
  };
  rigName: string;
  onRigNameChange: (name: string) => void;
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
  onLogEmotionPoses,
  onCaptureNeutral,
  onApplyNeutral,
  onApplyPose,
  poseLibrary,
  rigName,
  onRigNameChange,
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
          <button
            type="button"
            className="button"
            onClick={onExportGraph}
            disabled={!summary}
          >
            Export graph (.json)
          </button>
          <button type="button" className="button" onClick={onLogEmotionPoses}>
            Log pose values
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
          <label className="field-label" htmlFor="rig-name">
            Rig name
          </label>
          <input
            id="rig-name"
            className="input"
            value={rigName}
            onChange={(event) => onRigNameChange(event.target.value)}
            placeholder="Rig identifier"
          />
        </div>

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

        <div className="graph-summary-section">
          <h3>Pose Library</h3>
          <p className="graph-summary-neutral">
            Neutral channels: {Object.keys(poseLibrary.neutral).length}
          </p>
          <div className="pose-actions">
            <button type="button" className="button" onClick={onApplyNeutral}>
              Apply neutral
            </button>
            <button type="button" className="button" onClick={onCaptureNeutral}>
              Capture neutral
            </button>
          </div>
          {poseLibrary.poses.length ? (
            <ul className="graph-summary-list">
              {poseLibrary.poses.map((pose) => (
                <li key={pose.id}>
                  <div className="graph-summary-input">
                    <span className="graph-summary-label">{pose.name}</span>
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() => onApplyPose(pose.id)}
                    >
                      Apply pose
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="graph-contribution-empty">
              No poses captured yet. Capture poses from the editor to populate
              this list.
            </p>
          )}
        </div>

        {summary ? (
          <div className="graph-summary-section">
            <h3>Channel overview</h3>
            {summary.inputs.length ? (
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
                              Value {contribution.value.toFixed(3)} (Δ{" "}
                              {contribution.delta.toFixed(3)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="graph-contribution-empty">
                        No pose overrides.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="graph-contribution-empty">
                All channels match the neutral pose.
              </p>
            )}
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

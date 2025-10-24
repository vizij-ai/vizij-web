import { useCallback, useMemo } from "react";
import {
  useOrchFrame,
  useOrchestrator,
  type GraphRegistrationConfig,
} from "@vizij/orchestrator-react";

import type {
  MergeWarnings,
  RigDefinition,
} from "../orchestrator/useOrchestratorMerging";

type DiagnosticsPanelProps = {
  rigDefinitions: RigDefinition[];
  mergedGraphSummary: { mergedId: string | null; graphIds: string[] };
  uiInputPaths: string[];
  animationInputPaths: string[];
  warnings: MergeWarnings;
  graphConfigs: GraphRegistrationConfig[];
  renderOutputPaths: string[];
};

type TimingEntry = { key: string; label: string; value: number };

function formatTimingKey(key: string): string {
  const cleaned = key.replace(/_?ms$/i, "").replace(/_/g, " ").trim();
  if (!cleaned) {
    return key;
  }
  return cleaned
    .split(" ")
    .map((part) =>
      part ? part[0]!.toUpperCase() + part.slice(1).toLowerCase() : "",
    )
    .join(" ");
}

function formatPathLabel(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) {
    return path;
  }
  return segments
    .map((segment) =>
      segment
        .replace(/[_-]/g, " ")
        .split(" ")
        .map((word) =>
          word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : "",
        )
        .join(" "),
    )
    .join(" › ");
}

export function DiagnosticsPanel({
  rigDefinitions,
  mergedGraphSummary,
  uiInputPaths,
  animationInputPaths,
  warnings,
  graphConfigs,
  renderOutputPaths,
}: DiagnosticsPanelProps) {
  const frame = useOrchFrame();
  const { listControllers } = useOrchestrator();

  const controllers = useMemo(() => {
    try {
      return listControllers?.() ?? { graphs: [], anims: [] };
    } catch (err) {
      console.warn("demo-animating-faces: listControllers failed", err);
      return { graphs: [], anims: [] };
    }
  }, [listControllers]);

  const mergedWrites = frame?.merged_writes ?? [];
  const sortedMergedWrites = useMemo(
    () => mergedWrites.slice().sort((a, b) => a.path.localeCompare(b.path)),
    [mergedWrites],
  );
  const timingEntries = useMemo<TimingEntry[]>(() => {
    if (!frame?.timings_ms) {
      return [];
    }
    return Object.entries(frame.timings_ms)
      .filter(
        ([, value]) => typeof value === "number" && Number.isFinite(value),
      )
      .map(([key, value]) => ({
        key,
        label: formatTimingKey(key),
        value,
      }))
      .sort((a, b) => {
        if (a.key === "total_ms") {
          return -1;
        }
        if (b.key === "total_ms") {
          return 1;
        }
        return a.label.localeCompare(b.label);
      });
  }, [frame]);
  const renderOutputs = useMemo(
    () =>
      renderOutputPaths
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((path) => ({
          path,
          label: formatPathLabel(path),
          debugPath: `debug/${path}`,
        })),
    [renderOutputPaths],
  );
  const uiPreview = useMemo(() => {
    const sorted = uiInputPaths.slice().sort((a, b) => a.localeCompare(b));
    const items = sorted.slice(0, 8);
    const remaining = sorted.length - items.length;
    return { items, remaining };
  }, [uiInputPaths]);
  const animationPreview = useMemo(() => {
    const sorted = animationInputPaths
      .slice()
      .sort((a, b) => a.localeCompare(b));
    const items = sorted.slice(0, 8);
    const remaining = sorted.length - items.length;
    return { items, remaining };
  }, [animationInputPaths]);
  const hasWarnings =
    warnings.namespaceViolations.length > 0 ||
    warnings.outputCollisions.length > 0 ||
    warnings.missingUiInputs.length > 0;

  const handleExportMergedSpec = useCallback(() => {
    if (!graphConfigs.length) {
      return;
    }
    const payload = JSON.stringify(graphConfigs, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "merged-graph-spec.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [graphConfigs]);

  return (
    <section
      className="panel diagnostics-panel"
      aria-labelledby="diagnostics-panel-title"
    >
      <header className="panel-header">
        <h2 id="diagnostics-panel-title">Diagnostics</h2>
        <button
          type="button"
          className="ghost"
          onClick={handleExportMergedSpec}
          disabled={!graphConfigs.length}
        >
          Export Merged Spec
        </button>
      </header>
      <div className="panel-body diagnostics-body">
        <div className="diag-block diag-block-timing">
          <div className="diag-block-header">
            <h3>Frame Timings</h3>
            {frame ? (
              <span className="diag-meta">
                epoch {frame.epoch} • dt {frame.dt.toFixed(3)}s
              </span>
            ) : null}
          </div>
          {timingEntries.length ? (
            <dl className="timing-grid">
              {timingEntries.map((entry) => (
                <div key={entry.key} className="timing-item">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value.toFixed(3)} ms</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="diag-empty">Waiting for frame…</p>
          )}
        </div>

        <div className="diag-block">
          <h3>Controllers &amp; Rigs</h3>
          <table className="diag-table">
            <tbody>
              <tr>
                <th scope="row">Controllers</th>
                <td>
                  <div>
                    Graphs: <strong>{controllers.graphs.length}</strong> •
                    Animations: <strong>{controllers.anims.length}</strong>
                  </div>
                  <div className="diag-meta">
                    Merged graph: {mergedGraphSummary.mergedId ?? "—"} (
                    {mergedGraphSummary.graphIds.length} configs)
                  </div>
                  {mergedGraphSummary.graphIds.length ? (
                    <details>
                      <summary>
                        Composed controllers (
                        {mergedGraphSummary.graphIds.length})
                      </summary>
                      <ul>
                        {mergedGraphSummary.graphIds.map((id) => (
                          <li key={id}>
                            <code>{id}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">Rig definitions</th>
                <td>
                  {rigDefinitions.length ? (
                    <ul className="diag-list">
                      {rigDefinitions.map((rig) => (
                        <li key={rig.id}>
                          <strong>{rig.label}</strong>
                          <span className="diag-meta">
                            {rig.inputs.length} staged inputs
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="diag-empty">
                      Load high-level rigs to inspect staged channels.
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Subscriptions</th>
                <td>
                  <div>
                    UI inputs: <strong>{uiInputPaths.length}</strong> •
                    Animation inputs:{" "}
                    <strong>{animationInputPaths.length}</strong>
                  </div>
                  {uiInputPaths.length ? (
                    <details>
                      <summary>UI Channels ({uiInputPaths.length})</summary>
                      <ul>
                        {uiPreview.items.map((path) => (
                          <li key={path}>
                            <code>{path}</code>
                          </li>
                        ))}
                        {uiPreview.remaining > 0 ? (
                          <li className="diag-note">
                            … {uiPreview.remaining} more
                          </li>
                        ) : null}
                      </ul>
                    </details>
                  ) : null}
                  {animationInputPaths.length ? (
                    <details>
                      <summary>
                        Animation Channels ({animationInputPaths.length})
                      </summary>
                      <ul>
                        {animationPreview.items.map((path) => (
                          <li key={path}>
                            <code>{path}</code>
                          </li>
                        ))}
                        {animationPreview.remaining > 0 ? (
                          <li className="diag-note">
                            … {animationPreview.remaining} more
                          </li>
                        ) : null}
                      </ul>
                    </details>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="diag-block">
          <h3>Warnings &amp; Outputs</h3>
          <table className="diag-table">
            <tbody>
              <tr>
                <th scope="row">Render outputs</th>
                <td>
                  {renderOutputs.length === 0 ? (
                    <span className="diag-empty">
                      Load a low-level rig to inspect render outputs.
                    </span>
                  ) : (
                    <details open>
                      <summary>{renderOutputs.length} channels</summary>
                      <ul className="diag-list">
                        {renderOutputs.slice(0, 12).map((entry) => (
                          <li key={entry.path}>
                            <strong>{entry.label}</strong>
                            <span className="diag-meta">
                              <code>{entry.path}</code>
                              {entry.debugPath !== entry.path ? (
                                <>
                                  {" "}
                                  · <code>{entry.debugPath}</code>
                                </>
                              ) : null}
                            </span>
                          </li>
                        ))}
                        {renderOutputs.length > 12 ? (
                          <li className="diag-note">
                            … {renderOutputs.length - 12} more
                          </li>
                        ) : null}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Warnings</th>
                <td>
                  {hasWarnings ? (
                    <div className="diag-warning-groups">
                      {warnings.namespaceViolations.length ? (
                        <details open>
                          <summary>
                            Namespace violations (
                            {warnings.namespaceViolations.length})
                          </summary>
                          <ul>
                            {warnings.namespaceViolations.map((warning) => (
                              <li key={`${warning.rigId}-${warning.path}`}>
                                <strong>{warning.rigLabel}</strong> →{" "}
                                <code>{warning.path}</code>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {warnings.outputCollisions.length ? (
                        <details open>
                          <summary>
                            Output collisions (
                            {warnings.outputCollisions.length})
                          </summary>
                          <ul>
                            {warnings.outputCollisions.map((collision) => (
                              <li key={collision.path}>
                                <code>{collision.path}</code> —{" "}
                                {collision.sources
                                  .map((source) => source.rigLabel)
                                  .join(", ")}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {warnings.missingUiInputs.length ? (
                        <details open>
                          <summary>
                            Unstaged UI inputs (
                            {warnings.missingUiInputs.length})
                          </summary>
                          <ul>
                            {warnings.missingUiInputs
                              .slice(0, 12)
                              .map((path) => (
                                <li key={path}>
                                  <code>{path}</code>
                                </li>
                              ))}
                            {warnings.missingUiInputs.length > 12 ? (
                              <li className="diag-note">
                                … {warnings.missingUiInputs.length - 12} more
                              </li>
                            ) : null}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : (
                    <span className="diag-empty">No issues detected.</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="diag-block">
          <h3>Merged Writes</h3>
          {sortedMergedWrites.length === 0 ? (
            <p className="diag-empty">No merged writes produced yet.</p>
          ) : (
            <ul className="diag-list diag-list-compact">
              {sortedMergedWrites.map((write, index) => (
                <li key={`${write.path}-${index}`}>
                  <code>{write.path}</code>: {JSON.stringify(write.value)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

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
  const timings = frame?.timings_ms;
  const renderDebugPrefixes = useMemo(
    () =>
      renderOutputPaths.map((path) => ({
        source: path,
        debug: `debug/${path}`,
      })),
    [renderOutputPaths],
  );

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
        <div className="diag-section">
          <h3>Controllers</h3>
          <p>
            Graphs: {controllers.graphs.length} • Animations:{" "}
            {controllers.anims.length}
          </p>
          <p>
            Merged Graph: {mergedGraphSummary.mergedId ?? "—"} (
            {mergedGraphSummary.graphIds.length} configs)
          </p>
        </div>
        <div className="diag-section">
          <h3>Rig Definitions</h3>
          <ul>
            {rigDefinitions.map((rig) => (
              <li key={rig.id}>
                {rig.label} — {rig.inputs.length} inputs
              </li>
            ))}
          </ul>
        </div>
        <div className="diag-section">
          <h3>Subscriptions</h3>
          <p>
            UI inputs: {uiInputPaths.length} • Animation inputs:{" "}
            {animationInputPaths.length}
          </p>
          {uiInputPaths.length ? (
            <details>
              <summary>UI Channels</summary>
              <ul>
                {uiInputPaths.slice(0, 6).map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
                {uiInputPaths.length > 6 ? (
                  <li className="diag-note">
                    … {uiInputPaths.length - 6} more
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}
          {animationInputPaths.length ? (
            <details>
              <summary>Animation Channels</summary>
              <ul>
                {animationInputPaths.slice(0, 6).map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
                {animationInputPaths.length > 6 ? (
                  <li className="diag-note">
                    … {animationInputPaths.length - 6} more
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
        <div className="diag-section">
          <h3>Render Outputs</h3>
          {renderOutputPaths.length === 0 ? (
            <p className="diag-empty">
              Load a low-level rig to inspect render outputs.
            </p>
          ) : (
            <details open>
              <summary>{renderOutputPaths.length} paths</summary>
              <ul>
                {renderDebugPrefixes.map((entry) => (
                  <li key={entry.source}>
                    <code>{entry.source}</code>
                    {entry.debug !== entry.source ? (
                      <>
                        {" "}
                        (<code>{entry.debug}</code>)
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="diag-section">
          <h3>Timing (ms)</h3>
          {timings ? (
            <ul>
              <li>prepare: {timings.prepare?.toFixed(3) ?? "—"}</li>
              <li>step: {timings.step?.toFixed(3) ?? "—"}</li>
              <li>merge: {timings.merge?.toFixed(3) ?? "—"}</li>
            </ul>
          ) : (
            <p className="diag-empty">Waiting for frame...</p>
          )}
        </div>
        <div className="diag-section">
          <h3>Merged Writes</h3>
          {sortedMergedWrites.length === 0 ? (
            <p className="diag-empty">No merged writes produced yet.</p>
          ) : (
            <ul>
              {sortedMergedWrites.map((write, index) => (
                <li key={`${write.path}-${index}`}>
                  <code>{write.path}</code>: {JSON.stringify(write.value)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="diag-section">
          <h3>Warnings</h3>
          {warnings.namespaceViolations.length === 0 &&
          warnings.outputCollisions.length === 0 &&
          warnings.missingUiInputs.length === 0 ? (
            <p className="diag-empty">No issues detected.</p>
          ) : (
            <>
              {warnings.namespaceViolations.length ? (
                <details open>
                  <summary>Namespace violations</summary>
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
                  <summary>Output collisions</summary>
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
                  <summary>Unstaged UI inputs</summary>
                  <ul>
                    {warnings.missingUiInputs.slice(0, 8).map((path) => (
                      <li key={path}>
                        <code>{path}</code>
                      </li>
                    ))}
                    {warnings.missingUiInputs.length > 8 ? (
                      <li className="diag-note">
                        … {warnings.missingUiInputs.length - 8} more
                      </li>
                    ) : null}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

import { useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { DemoBundleSummary } from "../lib/bundleSummary";
import { formatGraphKind, formatPathLabel } from "../lib/bundleSummary";

export function DiagnosticsPanel({ summary }: { summary: DemoBundleSummary }) {
  const { errors, outputPaths, controllers, assetBundle } = useVizijRuntime();
  const outputPreviewPaths = useMemo(
    () => outputPaths.slice(0, 12),
    [outputPaths],
  );
  const hasControllers =
    controllers.graphs.length > 0 || controllers.anims.length > 0;

  return (
    <section className="panel" aria-labelledby="diagnostics-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Read-only diagnostics</p>
          <h2 id="diagnostics-title">Diagnostics</h2>
        </div>
      </header>
      <div className="panel-body diagnostics-body">
        <div className="diagnostics-block">
          <strong>Bundle graph inventory</strong>
          <p className="diagnostic-copy">
            This is the authored graph structure embedded in the bundle before
            runtime registration. It tells you what systems ship with the face,
            not whether they are currently stepping.
          </p>
          <div className="badge-row">
            {summary.graphKinds.map((kind) => (
              <span key={kind} className="soft-badge">
                {formatGraphKind(kind)}
              </span>
            ))}
          </div>
          {summary.graphIds.length > 0 ? (
            <ul className="mono-list">
              {summary.graphIds.map((graphId) => (
                <li key={graphId}>{graphId}</li>
              ))}
            </ul>
          ) : (
            <div className="panel-empty compact">
              No embedded graph ids surfaced.
            </div>
          )}
        </div>

        <div className="diagnostics-block">
          <strong>Runtime controllers</strong>
          <p className="diagnostic-copy">
            These are the controller ids the runtime exposes. Graph controllers
            cover registered rig, pose, or program graphs. Animation controllers
            cover registered embedded clips.
          </p>
          {hasControllers ? (
            <ul className="mono-list">
              {controllers.graphs.map((graphId) => (
                <li key={graphId}>{graphId}</li>
              ))}
              {controllers.anims.map((animationId) => (
                <li key={animationId}>{animationId}</li>
              ))}
            </ul>
          ) : (
            <div className="panel-empty compact">
              No controller ids are currently surfaced. The face can still load
              and render because asset import and renderer state are separate
              from this controller inventory.
            </div>
          )}
        </div>

        <div className="diagnostics-block">
          <strong>Renderer outputs</strong>
          <p className="diagnostic-copy">
            These paths are output channels the runtime discovered from bundle
            graphs, procedural programs, and animation bridges. They describe
            where authored logic can write values into the renderer pipeline.
          </p>
          {outputPreviewPaths.length === 0 ? (
            <div className="panel-empty compact">
              No output paths detected yet.
            </div>
          ) : (
            <ul className="output-list">
              {outputPreviewPaths.map((path) => (
                <li key={path}>
                  <span>{formatPathLabel(path)}</span>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="diagnostics-block">
          <strong>Metadata</strong>
          <p className="diagnostic-copy">
            Export metadata helps identify provenance and authored capabilities.
            Initial inputs counts show how many values the runtime stages before
            playback begins.
          </p>
          <p>
            Bundle metadata keys:{" "}
            {summary.metadataKeys.length > 0
              ? summary.metadataKeys.join(", ")
              : "none"}
          </p>
          <p>
            Initial inputs:{" "}
            {Object.keys(assetBundle.initialInputs ?? {}).length}
          </p>
        </div>

        <div className="diagnostics-block">
          <strong>Errors</strong>
          <p className="diagnostic-copy">
            Runtime errors are grouped by phase so you can tell whether a
            problem came from asset loading, graph registration, animation
            playback, or bridge wiring.
          </p>
          {errors.length === 0 ? (
            <div className="panel-empty compact">
              No runtime errors captured.
            </div>
          ) : (
            <ul className="error-list">
              {errors.map((error, index) => (
                <li key={`${error.phase ?? "unknown"}-${index}`}>
                  <strong>{error.phase ?? "unknown"}</strong>
                  <span>{error.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

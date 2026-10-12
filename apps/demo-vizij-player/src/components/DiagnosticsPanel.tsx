import { useEffect, useState } from "react";
import { BEHAVIOR_RUNS, type KeyInfo } from "@vizij/runtime";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { DemoBundleSummary } from "../lib/bundleSummary";
import { formatGraphKind } from "../lib/bundleSummary";

const KEY_PREVIEW = 12;
const REFRESH_MS = 1_000;

/** What the device lists of itself: its keys under the face's prefix and
 * its interpreter's runs (Arora's ListKeys), refreshed every second. */
function useDeviceListing() {
  const { runtime } = useVizijRuntime();
  const [listing, setListing] = useState<{ keys: KeyInfo[]; runs: string[] }>({
    keys: [],
    runs: [],
  });

  useEffect(() => {
    if (!runtime) return;
    let current = true;
    const refresh = async () => {
      const [keys, runKeys] = await Promise.all([
        runtime.listKeys(runtime.rigPrefix),
        runtime.listKeys(BEHAVIOR_RUNS),
      ]);
      if (!current) return;
      const runs = Array.from(
        new Set(
          runKeys.map(
            (key) => key.path.slice(BEHAVIOR_RUNS.length).split("/")[0]!,
          ),
        ),
      );
      setListing({ keys, runs });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [runtime]);

  return listing;
}

export function DiagnosticsPanel({ summary }: { summary: DemoBundleSummary }) {
  const { runtime, error, behaviorError } = useVizijRuntime();
  const { keys, runs } = useDeviceListing();
  const prefix = runtime?.rigPrefix ?? "";

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
            The graphs the bundle carries, by kind and id
            (`describe(glb).graphs`). The face composes its rig, pose driver and
            poses here; its programs run on demand.
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
            <div className="panel-empty compact">No bundle graphs.</div>
          )}
        </div>

        <div className="diagnostics-block">
          <strong>Runs</strong>
          <p className="diagnostic-copy">
            The interpreter's runs (`listKeys(BEHAVIOR_RUNS)`): every program
            started on this face, ended runs included.
          </p>
          {runs.length > 0 ? (
            <ul className="mono-list">
              {runs.map((run) => (
                <li key={run}>{run}</li>
              ))}
            </ul>
          ) : (
            <div className="panel-empty compact">No run started yet.</div>
          )}
        </div>

        <div className="diagnostics-block">
          <strong>Device keys</strong>
          <p className="diagnostic-copy">
            The keys the device holds or describes under the face's prefix
            (`listKeys(runtime.rigPrefix)`), with the shape its store declares.
          </p>
          <p>{keys.length} keys.</p>
          {keys.length > 0 ? (
            <ul className="output-list">
              {keys.slice(0, KEY_PREVIEW).map((key) => (
                <li key={key.path}>
                  <span>{key.path.slice(prefix.length)}</span>
                  <code>{String(key.__meta.ty ?? "")}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="diagnostics-block">
          <strong>Metadata</strong>
          <p>
            Bundle metadata keys:{" "}
            {summary.metadataKeys.length > 0
              ? summary.metadataKeys.join(", ")
              : "none"}
          </p>
        </div>

        <div className="diagnostics-block">
          <strong>Errors</strong>
          <p className="diagnostic-copy">
            A load error, and the device's standing behavior error — the message
            of its latest failed tick.
          </p>
          {error || behaviorError ? (
            <ul className="error-list">
              {error ? (
                <li>
                  <strong>load</strong>
                  <span>{error.message}</span>
                </li>
              ) : null}
              {behaviorError ? (
                <li>
                  <strong>behavior</strong>
                  <span>{behaviorError}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="panel-empty compact">No errors.</div>
          )}
        </div>
      </div>
    </section>
  );
}

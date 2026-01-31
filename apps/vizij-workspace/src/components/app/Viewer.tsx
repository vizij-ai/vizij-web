import { useCallback, useId, useMemo, useState } from "react";
import { Vizij } from "@vizij/render";
import { Button, Switch, Chip } from "../ui";

interface ViewerProps {
  rootId: string | null;
  statusMessage: string;
  namespace: string;
  onClearSelection: () => void;
  graphTimeSeconds: number;
  graphFrameRate: number;
  graphPlaybackState: "playing" | "paused";
  graphStatus: "idle" | "loading" | "ready" | "error";
  onPlayGraph: () => void;
  onPauseGraph: () => void;
  onStopGraph: () => void;
  onStepGraph: () => void;
  faceId: string;
  faceSegment?: string | null;
  onFaceIdChange: (value: string) => void;
  onResetAllInputs: () => void;
}

export function Viewer({
  rootId,
  statusMessage,
  namespace,
  onClearSelection,
  graphTimeSeconds,
  graphFrameRate,
  graphPlaybackState,
  graphStatus,
  onPlayGraph,
  onPauseGraph,
  onStopGraph,
  onStepGraph,
  faceId,
  faceSegment,
  onFaceIdChange,
  onResetAllInputs,
}: ViewerProps) {
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);
  const [graphControlsOpen, setGraphControlsOpen] = useState(false);
  const playbackDetailsId = useId();
  const faceInputId = useId();

  const formattedGraphTime = useMemo(
    () => formatGraphClock(graphTimeSeconds),
    [graphTimeSeconds],
  );
  const formattedFrameRate = useMemo(() => {
    return graphFrameRate > 0 ? `${graphFrameRate.toFixed(1)} fps` : "— fps";
  }, [graphFrameRate]);

  const transportDisabled = graphStatus !== "ready";
  const playbackButtonsDisabled = transportDisabled || !graphControlsOpen;
  const handleTogglePlayback = useCallback(() => {
    if (transportDisabled) {
      return;
    }
    if (graphPlaybackState === "playing") {
      onPauseGraph();
      return;
    }
    onPlayGraph();
  }, [graphPlaybackState, onPauseGraph, onPlayGraph, transportDisabled]);

  return (
    <main className="viewer">
      <header className="viewer__header">
        <div className="viewer__header-main">
          <div className="viewer__title-group">
            <p className="viewer__eyebrow">Viewport</p>
            <div>
              <h2>{"Vizij Viewport"}</h2>
              <p className="viewer__status">{statusMessage}</p>
            </div>
          </div>
          <div className="viewer__face-card">
            <div className="viewer__face-card-header">
              <span className="viewer__section-label">Active face</span>
              {faceSegment ? <Chip tone="info">{faceSegment}</Chip> : null}
            </div>
            <div className="viewer__face-input">
              <label htmlFor={faceInputId}>Face ID</label>
              <input
                id={faceInputId}
                type="text"
                value={faceId}
                onChange={(event) => onFaceIdChange(event.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        <div className="viewer__header-grid">
          <section className="viewer__section viewer__section--graph">
            <button
              type="button"
              className="viewer__graph-toggle"
              aria-expanded={graphControlsOpen}
              aria-controls={playbackDetailsId}
              onClick={() => setGraphControlsOpen((open) => !open)}
            >
              <span className="viewer__graph-label">Graph playback</span>
              <span className="viewer__graph-fps">{formattedFrameRate}</span>
              <span className="viewer__graph-chevron" aria-hidden="true">
                {graphControlsOpen ? "▾" : "▸"}
              </span>
            </button>
            <div
              id={playbackDetailsId}
              className="viewer__graph-body"
              data-open={graphControlsOpen ? "true" : undefined}
              aria-hidden={!graphControlsOpen}
            >
              <div className="viewer__graph-time">
                <span>Graph time</span>
                <strong>{formattedGraphTime}</strong>
              </div>
              <div className="viewer__transport-buttons">
                <Button
                  variant="ghost"
                  onClick={handleTogglePlayback}
                  disabled={playbackButtonsDisabled}
                >
                  {graphPlaybackState === "playing" ? "Pause" : "Play"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!playbackButtonsDisabled) {
                      onStopGraph();
                    }
                  }}
                  disabled={playbackButtonsDisabled}
                >
                  Stop
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!playbackButtonsDisabled) {
                      onStepGraph();
                    }
                  }}
                  disabled={playbackButtonsDisabled}
                >
                  Step
                </Button>
              </div>
            </div>
          </section>
          <section className="viewer__section viewer__section--highlights">
            <div className="viewer__section-header">
              <p className="viewer__section-label">Highlights</p>
              <span className="viewer__section-hint">
                Selection glow & resets
              </span>
            </div>
            <div className="viewer__highlights-controls">
              <Switch
                checked={showSelectionGlow}
                onChange={(e) => setShowSelectionGlow(e.currentTarget.checked)}
                label="Enabled"
              />
              <Button variant="primary" onClick={onResetAllInputs}>
                Reset inputs
              </Button>
            </div>
          </section>
        </div>
      </header>
      <div className="viewer__canvas">
        {rootId ? (
          <Vizij
            rootId={rootId}
            namespace={namespace}
            showSafeArea={false}
            showSelectionGlow={showSelectionGlow}
            onPointerMissed={(event) => {
              if (event.button === 0) {
                onClearSelection();
              }
            }}
          />
        ) : (
          <div className="viewer__placeholder">
            <p>Load a Vizij asset to render it here.</p>
          </div>
        )}
      </div>
    </main>
  );
}

function formatGraphClock(value: number): string {
  if (!Number.isFinite(value)) {
    return "00:00.00";
  }
  const seconds = Math.max(value, 0);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining
    .toFixed(2)
    .padStart(5, "0")}`;
}

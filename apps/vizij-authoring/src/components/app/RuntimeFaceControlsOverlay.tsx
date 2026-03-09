import { useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../ui";

export type RuntimeFaceControlsOverlayProps = {
  onResetInputs?: () => void;
  onPlayActiveRuntime?: () => void;
  onPauseActiveRuntime?: () => void;
  onStopActiveRuntime?: () => void;
  onToggleSplit?: () => void;
  splitVertical?: boolean;
  showReadyFlag?: boolean;
  runtimeStatusLabel?: string;
  runtimeStatusTestId?: string;
  playbackControlsDisabled?: boolean;
  resetButtonLabel?: string;
  resetButtonTitle?: string;
  resetButtonTestId?: string;
  playButtonLabel?: string;
  playButtonTitle?: string;
  playButtonTestId?: string;
  pauseButtonLabel?: string;
  pauseButtonTitle?: string;
  pauseButtonTestId?: string;
  stopButtonLabel?: string;
  stopButtonTitle?: string;
  stopButtonTestId?: string;
  readyFlagTestId?: string;
};

export function RuntimeFaceControlsOverlay({
  onResetInputs,
  onPlayActiveRuntime,
  onPauseActiveRuntime,
  onStopActiveRuntime,
  onToggleSplit,
  splitVertical = false,
  showReadyFlag = true,
  runtimeStatusLabel,
  runtimeStatusTestId,
  playbackControlsDisabled = false,
  resetButtonLabel = "Reset Inputs",
  resetButtonTitle = "Reset graph inputs to their default values",
  resetButtonTestId,
  playButtonLabel = "Play Active Runtime",
  playButtonTitle = "Play the active authored runtime source",
  playButtonTestId,
  pauseButtonLabel = "Pause Active Runtime",
  pauseButtonTitle = "Pause the active authored runtime source",
  pauseButtonTestId,
  stopButtonLabel = "Stop Active Runtime",
  stopButtonTitle = "Stop the active authored runtime source",
  stopButtonTestId,
  readyFlagTestId,
}: RuntimeFaceControlsOverlayProps) {
  const { ready, loading, stepHz } = useVizijRuntime();

  if (!ready || loading) {
    return null;
  }

  const formattedFps =
    stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
      {showReadyFlag && (
        <div className="flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
          <div data-testid={readyFlagTestId} className="contents">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Ready
          </div>
        </div>
      )}
      <div className="rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        FPS: {formattedFps}
      </div>
      {runtimeStatusLabel ? (
        <div
          data-testid={runtimeStatusTestId}
          className="rounded bg-black/60 px-2 py-1 text-[10px] text-white"
        >
          {runtimeStatusLabel}
        </div>
      ) : null}
      {onResetInputs && (
        <Button
          data-testid={resetButtonTestId}
          variant="secondary"
          size="sm"
          onClick={onResetInputs}
          title={resetButtonTitle}
        >
          {resetButtonLabel}
        </Button>
      )}
      {onPlayActiveRuntime && (
        <Button
          data-testid={playButtonTestId}
          variant="secondary"
          size="sm"
          disabled={playbackControlsDisabled}
          onClick={onPlayActiveRuntime}
          title={playButtonTitle}
        >
          {playButtonLabel}
        </Button>
      )}
      {onPauseActiveRuntime && (
        <Button
          data-testid={pauseButtonTestId}
          variant="secondary"
          size="sm"
          disabled={playbackControlsDisabled}
          onClick={onPauseActiveRuntime}
          title={pauseButtonTitle}
        >
          {pauseButtonLabel}
        </Button>
      )}
      {onStopActiveRuntime && (
        <Button
          data-testid={stopButtonTestId}
          variant="secondary"
          size="sm"
          disabled={playbackControlsDisabled}
          onClick={onStopActiveRuntime}
          title={stopButtonTitle}
        >
          {stopButtonLabel}
        </Button>
      )}
      {onToggleSplit && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleSplit}
          title={
            splitVertical
              ? "Switch to horizontal split"
              : "Switch to vertical split"
          }
        >
          {splitVertical ? "⬌" : "⬍"}
        </Button>
      )}
    </div>
  );
}

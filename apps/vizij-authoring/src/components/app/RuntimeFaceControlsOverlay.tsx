import { Pause, Play } from "lucide-react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../ui";

export type RuntimeFaceOverlayAction = {
  label: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  testId?: string;
};

export type RuntimeFaceControlsOverlayProps = {
  onResetInputs?: () => void;
  runtimeActions?: RuntimeFaceOverlayAction[];
  onToggleSplit?: () => void;
  splitVertical?: boolean;
  showReadyFlag?: boolean;
  runtimeStatusLabel?: string;
  runtimeStatusTestId?: string;
  runtimePlaybackState?: "starting" | "playing" | "paused" | "stopped";
  onPlayRuntime?: () => void;
  onPauseRuntime?: () => void;
  resetButtonLabel?: string;
  resetButtonTitle?: string;
  resetButtonTestId?: string;
  readyFlagTestId?: string;
};

export function RuntimeFaceControlsOverlay({
  onResetInputs,
  runtimeActions = [],
  onToggleSplit,
  splitVertical = false,
  showReadyFlag = true,
  runtimeStatusLabel,
  runtimeStatusTestId,
  runtimePlaybackState,
  onPlayRuntime,
  onPauseRuntime,
  resetButtonLabel = "Reset Inputs",
  resetButtonTitle = "Reset graph inputs to their default values",
  resetButtonTestId,
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
          className="flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-[10px] text-white"
        >
          {runtimeStatusLabel}
          {runtimePlaybackState === "playing" && onPauseRuntime ? (
            <button
              data-testid="main-runtime-pause"
              onClick={onPauseRuntime}
              title="Pause"
              className="flex items-center justify-center rounded hover:bg-white/20 p-0.5 transition-colors"
            >
              <Pause className="h-3 w-3 fill-current" />
            </button>
          ) : runtimePlaybackState !== "playing" &&
            runtimePlaybackState !== "starting" &&
            onPlayRuntime ? (
            <button
              data-testid="main-runtime-play"
              onClick={onPlayRuntime}
              title="Play"
              className="flex items-center justify-center rounded hover:bg-white/20 p-0.5 transition-colors"
            >
              <Play className="h-3 w-3 fill-current" />
            </button>
          ) : null}
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
      {runtimeActions.map((action) => (
        <Button
          key={action.testId ?? action.label}
          data-testid={action.testId}
          variant="secondary"
          size="sm"
          disabled={action.disabled}
          onClick={action.onClick}
          title={action.title}
        >
          {action.label}
        </Button>
      ))}
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

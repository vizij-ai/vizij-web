import { useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../ui";

export type RuntimeFaceControlsOverlayProps = {
  onResetInputs?: () => void;
  onToggleSplit?: () => void;
  splitVertical?: boolean;
  showReadyFlag?: boolean;
  resetButtonLabel?: string;
  resetButtonTitle?: string;
  resetButtonTestId?: string;
  readyFlagTestId?: string;
};

export function RuntimeFaceControlsOverlay({
  onResetInputs,
  onToggleSplit,
  splitVertical = false,
  showReadyFlag = true,
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

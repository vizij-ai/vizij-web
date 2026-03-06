import { useRef, useCallback, type ChangeEvent } from "react";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { Button } from "../ui";
import { ReferenceFaceRuntime } from "./ReferenceFaceRuntime";
import {
  REFERENCE_FACE_PRESET_GRID_OPTIONS,
  type FacePresetAssetOption,
} from "./facePresetAssets";

export interface ReferenceFacePanelProps {
  splitVertical: boolean;
  onToggleSplit: () => void;
}

export function ReferenceFacePanel({
  splitVertical,
  onToggleSplit,
}: ReferenceFacePanelProps) {
  const referenceFace = useReferenceFace();

  // File Import Logic
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUnloadClick = useCallback(() => {
    referenceFace.setFile(null);
  }, [referenceFace]);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      referenceFace.setFile(file);
      // Reset input value to allow re-selecting the same file
      event.target.value = "";
    },
    [referenceFace],
  );

  const handleLoadPresetAsset = useCallback(
    async (preset: FacePresetAssetOption) => {
      if (!preset.available || !preset.referenceCompatible) {
        return;
      }
      try {
        const res = await fetch(preset.url);
        if (!res.ok) {
          throw new Error(`Failed to load ${preset.filename}`);
        }
        const blob = await res.blob();
        const file = new File([blob], preset.filename, {
          type: "model/gltf-binary",
        });
        referenceFace.setFile(file);
      } catch (error) {
        console.error(error);
        alert(`Could not load ${preset.label} asset.`);
      }
    },
    [referenceFace],
  );

  return (
    <div
      data-testid="reference-face-panel"
      className="h-full w-full relative bg-bg-panel overflow-hidden pointer-events-auto"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleFileChange}
      />

      <OrchestratorProvider autostart={true}>
        {referenceFace.file ? (
          <ReferenceFaceRuntime
            file={referenceFace.file}
            active={true}
            visible={true}
            driveOrchestrator={true}
            onStandardInputsReady={referenceFace.onStandardInputsReady}
            onLoadingStateChange={referenceFace.onLoadingStateChange}
            onAnimateValueReady={referenceFace.onAnimateValueReady}
            onStandardInputChange={referenceFace.onStandardInputChange}
            onBundleReady={referenceFace.onBundleReady}
            splitVertical={splitVertical}
            onToggleSplit={onToggleSplit}
          />
        ) : (
          <div
            data-testid="reference-face-empty-state"
            className="h-full w-full relative"
          >
            <div className="absolute top-2 left-2 z-10">
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
            </div>
            <div className="flex flex-col items-center justify-center h-full text-text-primary gap-6 p-8 text-center animate-in fade-in duration-700">
              <div className="flex flex-col gap-2">
                <p className="text-text-primary font-medium text-lg">
                  No Reference Face
                </p>
                <p className="text-sm max-w-xs mx-auto text-text-muted">
                  Load a reference face GLB to compare mappings and review
                  controls side-by-side.
                </p>
              </div>
              <div className="flex w-full max-w-3xl flex-col items-center gap-3">
                <Button
                  data-testid="reference-face-load-custom"
                  variant="primary"
                  onClick={handleLoadClick}
                  size="md"
                >
                  Load Custom Reference Face
                </Button>
                {REFERENCE_FACE_PRESET_GRID_OPTIONS.length > 0 ? (
                  <div className="grid w-full grid-cols-3 gap-2">
                    {REFERENCE_FACE_PRESET_GRID_OPTIONS.map((preset) => {
                      const canLoadAsReference =
                        preset.available && preset.referenceCompatible;
                      return (
                        <Button
                          data-testid={`reference-face-preset-${preset.id.replace(/[:/]/g, "-")}`}
                          key={preset.id}
                          size="sm"
                          variant="secondary"
                          className="w-full justify-center text-[11px]"
                          disabled={!canLoadAsReference}
                          onClick={() => void handleLoadPresetAsset(preset)}
                          title={
                            canLoadAsReference
                              ? `Load ${preset.filename}`
                              : !preset.available
                                ? `${preset.label} asset not available`
                                : `${preset.label} is not reference-compatible`
                          }
                        >
                          {preset.label}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {referenceFace.file && (
          <div className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-2">
            <Button
              data-testid="reference-face-swap"
              variant="ghost"
              size="sm"
              className="text-[11px] h-7 px-2"
              onClick={handleLoadClick}
              title="Load a different reference face"
            >
              Swap
            </Button>
            <Button
              data-testid="reference-face-unload"
              variant="ghost"
              size="sm"
              className="text-[11px] h-7 px-2 text-amber-300 hover:text-amber-200"
              onClick={handleUnloadClick}
              title="Unload reference face"
            >
              Unload
            </Button>
          </div>
        )}
      </OrchestratorProvider>
    </div>
  );
}

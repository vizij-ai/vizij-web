import { useRef, useCallback, type ChangeEvent } from "react";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { Button } from "../ui";
import { ReferenceFaceRuntime } from "./ReferenceFaceRuntime";
import {
  FACE_PRESET_GRID_OPTIONS,
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
      if (!preset.available) {
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
    <div className="h-full w-full relative bg-bg-panel overflow-hidden pointer-events-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleFileChange}
      />

      <OrchestratorProvider autostart={true}>
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

        {referenceFace.file && (
          <div className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px] h-7 px-2"
              onClick={handleLoadClick}
              title="Load a different reference face"
            >
              Swap
            </Button>
            <Button
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

        {/* Overlay Load Button if no file */}
        {!referenceFace.file && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* We use pointer-events-none on container and auto on button so it floats above the placeholder */}
            <div className="pointer-events-auto flex w-full max-w-[560px] flex-col items-center gap-3 px-4">
              <Button
                variant="primary"
                onClick={handleLoadClick}
                className="shadow-lg"
              >
                Load Custom Reference Face
              </Button>
              <div className="grid w-full grid-cols-3 gap-2">
                {FACE_PRESET_GRID_OPTIONS.map((preset) => (
                  <Button
                    key={preset.id}
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    disabled={!preset.available}
                    onClick={() => void handleLoadPresetAsset(preset)}
                    title={
                      preset.available
                        ? `Load ${preset.filename}`
                        : `${preset.label} asset not available`
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </OrchestratorProvider>
    </div>
  );
}

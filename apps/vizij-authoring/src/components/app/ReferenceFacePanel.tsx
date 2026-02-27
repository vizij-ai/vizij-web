import { useRef, useCallback, type ChangeEvent } from "react";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { Button } from "../ui";
import { ReferenceFaceRuntime } from "./ReferenceFaceRuntime";

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
            <div className="pointer-events-auto flex flex-col items-center gap-3">
              <Button
                variant="primary"
                onClick={handleLoadClick}
                className="shadow-lg"
              >
                Load Custom Reference Face
              </Button>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded text-xs font-medium transition-colors border border-zinc-600 shadow-lg cursor-pointer"
                  onClick={async () => {
                    try {
                      const res = await fetch("/assets/Hugo_Latest_Rigged.glb");
                      if (!res.ok) throw new Error("Failed to load Hugo");
                      const blob = await res.blob();
                      const file = new File([blob], "Hugo_Latest_Rigged.glb", {
                        type: "model/gltf-binary",
                      });
                      referenceFace.setFile(file);
                    } catch (e) {
                      console.error(e);
                      alert("Could not load Hugo asset.");
                    }
                  }}
                >
                  Load Hugo
                </Button>
                <Button
                  size="sm"
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded text-xs font-medium transition-colors border border-zinc-600 shadow-lg cursor-pointer"
                  onClick={async () => {
                    try {
                      const res = await fetch(
                        "/assets/Quori_Latest_Rigged.glb",
                      );
                      if (!res.ok) throw new Error("Failed to load Quori");
                      const blob = await res.blob();
                      const file = new File([blob], "Quori_Latest_Rigged.glb", {
                        type: "model/gltf-binary",
                      });
                      referenceFace.setFile(file);
                    } catch (e) {
                      console.error(e);
                      alert("Could not load Quori asset.");
                    }
                  }}
                >
                  Load Quori
                </Button>
              </div>
            </div>
          </div>
        )}
      </OrchestratorProvider>
    </div>
  );
}

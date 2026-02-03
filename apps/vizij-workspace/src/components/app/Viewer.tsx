import { Vizij } from "@vizij/render";
import { Button } from "../ui";

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  onClearSelection: () => void;
  showSelectionGlow: boolean;
  onImportClick: () => void;
  onLoadQuori: () => void;
  onLoadHugo: () => void;
}

export function Viewer({
  rootId,
  namespace,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
}: ViewerProps) {
  return (
    <main className="h-full w-full relative bg-bg-panel overflow-hidden">
      <div className="h-full w-full">
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
          <div className="flex flex-col items-center justify-center h-full text-text-primary gap-6 p-8 text-center animate-in fade-in duration-700">
            <div className="flex flex-col gap-2">
              <p className="text-text-primary font-medium text-lg">
                Empty Scene
              </p>
              <p className="text-sm max-w-xs mx-auto text-text-muted">
                Load a Vizij asset (.glb) to begin rigging and composing your
                scene.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={onImportClick} size="md">
                Import File
              </Button>
              <Button variant="secondary" onClick={onLoadQuori} size="md">
                Load Quori
              </Button>
              <Button variant="secondary" onClick={onLoadHugo} size="md">
                Load Hugo
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

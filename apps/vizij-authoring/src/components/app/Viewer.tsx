import { Vizij } from "@vizij/render";
import type { Group } from "@vizij/render";
interface ViewerProps {
  rootId: string | null;
  rootRenderable: Group | undefined;
  statusMessage: string;
  namespace: string;
  onClearSelection: () => void;
}

export function Viewer({
  rootId,
  rootRenderable,
  statusMessage,
  namespace,
  onClearSelection,
}: ViewerProps) {
  return (
    <main className="viewer">
      <header className="viewer__header">
        <div>
          <h2>{"Vizij Viewport"}</h2>
          <p>{statusMessage}</p>
        </div>
        {rootRenderable && (
          <div className="viewer__root-meta">
            <span>Root: {rootRenderable.name || rootRenderable.id}</span>
            <span>Children: {rootRenderable.children.length}</span>
          </div>
        )}
      </header>
      <div className="viewer__canvas">
        {rootId ? (
          <Vizij
            rootId={rootId}
            namespace={namespace}
            showSafeArea={false}
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

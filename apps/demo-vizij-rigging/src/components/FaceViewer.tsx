import { Vizij } from "@vizij/render";

interface FaceViewerProps {
  rootId?: string | null;
  loading: boolean;
  ready: boolean;
  error?: string | null;
  namespace: string;
  showSafeArea?: boolean;
}

export function FaceViewer({
  rootId,
  loading,
  ready,
  error,
  namespace,
  showSafeArea,
}: FaceViewerProps) {
  if (error) {
    return (
      <div className="panel face-viewer">
        <div className="panel-header">
          <h2>Face Viewer</h2>
          <span className="tag error">Load failed</span>
        </div>
        <div className="panel-body error">Failed to load face: {error}</div>
      </div>
    );
  }

  return (
    <div className="panel face-viewer">
      <div className="panel-header">
        <h2>Face Viewer</h2>
        <span className="tag">ns: {namespace}</span>
      </div>
      <div className="panel-body viewer-body">
        <div className="viewer-body__canvas">
          {!loading && ready && rootId ? (
            <Vizij
              rootId={rootId}
              namespace={namespace}
              showSafeArea={showSafeArea}
              className="viewer-canvas"
            />
          ) : null}
        </div>
        {!loading && !ready ? (
          <div className="viewer-body__placeholder">
            <p>Load a Vizij GLB to begin.</p>
          </div>
        ) : null}
        {loading ? (
          <div className="viewer-body__overlay">
            <div className="viewer-body__status">Loading face asset…</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

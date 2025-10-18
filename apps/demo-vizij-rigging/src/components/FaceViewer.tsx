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
        {loading && <div className="panel-status">Loading face asset…</div>}
        {!loading && ready && rootId ? (
          <Vizij
            rootId={rootId}
            namespace={namespace}
            showSafeArea={showSafeArea}
            className="viewer-canvas"
          />
        ) : null}
        {!loading && !ready ? (
          <div className="panel-status">Load a Vizij GLB to begin.</div>
        ) : null}
      </div>
    </div>
  );
}

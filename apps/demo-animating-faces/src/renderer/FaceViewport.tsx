import { Vizij } from "@vizij/render";

interface FaceViewportProps {
  namespace: string;
  rootId: string | null;
  loading: boolean;
  error?: string | null;
}

export function FaceViewport({
  namespace,
  rootId,
  loading,
  error = null,
}: FaceViewportProps) {
  return (
    <section className="panel face-viewport">
      <header className="panel-header">
        <h2>Face Viewer</h2>
        <span className="tag">ns: {namespace}</span>
      </header>
      <div className="panel-body">
        {loading ? <div className="panel-status">Loading GLB…</div> : null}
        {!loading && error ? (
          <div className="panel-error">Failed to load GLB: {error}</div>
        ) : null}
        {!loading && !error && rootId ? (
          <Vizij
            rootId={rootId}
            namespace={namespace}
            className="viewer-canvas"
          />
        ) : null}
        {!loading && !error && !rootId ? (
          <div className="panel-status">Load a GLB to preview the face.</div>
        ) : null}
      </div>
    </section>
  );
}

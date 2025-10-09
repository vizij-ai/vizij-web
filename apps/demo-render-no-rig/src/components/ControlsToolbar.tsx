import type { FaceConfig } from "../data/faces";

interface ControlsToolbarProps {
  faces: FaceConfig[];
  selectedFaceId: string;
  onSelectFace: (id: string) => void;
  namespace: string;
  onNamespaceChange: (value: string) => void;
  showSafeArea: boolean;
  onToggleSafeArea: (value: boolean) => void;
}

export function ControlsToolbar({
  faces,
  selectedFaceId,
  onSelectFace,
  namespace,
  onNamespaceChange,
  showSafeArea,
  onToggleSafeArea,
}: ControlsToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Face</span>
        <div className="face-buttons">
          {faces.map((face) => {
            const active = face.id === selectedFaceId;
            return (
              <button
                key={face.id}
                type="button"
                className={`btn ${active ? "btn-primary" : "btn-muted"}`}
                onClick={() => onSelectFace(face.id)}
              >
                {face.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="namespace-input">
          Namespace
        </label>
        <input
          id="namespace-input"
          className="text-input"
          value={namespace}
          onChange={(event) => onNamespaceChange(event.target.value)}
        />
      </div>

      <label className="toolbar-toggle">
        <input
          type="checkbox"
          checked={showSafeArea}
          onChange={(event) => onToggleSafeArea(event.target.checked)}
        />
        <span>Show safe area</span>
      </label>
    </div>
  );
}

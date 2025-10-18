import { ChangeEvent, useMemo } from "react";
import type { FaceConfig } from "../data/faces";

interface LoaderStatus {
  loading: boolean;
  ready: boolean;
  error?: string | null;
  assetName?: string | null;
}

interface FaceLoaderPanelProps {
  faces: FaceConfig[];
  selectedFaceId: string | null;
  onSelectFace: (faceId: string) => void;
  onUploadGlb: (file: File) => void;
  onImportLowLevelGraph: (file: File) => void;
  loaderStatus: LoaderStatus;
  graphLoaded: boolean;
  graphError: string | null;
}

export function FaceLoaderPanel({
  faces,
  selectedFaceId,
  onSelectFace,
  onUploadGlb,
  onImportLowLevelGraph,
  loaderStatus,
  graphLoaded,
  graphError,
}: FaceLoaderPanelProps) {
  const currentFaceName = useMemo(() => {
    const face = faces.find((item) => item.id === selectedFaceId);
    return face?.name ?? "Custom";
  }, [faces, selectedFaceId]);

  const handleGlbInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }
    onUploadGlb(event.target.files[0]);
    event.target.value = "";
  };

  const handleLowLevelGraphInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }
    onImportLowLevelGraph(event.target.files[0]);
    event.target.value = "";
  };

  return (
    <div className="panel loader-panel">
      <div className="panel-header">
        <h2>1 · Load Face Asset</h2>
      </div>
      <div className="panel-body">
        <label className="field-label" htmlFor="face-select">
          Sample faces
        </label>
        <select
          id="face-select"
          className="select"
          value={selectedFaceId ?? ""}
          onChange={(event) => onSelectFace(event.target.value)}
        >
          {faces.map((face) => (
            <option key={face.id} value={face.id}>
              {face.name}
            </option>
          ))}
          <option value="">Custom</option>
        </select>

        <div className="upload-row">
          <label className="field-label" htmlFor="glb-upload">
            Load GLB (from demo-render export)
          </label>
          <input
            id="glb-upload"
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={handleGlbInput}
          />
        </div>

        <div className="upload-row">
          <label className="field-label" htmlFor="rig-graph-upload">
            Import low-level graph (.graph.json)
          </label>
          <input
            id="rig-graph-upload"
            type="file"
            accept=".json,application/json"
            onChange={handleLowLevelGraphInput}
          />
        </div>

        <div className="status-block">
          <div className="status-row">
            <span className="status-label">Face:</span>
            <span className="status-value">{currentFaceName}</span>
          </div>
          <div className="status-row">
            <span className="status-label">Asset:</span>
            <span className="status-value">
              {loaderStatus.assetName ?? "—"}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">Status:</span>
            <span className="status-value">
              {loaderStatus.loading
                ? "Loading…"
                : loaderStatus.error
                  ? `Error: ${loaderStatus.error}`
                  : loaderStatus.ready
                    ? "Ready"
                    : "Idle"}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">Low-level graph spec:</span>
            <span className="status-value">
              {graphError
                ? `Error: ${graphError}`
                : graphLoaded
                  ? "Loaded"
                  : "Not loaded"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

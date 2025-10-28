import { ChangeEvent } from "react";

interface AssetLoaderPanelProps {
  isLoading: boolean;
  error: string | null;
  onSelectFile: (file: File) => void;
  onClearError: () => void;
}

export function AssetLoaderPanel({
  isLoading,
  error,
  onSelectFile,
  onClearError,
}: AssetLoaderPanelProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    onSelectFile(file);
    event.target.value = "";
  };

  return (
    <article className="asset-card">
      <div className="asset-card__body asset-card__body--compact">
        <div className="asset-card__group">
          <label className="sidebar__label" htmlFor="vizij-file">
            Load a GLB
          </label>
          <input
            id="vizij-file"
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </div>

        <p className="asset-card__hint asset-card__hint--muted">
          Supports high-poly GLBs exported from Vizij or other DCC tools.
        </p>

        {error && (
          <div className="asset-card__alert" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="button subtle"
              onClick={onClearError}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

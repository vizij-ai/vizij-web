import { FormEvent, ChangeEvent } from "react";

interface AssetLoaderPanelProps {
  assetUrl: string;
  isLoading: boolean;
  error: string | null;
  onAssetUrlChange: (value: string) => void;
  onLoadFromUrl: () => void;
  onSelectFile: (file: File) => void;
  onClearError: () => void;
}

export function AssetLoaderPanel({
  assetUrl,
  isLoading,
  error,
  onAssetUrlChange,
  onLoadFromUrl,
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLoadFromUrl();
  };

  return (
    <section className="sidebar__section">
      <div className="sidebar__panel">
        <div className="sidebar__panel-header">
          <h2 className="sidebar__panel-title">Load You Face</h2>
        </div>
        <label className="sidebar__label" htmlFor="vizij-file">
          Choose a local .glb file
        </label>
        <input
          id="vizij-file"
          type="file"
          accept=".glb,.gltf"
          onChange={handleFileChange}
          disabled={isLoading}
        />
        {error && (
          <form className="sidebar__form" onSubmit={handleSubmit}>
            <label className="sidebar__label" htmlFor="vizij-url">
              Or load from URL
            </label>
            <div className="sidebar__form-row">
              <input
                id="vizij-url"
                type="url"
                placeholder="https://example.com/robot.glb"
                value={assetUrl}
                onChange={(event) => onAssetUrlChange(event.target.value)}
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading}>
                Load
              </button>
            </div>
          </form>
        )}
        {error && (
          <div>
            <p className="sidebar__hint">{error}</p>
            <button type="button" onClick={onClearError}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

import { ChangeEvent } from "react";

interface GraphImportPanelProps {
  onSelectGraphFile: (file: File) => void;
  disabled?: boolean;
}

export function GraphImportPanel({
  onSelectGraphFile,
  disabled = false,
}: GraphImportPanelProps) {
  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectGraphFile(file);
      event.target.value = "";
    }
  };

  return (
    <article className="asset-card">
      <div className="asset-card__body asset-card__body--compact">
        <div className="asset-card__group">
          <label className="sidebar__label" htmlFor="rig-graph-file">
            Load a rig graph <span className="asset-card__tag">Optional</span>
          </label>
          <input
            id="rig-graph-file"
            type="file"
            accept=".json,.graph.json"
            disabled={disabled}
            onChange={handleSelect}
          />
        </div>

        <p className="asset-card__hint asset-card__hint--muted">
          Expect a <code>.graph.json</code> file exported alongside the Vizij
          GLB.
        </p>
      </div>
    </article>
  );
}

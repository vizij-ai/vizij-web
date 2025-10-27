import { ChangeEvent, useRef } from "react";

interface GraphImportPanelProps {
  onSelectGraphFile: (file: File) => void;
  disabled?: boolean;
}

export function GraphImportPanel({
  onSelectGraphFile,
  disabled = false,
}: GraphImportPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectGraphFile(file);
      event.target.value = "";
    }
  };

  return (
    <section className="sidebar__section">
      <div className="sidebar__panel">
        <div className="sidebar__panel-header">
          <h2 className="sidebar__panel-title">Import Rig Graph</h2>
        </div>
        <p className="sidebar__panel-description">
          Load a rig graph JSON exported from Vizij authoring to reconstruct
          bindings for the loaded GLB.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Select graph JSON
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.graph.json"
          style={{ display: "none" }}
          onChange={handleSelect}
        />
      </div>
    </section>
  );
}

interface ExportPanelProps {
  graphFileName: string;
  onGraphFileNameChange: (value: string) => void;
  exportFileName: string;
  onExportFileNameChange: (value: string) => void;
  canExport: boolean;
  onExportGraph: () => void;
  onExportGlb: () => void;
}

export function ExportPanel({
  graphFileName,
  onGraphFileNameChange,
  exportFileName,
  onExportFileNameChange,
  canExport,
  onExportGraph,
  onExportGlb,
}: ExportPanelProps) {
  return (
    <article className="asset-card">
      <header className="asset-card__header">
        <h2 className="asset-card__title">Vizij Outputs</h2>
        <p className="asset-card__description">
          Download the Vizij GLB and matching rig graph.
        </p>
      </header>

      <div className="asset-card__body asset-card__body--compact">
        <label className="sidebar__label" htmlFor="vizij-graph-name">
          Rig graph file
        </label>
        <div className="asset-card__form-row">
          <input
            id="vizij-graph-name"
            type="text"
            value={graphFileName}
            placeholder="vizij_rig.graph.json"
            onChange={(event) => onGraphFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <button
            type="button"
            className="button"
            onClick={onExportGraph}
            disabled={!canExport}
          >
            Export
          </button>
        </div>

        <label className="sidebar__label" htmlFor="vizij-export-name">
          Vizij GLB file
        </label>
        <div className="asset-card__form-row">
          <input
            id="vizij-export-name"
            type="text"
            value={exportFileName}
            placeholder="vizij_scene.glb"
            onChange={(event) => onExportFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <button
            type="button"
            className="button primary"
            onClick={onExportGlb}
            disabled={!canExport}
          >
            Export
          </button>
        </div>
        <p className="asset-card__hint">
          Share both files to capture geometry, bindings, and pose rig data.
        </p>
      </div>
    </article>
  );
}

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
    <section className="sidebar__section">
      <div className="sidebar__panel">
        <div className="sidebar__panel-header">
          <h2 className="sidebar__panel-title">Export Vizij GLB</h2>
        </div>
        <p className="sidebar__panel-description">
          Save a Vizij GLB that bakes in the animatable overrides you currently
          have applied to the selected robot.
        </p>
        <label className="sidebar__label" htmlFor="vizij-graph-name">
          Graph file name
        </label>
        <div className="sidebar__form-row">
          <input
            id="vizij-graph-name"
            type="text"
            value={graphFileName}
            placeholder="vizij-export.graph.json"
            onChange={(event) => onGraphFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <button type="button" onClick={onExportGraph} disabled={!canExport}>
            Export graph
          </button>
        </div>
        <label className="sidebar__label" htmlFor="vizij-export-name">
          GLB file name
        </label>
        <div className="sidebar__form-row">
          <input
            id="vizij-export-name"
            type="text"
            value={exportFileName}
            placeholder="vizij-export.glb"
            onChange={(event) => onExportFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <button type="button" onClick={onExportGlb} disabled={!canExport}>
            Export GLB
          </button>
        </div>
        <p className="sidebar__hint">
          Export the graph JSON separately from the Vizij GLB to share both
          bindings and geometry.
        </p>
      </div>
    </section>
  );
}

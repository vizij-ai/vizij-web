interface RigGraphExportPanelProps {
  graphFileName: string;
  onGraphFileNameChange: (value: string) => void;
  canExport: boolean;
  onExportGraph: () => void;
}

export function RigGraphExportPanel({
  graphFileName,
  onGraphFileNameChange,
  canExport,
  onExportGraph,
}: RigGraphExportPanelProps) {
  return (
    <article className="asset-card">
      <header className="asset-card__header">
        <h2 className="asset-card__title">Rig Graph Export</h2>
        <p className="asset-card__description">
          Download the generated rig graph as a <code>.graph.json</code> file.
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
        <p className="asset-card__hint asset-card__hint--muted">
          Include when downstream tools rely on external rig graph files.
        </p>
      </div>
    </article>
  );
}

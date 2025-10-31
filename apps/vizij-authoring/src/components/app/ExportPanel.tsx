interface ExportPanelProps {
  exportFileName: string;
  onExportFileNameChange: (value: string) => void;
  canExport: boolean;
  onExportGlb: () => void;
  animationCount: number;
  includeBundle: boolean;
  onIncludeBundleChange: (value: boolean) => void;
  includeAnimations: boolean;
  onIncludeAnimationsChange: (value: boolean) => void;
}

export function ExportPanel({
  exportFileName,
  onExportFileNameChange,
  canExport,
  onExportGlb,
  animationCount,
  includeBundle,
  onIncludeBundleChange,
  includeAnimations,
  onIncludeAnimationsChange,
}: ExportPanelProps) {
  const animationsAvailable = animationCount > 0;

  return (
    <article className="asset-card">
      <header className="asset-card__header">
        <h2 className="asset-card__title">Export Vizij GLB</h2>
        <p className="asset-card__description">
          Save the current Vizij scene as a GLB. Optionally embed bundle data
          for round-tripping.
        </p>
      </header>

      <div className="asset-card__body asset-card__body--compact">
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
          Provides geometry, bindings, and optional Vizij bundle data in a
          single file.
        </p>
      </div>

      <div className="asset-card__body asset-card__body--compact">
        <p className="sidebar__label">Vizij bundle</p>
        <p className="asset-card__hint">
          Embed orchestrator graphs, pose configs, and stored Vizij clips for
          round-tripping while still producing standard glTF animations.
        </p>

        <label
          htmlFor="vizij-export-bundle-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            marginTop: "0.6rem",
            fontSize: "0.82rem",
          }}
        >
          <input
            id="vizij-export-bundle-toggle"
            type="checkbox"
            checked={includeBundle}
            onChange={(event) =>
              onIncludeBundleChange(event.currentTarget.checked)
            }
            disabled={!canExport}
          />
          <span>Embed Vizij bundle (graphs, poses, metadata)</span>
        </label>

        <label
          htmlFor="vizij-export-animations-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            marginTop: "0.45rem",
            fontSize: "0.82rem",
            opacity:
              includeBundle && animationsAvailable
                ? 1
                : includeBundle
                  ? 0.65
                  : 0.4,
          }}
        >
          <input
            id="vizij-export-animations-toggle"
            type="checkbox"
            checked={includeBundle && includeAnimations && animationsAvailable}
            onChange={(event) =>
              onIncludeAnimationsChange(event.currentTarget.checked)
            }
            disabled={!canExport || !includeBundle || !animationsAvailable}
          />
          <span>Preserve stored Vizij animations ({animationCount})</span>
        </label>
      </div>
    </article>
  );
}

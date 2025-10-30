import { ChangeEvent, useId, useState } from "react";

interface PoseRigImportPanelProps {
  onImportPoseConfig: (file: File) => Promise<void>;
  poseConfigWarnings: string[];
  disabled?: boolean;
}

interface PoseRigExportPanelProps {
  rigName: string;
  onRigNameChange: (value: string) => void;
  poseGraphFileName: string;
  onPoseGraphFileNameChange: (value: string) => void;
  poseConfigFileName: string;
  onPoseConfigFileNameChange: (value: string) => void;
  onExportPoseGraph: () => void;
  onExportPoseConfig: () => void;
  disabled?: boolean;
}

export function PoseRigImportPanel({
  onImportPoseConfig,
  poseConfigWarnings,
  disabled,
}: PoseRigImportPanelProps) {
  const [isImportingConfig, setIsImportingConfig] = useState(false);
  const configInputId = useId();

  const handleConfigImport = async (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || isImportingConfig) {
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      setIsImportingConfig(true);
      await onImportPoseConfig(file);
    } finally {
      setIsImportingConfig(false);
    }
  };

  return (
    <article className="asset-card">
      <div className="asset-card__body asset-card__body--compact">
        {/* <div className="asset-card__row">
          <div>
            <span className="asset-card__section-title">Pose Graph</span>
            <p className="asset-card__hint asset-card__hint--muted">
              Built inside Vizij for now. External import is planned.
            </p>
          </div>
          <button
            type="button"
            className="button subtle"
            disabled
            aria-disabled="true"
            title="Pose graph import is not yet available"
          >
            Coming soon
          </button>
        </div> */}

        <div className="asset-card__row">
          <div>
            <span className="asset-card__section-title">
              Load a pose config{" "}
              <span className="asset-card__tag">Optional</span>
            </span>
          </div>
          <input
            id={configInputId}
            type="file"
            accept="application/json"
            disabled={disabled || isImportingConfig}
            onChange={handleConfigImport}
          />
        </div>
        <p className="asset-card__hint asset-card__hint--muted">
          Only needed for legacy tutorials. Prefer rebuilding configs in the
          workbench.
        </p>
        {poseConfigWarnings.length > 0 && (
          <div className="pose-rig-warnings">
            <strong>Import warnings:</strong>
            <ul>
              {poseConfigWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

export function PoseRigExportPanel({
  rigName,
  onRigNameChange,
  poseGraphFileName,
  onPoseGraphFileNameChange,
  poseConfigFileName,
  onPoseConfigFileNameChange,
  onExportPoseGraph,
  onExportPoseConfig,
  disabled,
}: PoseRigExportPanelProps) {
  return (
    <article className="asset-card">
      <header className="asset-card__header">
        <h2 className="asset-card__title">Pose Rig Outputs</h2>
        <p className="asset-card__description">
          Name the bundle and export the generated pose rig files.
        </p>
      </header>
      <div className="asset-card__body asset-card__body--compact">
        <label className="field-label" htmlFor="pose-rig-name">
          Pose rig name
        </label>
        <input
          id="pose-rig-name"
          className="input"
          type="text"
          value={rigName}
          disabled={disabled}
          onChange={(event) => onRigNameChange(event.target.value)}
        />

        <label className="field-label" htmlFor="pose-rig-graph-file">
          Pose graph file
        </label>
        <div className="asset-card__form-row">
          <input
            id="pose-rig-graph-file"
            className="input"
            type="text"
            value={poseGraphFileName}
            disabled={disabled}
            onChange={(event) => onPoseGraphFileNameChange(event.target.value)}
          />
          <button
            type="button"
            className="button"
            onClick={onExportPoseGraph}
            disabled={disabled}
          >
            Export
          </button>
        </div>

        <label className="field-label" htmlFor="pose-rig-config-file">
          Pose config file <span className="asset-card__tag">Deprecated</span>
        </label>
        <div className="asset-card__form-row">
          <input
            id="pose-rig-config-file"
            className="input"
            type="text"
            value={poseConfigFileName}
            disabled={disabled}
            onChange={(event) => onPoseConfigFileNameChange(event.target.value)}
          />
          <button
            type="button"
            className="button primary"
            onClick={onExportPoseConfig}
            disabled={disabled}
          >
            Export
          </button>
        </div>
      </div>
    </article>
  );
}

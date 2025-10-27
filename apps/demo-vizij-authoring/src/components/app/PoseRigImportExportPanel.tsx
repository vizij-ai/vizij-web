import { ChangeEvent, useState } from "react";

interface PoseRigImportExportPanelProps {
  rigName: string;
  onRigNameChange: (value: string) => void;
  poseGraphFileName: string;
  onPoseGraphFileNameChange: (value: string) => void;
  poseConfigFileName: string;
  onPoseConfigFileNameChange: (value: string) => void;
  onExportPoseGraph: () => void;
  onExportPoseConfig: () => void;
  onImportPoseConfig: (file: File) => Promise<void>;
  poseConfigWarnings: string[];
  disabled?: boolean;
}

export function PoseRigImportExportPanel({
  rigName,
  onRigNameChange,
  poseGraphFileName,
  onPoseGraphFileNameChange,
  poseConfigFileName,
  onPoseConfigFileNameChange,
  onExportPoseGraph,
  onExportPoseConfig,
  onImportPoseConfig,
  poseConfigWarnings,
  disabled,
}: PoseRigImportExportPanelProps) {
  const [isImporting, setIsImporting] = useState(false);

  const handleImportChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    if (disabled || isImporting) {
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      setIsImporting(true);
      await onImportPoseConfig(file);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Pose Rig Export</h2>
        <p>
          Export pose graphs and configs or import an existing pose rig into the
          authoring session.
        </p>
      </header>
      <div className="panel__body panel__body--stacked">
        <label className="field-label" htmlFor="pose-rig-name">
          Pose Rig Name
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
          Pose Graph File Name
        </label>
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
          Export Pose Graph
        </button>

        <label className="field-label" htmlFor="pose-rig-config-file">
          Pose Config File Name
        </label>
        <input
          id="pose-rig-config-file"
          className="input"
          type="text"
          value={poseConfigFileName}
          disabled={disabled}
          onChange={(event) => onPoseConfigFileNameChange(event.target.value)}
        />

        <div className="pose-rig-import">
          <button
            type="button"
            className="button primary"
            onClick={onExportPoseConfig}
            disabled={disabled}
          >
            Export Pose Config
          </button>
          <label
            className="button subtle"
            aria-disabled={disabled || isImporting}
          >
            Import Pose Config
            <input
              type="file"
              accept="application/json"
              onChange={handleImportChange}
              disabled={disabled || isImporting}
              hidden
            />
          </label>
        </div>

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
    </section>
  );
}

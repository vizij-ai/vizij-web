import { ChangeEvent, useId, useState } from "react";
import { Button, Card, CardHeader, CardBody, Input, Chip } from "../ui";

interface PoseRigImportPanelProps {
  onImportPoseConfig: (file: File) => Promise<void>;
  onImportPoseGraph: (file: File) => Promise<void>;
  poseConfigWarnings: readonly string[];
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
  onImportPoseGraph,
  poseConfigWarnings,
  disabled,
}: PoseRigImportPanelProps) {
  const [isImportingConfig, setIsImportingConfig] = useState(false);
  const [isImportingGraph, setIsImportingGraph] = useState(false);
  const configInputId = useId();
  const graphInputId = useId();

  const handleGraphImport = async (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || isImportingGraph) {
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      setIsImportingGraph(true);
      await onImportPoseGraph(file);
    } finally {
      setIsImportingGraph(false);
    }
  };

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
    <Card>
      <CardBody className="asset-card__body--compact">
        <div className="asset-card__row">
          <div>
            <span className="asset-card__section-title">
              Load a pose graph <Chip tone="info">Beta</Chip>
            </span>
          </div>
          <Input
            id={graphInputId}
            type="file"
            accept="application/json,.graph.json"
            disabled={disabled || isImportingGraph}
            onChange={handleGraphImport}
          />
        </div>
        <p className="asset-card__hint asset-card__hint--muted">
          Import pose graphs exported from Vizij Authoring to reuse poses across
          faces.
        </p>

        <div className="asset-card__row">
          <div>
            <span className="asset-card__section-title">
              Load a pose config{" "}
              <span className="asset-card__tag">Optional</span>
            </span>
          </div>
          <Input
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
      </CardBody>
    </Card>
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
    <Card>
      <CardHeader>
        <h2 className="asset-card__title">Pose Rig Outputs</h2>
        <p className="asset-card__description">
          Name the bundle and export the generated pose rig files. Config is
          still experimental, may become primary or be dropped.
        </p>
      </CardHeader>
      <CardBody className="asset-card__body--compact">
        <label className="field-label" htmlFor="pose-rig-name">
          Pose rig name
        </label>
        <Input
          id="pose-rig-name"
          type="text"
          value={rigName}
          disabled={disabled}
          onChange={(event) => onRigNameChange(event.target.value)}
        />

        <label className="field-label" htmlFor="pose-rig-graph-file">
          Pose graph file
        </label>
        <div className="asset-card__form-row">
          <Input
            id="pose-rig-graph-file"
            type="text"
            value={poseGraphFileName}
            disabled={disabled}
            onChange={(event) => onPoseGraphFileNameChange(event.target.value)}
          />
          <Button onClick={onExportPoseGraph} disabled={disabled}>
            Export
          </Button>
        </div>

        <label className="field-label" htmlFor="pose-rig-config-file">
          Pose config file <Chip tone="muted">Optional</Chip>
        </label>
        <div className="asset-card__form-row">
          <Input
            id="pose-rig-config-file"
            type="text"
            value={poseConfigFileName}
            disabled={disabled}
            onChange={(event) => onPoseConfigFileNameChange(event.target.value)}
          />
          <Button
            variant="primary"
            onClick={onExportPoseConfig}
            disabled={disabled}
          >
            Export
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

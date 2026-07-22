import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import type { PoseDiagnostic } from "../../poseRig/types";
import { Button, Card, CardHeader, CardBody, Input, Chip } from "../ui";

interface PoseRigImportPanelProps {
  onImportPoseConfig: (file: File) => Promise<void>;
  onImportPoseGraph: (file: File) => Promise<void>;
  onImportPoseIr: (file: File) => Promise<void>;
  poseConfigWarnings: readonly string[];
  poseDiagnostics: readonly PoseDiagnostic[];
  poseIrEnabled?: boolean;
  poseIrSupportHint?: string;
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
  poseIrFileName: string;
  onPoseIrFileNameChange: (value: string) => void;
  onExportPoseIr: () => void;
  poseDiagnostics: readonly PoseDiagnostic[];
  poseIrEnabled?: boolean;
  poseIrSupportHint?: string;
  disabled?: boolean;
}

export function PoseRigImportPanel({
  onImportPoseConfig,
  onImportPoseGraph,
  onImportPoseIr,
  poseConfigWarnings,
  poseDiagnostics,
  poseIrEnabled = false,
  poseIrSupportHint,
  disabled,
}: PoseRigImportPanelProps) {
  const [isImportingConfig, setIsImportingConfig] = useState(false);
  const [isImportingGraph, setIsImportingGraph] = useState(false);
  const [isImportingPoseIr, setIsImportingPoseIr] = useState(false);
  const configInputId = useId();
  const graphInputId = useId();
  const poseIrInputId = useId();
  const errorDiagnostics = poseDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warningDiagnostics = poseDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const infoDiagnostics = poseDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "info",
  );

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

  const handlePoseIrImport = async (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || isImportingPoseIr || !poseIrEnabled) {
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      setIsImportingPoseIr(true);
      await onImportPoseIr(file);
    } finally {
      setIsImportingPoseIr(false);
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
            data-testid="import-pose-graph-input"
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
              Load Pose IR <Chip tone="info">Preview</Chip>
            </span>
          </div>
          <Input
            data-testid="import-pose-ir-input"
            id={poseIrInputId}
            type="file"
            accept="application/json,.ir.json,.pose-ir.json"
            disabled={disabled || isImportingPoseIr || !poseIrEnabled}
            onChange={handlePoseIrImport}
          />
        </div>
        <p className="asset-card__hint asset-card__hint--muted">
          {poseIrEnabled
            ? "Import Expression IR JSON snapshots when your core expression rig build exposes Expression IR hooks."
            : (poseIrSupportHint ??
              "Pose IR import is unavailable in this build.")}
        </p>

        <div className="asset-card__row">
          <div>
            <span className="asset-card__section-title">
              Load a pose config{" "}
              <span className="asset-card__tag">Optional</span>
            </span>
          </div>
          <Input
            data-testid="import-pose-config-input"
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
        {poseDiagnostics.length > 0 ? (
          <div className="pose-rig-warnings">
            <strong>Pose diagnostics:</strong>
            <ul>
              {poseDiagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.id}-${index}`}>
                  <span className="uppercase text-[10px] font-mono mr-1">
                    {diagnostic.severity}
                  </span>
                  <span className="font-mono text-[10px] mr-1">
                    [{diagnostic.code}]
                  </span>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
            <p className="asset-card__hint asset-card__hint--muted">
              {errorDiagnostics.length} errors · {warningDiagnostics.length}{" "}
              warnings · {infoDiagnostics.length} info
            </p>
          </div>
        ) : poseConfigWarnings.length > 0 ? (
          <div className="pose-rig-warnings">
            <strong>Import warnings:</strong>
            <ul>
              {poseConfigWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
  poseIrFileName,
  onPoseIrFileNameChange,
  onExportPoseIr,
  poseDiagnostics,
  poseIrEnabled = false,
  poseIrSupportHint,
  disabled,
}: PoseRigExportPanelProps) {
  const diagnosticErrors = poseDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const diagnosticWarnings = poseDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  );

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
          data-testid="pose-rig-name-input"
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
            data-testid="export-pose-graph-file-name"
            id="pose-rig-graph-file"
            type="text"
            value={poseGraphFileName}
            disabled={disabled}
            onChange={(event) => onPoseGraphFileNameChange(event.target.value)}
          />
          <Button
            data-testid="export-pose-graph-button"
            onClick={onExportPoseGraph}
            disabled={disabled}
          >
            Export
          </Button>
        </div>

        <label className="field-label" htmlFor="pose-rig-config-file">
          Pose config file <Chip tone="muted">Optional</Chip>
        </label>
        <div className="asset-card__form-row">
          <Input
            data-testid="export-pose-config-file-name"
            id="pose-rig-config-file"
            type="text"
            value={poseConfigFileName}
            disabled={disabled}
            onChange={(event) => onPoseConfigFileNameChange(event.target.value)}
          />
          <Button
            data-testid="export-pose-config-button"
            variant="primary"
            onClick={onExportPoseConfig}
            disabled={disabled}
          >
            Export
          </Button>
        </div>

        <label className="field-label" htmlFor="pose-rig-ir-file">
          Pose IR file <Chip tone="info">Preview</Chip>
        </label>
        <div className="asset-card__form-row">
          <Input
            data-testid="export-pose-ir-file-name"
            id="pose-rig-ir-file"
            type="text"
            value={poseIrFileName}
            disabled={disabled || !poseIrEnabled}
            onChange={(event) => onPoseIrFileNameChange(event.target.value)}
          />
          <Button
            data-testid="export-pose-ir-button"
            variant="secondary"
            onClick={onExportPoseIr}
            disabled={disabled || !poseIrEnabled}
          >
            Export
          </Button>
        </div>
        {!poseIrEnabled && poseIrSupportHint ? (
          <p className="asset-card__hint asset-card__hint--muted">
            {poseIrSupportHint}
          </p>
        ) : null}
        {poseDiagnostics.length > 0 ? (
          <div className="pose-rig-warnings">
            <strong>Pose diagnostics in draft:</strong>
            <p className="asset-card__hint asset-card__hint--muted">
              {diagnosticErrors.length} errors · {diagnosticWarnings.length}{" "}
              warnings
            </p>
            {diagnosticErrors.length > 0 ? (
              <p className="asset-card__hint">
                Resolve error diagnostics before relying on exported artifacts.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

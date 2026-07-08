import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Input,
  Switch,
  FieldRow,
} from "../ui";

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
  blendMode: "average" | "additive";
  onBlendModeChange: (mode: "average" | "additive") => void;
  crossGroupBlendMode: "average" | "additive";
  onCrossGroupBlendModeChange: (mode: "average" | "additive") => void;
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
  blendMode,
  onBlendModeChange,
  crossGroupBlendMode,
  onCrossGroupBlendModeChange,
}: ExportPanelProps) {
  const animationsAvailable = animationCount > 0;

  return (
    <Card>
      <CardHeader>
        <p className="asset-card__description">
          Save the current Vizij scene as a GLB. Optionally embed bundle data
          for round-tripping.
        </p>
      </CardHeader>

      <CardBody className="asset-card__body--compact">
        <div className="asset-card__form-row">
          <Input
            data-testid="export-glb-file-name"
            id="vizij-export-name"
            type="text"
            value={exportFileName}
            placeholder="vizij_scene.glb"
            onChange={(event) => onExportFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <Button
            data-testid="export-glb-button"
            variant="primary"
            onClick={onExportGlb}
            disabled={!canExport}
          >
            Export
          </Button>
        </div>
      </CardBody>

      <CardBody className="asset-card__body--compact">
        <FieldRow
          label="Embed Vizij bundle"
          hint="Graphs, poses, metadata"
          renderLabelInControl
          control={
            <Switch
              data-testid="export-embed-bundle-toggle"
              id="vizij-export-bundle-toggle"
              checked={includeBundle}
              onChange={onIncludeBundleChange}
              disabled={!canExport}
              size="sm"
            />
          }
        />
        <p className="asset-card__hint">
          Embeds orchestrator graphs, pose configs, and stored Vizij clips for
          round-tripping while still producing standard glTF animations.
        </p>
        <FieldRow
          label="Pose group blend mode"
          hint="Controls how poses blend within each pose group."
          renderLabelInControl
          control={
            <div className="button-group button-group--segmented">
              <Button
                size="sm"
                variant={blendMode === "average" ? "primary" : "subtle"}
                onClick={() => onBlendModeChange("average")}
                disabled={!includeBundle || !canExport}
              >
                Average
              </Button>
              <Button
                size="sm"
                variant={blendMode === "additive" ? "primary" : "subtle"}
                onClick={() => onBlendModeChange("additive")}
                disabled={!includeBundle || !canExport}
              >
                Additive
              </Button>
            </div>
          }
        />
        <FieldRow
          label="Cross-group blend mode"
          hint="Controls how pose-group outputs combine per rig target."
          renderLabelInControl
          control={
            <div className="button-group button-group--segmented">
              <Button
                size="sm"
                variant={
                  crossGroupBlendMode === "additive" ? "primary" : "subtle"
                }
                onClick={() => onCrossGroupBlendModeChange("additive")}
                disabled={!includeBundle || !canExport}
              >
                Additive
              </Button>
              <Button
                size="sm"
                variant={
                  crossGroupBlendMode === "average" ? "primary" : "subtle"
                }
                onClick={() => onCrossGroupBlendModeChange("average")}
                disabled={!includeBundle || !canExport}
              >
                Average
              </Button>
            </div>
          }
        />
        <FieldRow
          label={`Preserve stored Vizij animations (${animationCount})`}
          renderLabelInControl
          control={
            <Switch
              data-testid="export-include-animations-toggle"
              id="vizij-export-animations-toggle"
              checked={
                includeBundle && includeAnimations && animationsAvailable
              }
              onChange={onIncludeAnimationsChange}
              disabled={!canExport || !includeBundle || !animationsAvailable}
              size="sm"
            />
          }
        />
      </CardBody>
    </Card>
  );
}

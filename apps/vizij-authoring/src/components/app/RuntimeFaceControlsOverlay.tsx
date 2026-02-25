import { useVizijRuntime } from "@vizij/runtime-react";
import { Button, Chip } from "../ui";

type LegacyMigrationSummary = {
  totalLegacy: number;
  migrated: number;
  convertible: number;
  nonConvertible: number;
};

export type RuntimeFaceControlsOverlayProps = {
  onResetInputs?: () => void;
  onToggleSplit?: () => void;
  splitVertical?: boolean;
  showReadyFlag?: boolean;
  resetButtonLabel?: string;
  resetButtonTitle?: string;
  migrationSummary?: LegacyMigrationSummary | null;
  onMigrateAllLegacyBindings?: () => void;
};

export function RuntimeFaceControlsOverlay({
  onResetInputs,
  onToggleSplit,
  splitVertical = false,
  showReadyFlag = true,
  resetButtonLabel = "Reset Inputs",
  resetButtonTitle = "Reset graph inputs to their default values",
  migrationSummary = null,
  onMigrateAllLegacyBindings,
}: RuntimeFaceControlsOverlayProps) {
  const { ready, loading, stepHz } = useVizijRuntime();

  if (!ready || loading) {
    return null;
  }

  const hasMigrationSummary = Boolean(
    migrationSummary && migrationSummary.totalLegacy > 0,
  );
  const formattedFps =
    stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  return (
    <div className="absolute top-2 left-2 right-2 z-10 flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        {showReadyFlag && (
          <div className="flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Ready
          </div>
        )}
        <div className="rounded bg-black/60 px-2 py-1 text-[10px] text-white">
          FPS: {formattedFps}
        </div>
        {onResetInputs && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onResetInputs}
            title={resetButtonTitle}
          >
            {resetButtonLabel}
          </Button>
        )}
        {onToggleSplit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSplit}
            title={
              splitVertical
                ? "Switch to horizontal split"
                : "Switch to vertical split"
            }
          >
            {splitVertical ? "⬌" : "⬍"}
          </Button>
        )}
      </div>
      {hasMigrationSummary && migrationSummary ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5 rounded bg-black/60 px-2 py-1">
          <Chip tone="default">Legacy {migrationSummary.totalLegacy}</Chip>
          <Chip tone="success">Migrated {migrationSummary.migrated}</Chip>
          <Chip tone="info">Convertible {migrationSummary.convertible}</Chip>
          <Chip tone="warning">
            Non-convertible {migrationSummary.nonConvertible}
          </Chip>
          {onMigrateAllLegacyBindings && migrationSummary.convertible > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onMigrateAllLegacyBindings}
              data-testid="runtime-migrate-all-legacy-action"
            >
              Migrate All ({migrationSummary.convertible})
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

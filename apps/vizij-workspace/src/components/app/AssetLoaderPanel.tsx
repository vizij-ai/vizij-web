import type { ChangeEvent } from "react";
import { Button, Panel, Input, Switch } from "../ui";

interface AssetLoaderPanelProps {
  isLoading: boolean;
  error: string | null;
  onSelectFile: (file: File) => void;
  onClearError: () => void;
  skipDiscrepancyCheck: boolean;
  onSkipDiscrepancyCheckChange: (value: boolean) => void;
}

export function AssetLoaderPanel({
  isLoading,
  error,
  onSelectFile,
  onClearError,
  skipDiscrepancyCheck,
  onSkipDiscrepancyCheckChange,
}: AssetLoaderPanelProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    onSelectFile(file);
    event.target.value = "";
  };

  return (
    <Panel
      title="Asset Loader"
      description="Supports high-poly GLBs exported from Vizij or other DCC tools."
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
          htmlFor="vizij-file"
        >
          Load a GLB
        </label>
        <Input
          id="vizij-file"
          type="file"
          accept=".glb,.gltf"
          onChange={handleFileChange}
          disabled={isLoading}
          className="bg-slate-950/50 border-slate-800"
        />
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-800/50">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-slate-200">
            Skip Discrepancy Check
          </span>
          <span className="text-[10px] text-slate-500">
            Regenerate rig directly from GLB
          </span>
        </div>
        <Switch
          checked={skipDiscrepancyCheck}
          onChange={onSkipDiscrepancyCheckChange}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div
          className="flex flex-col gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] hover:bg-red-500/20 text-red-300"
              onClick={onClearError}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

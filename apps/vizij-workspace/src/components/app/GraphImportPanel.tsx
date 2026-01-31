import type { ChangeEvent } from "react";
import { Panel, Input, Chip } from "../ui";

interface GraphImportPanelProps {
  onSelectGraphFile: (file: File) => void;
  disabled?: boolean;
}

export function GraphImportPanel({
  onSelectGraphFile,
  disabled = false,
}: GraphImportPanelProps) {
  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectGraphFile(file);
      event.target.value = "";
    }
  };

  return (
    <Panel
      title="Rig Graph"
      description="Expect a .graph.json file exported alongside the Vizij GLB."
      badge={<Chip tone="muted">Optional</Chip>}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
          htmlFor="rig-graph-file"
        >
          Load a rig graph
        </label>
        <Input
          id="rig-graph-file"
          type="file"
          accept=".json,.graph.json"
          disabled={disabled}
          onChange={handleSelect}
          className="bg-slate-950/50 border-slate-800"
        />
      </div>
    </Panel>
  );
}

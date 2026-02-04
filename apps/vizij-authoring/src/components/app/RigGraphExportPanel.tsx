import { Button, Input, Panel } from "../ui";

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
    <Panel
      title="Rig Graph Export"
      description="Download the generated rig graph as a .graph.json file."
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
          htmlFor="vizij-graph-name"
        >
          Rig graph file
        </label>
        <div className="flex gap-2">
          <Input
            id="vizij-graph-name"
            type="text"
            className="flex-1 bg-slate-950/50 border-slate-800"
            value={graphFileName}
            placeholder="vizij_rig.graph.json"
            onChange={(event) => onGraphFileNameChange(event.target.value)}
            disabled={!canExport}
            spellCheck={false}
          />
          <Button onClick={onExportGraph} disabled={!canExport}>
            Export
          </Button>
        </div>
        <p className="text-[10px] text-slate-500 italic">
          Include when downstream tools rely on external rig graph files.
        </p>
      </div>
    </Panel>
  );
}

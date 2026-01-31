import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
} from "../ui";

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
    <Card>
      <CardHeader>
        <CardTitle>Rig Graph Export</CardTitle>
        <CardDescription>
          Download the generated rig graph as a <code>.graph.json</code> file.
        </CardDescription>
      </CardHeader>
      <CardBody compact>
        <label className="sidebar__label" htmlFor="vizij-graph-name">
          Rig graph file
        </label>
        <div className="asset-card__form-row">
          <Input
            id="vizij-graph-name"
            type="text"
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
        <p className="asset-card__hint asset-card__hint--muted">
          Include when downstream tools rely on external rig graph files.
        </p>
      </CardBody>
    </Card>
  );
}

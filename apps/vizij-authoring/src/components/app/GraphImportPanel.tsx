import type { ChangeEvent } from "react";
import { Card, CardBody, Input, Chip } from "../ui";

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
    <Card>
      <CardBody className="asset-card__body--compact">
        <div className="asset-card__group">
          <label className="sidebar__label" htmlFor="rig-graph-file">
            Load a rig graph <Chip tone="muted">Optional</Chip>
          </label>
          <Input
            id="rig-graph-file"
            type="file"
            accept=".json,.graph.json"
            disabled={disabled}
            onChange={handleSelect}
          />
        </div>

        <p className="asset-card__hint asset-card__hint--muted">
          Expect a <code>.graph.json</code> file exported alongside the Vizij
          GLB.
        </p>
      </CardBody>
    </Card>
  );
}

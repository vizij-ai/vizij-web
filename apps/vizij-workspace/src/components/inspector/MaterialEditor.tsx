import { useEffect, useMemo, useState } from "react";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { FieldRow, Button, Select } from "../ui";

interface MaterialEditorProps {
  node: {
    id: string;
    name: string;
    type: string;
  };
}

export function MaterialEditor({ node }: MaterialEditorProps) {
  const { materials, assignMaterial, duplicateMaterial } = useSceneComposer();
  const [materialLabel, setMaterialLabel] = useState(
    node.name ? `${node.name} material` : "New material",
  );

  useEffect(() => {
    setMaterialLabel(node.name ? `${node.name} material` : "New material");
  }, [node.id, node.name]);

  const currentMaterial = useMemo(
    () =>
      materials.find((entry) => entry.memberShapeIds.includes(node.id)) ?? null,
    [materials, node.id],
  );

  if (node.type !== "shape") {
    return null;
  }

  return (
    <div className="material-editor">
      <FieldRow
        label="Material"
        hint="Shared color/opacity and surfacing values"
        renderLabelInControl
        control={
          <Select
            value={currentMaterial?.id ?? ""}
            onChange={(value) => assignMaterial(node.id, value)}
            options={materials.length === 0 ? [
              { value: "", label: "No materials detected", disabled: true }
            ] : materials.map((material) => ({
              value: material.id,
              label: `${material.label} (${material.memberShapeIds.length})`,
            }))}
            size="sm"
          />
        }
      />

      <div className="material-editor__row">
        <input
          type="text"
          value={materialLabel}
          onChange={(event) => setMaterialLabel(event.target.value)}
          placeholder="New material label"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const label = materialLabel.trim();
            duplicateMaterial(node.id, {
              label: label.length > 0 ? label : undefined,
            });
          }}
        >
          Duplicate material for this shape
        </Button>
      </div>
    </div>
  );
}

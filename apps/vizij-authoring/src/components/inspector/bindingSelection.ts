import type { SceneObjectNode } from "../../scene/sceneGraph";
import type { VariableSelection } from "./VariableSelector";

type PropertySelection = Extract<VariableSelection, { type: "property" }>;

export function resolveSelectionTargetIds(
  selection: PropertySelection,
  objects: SceneObjectNode[],
): string[] {
  if (selection.targetId) {
    return [selection.targetId];
  }

  if (selection.targetIds && selection.targetIds.length > 0) {
    return Array.from(new Set(selection.targetIds.filter(Boolean)));
  }

  const objectNode = objects.find((entry) => entry.id === selection.objectId);
  const featureNode = objectNode?.features.find(
    (entry) => entry.id === selection.featureId,
  );
  if (!featureNode) {
    return [];
  }

  return Array.from(
    new Set(
      featureNode.components
        .map((component) => component.targetId)
        .filter((targetId): targetId is string => Boolean(targetId)),
    ),
  );
}

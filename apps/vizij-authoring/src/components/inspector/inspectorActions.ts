import type { SceneObjectNode } from "../../scene/sceneGraph";
import type { VariableSelection } from "./VariableSelector";
import { resolveSelectionTargetIds } from "./bindingSelection";

export type RigDrivenSelectionResolution =
  | {
      kind: "variable";
      childInputId: string;
    }
  | {
      kind: "self-variable";
    }
  | {
      kind: "property";
      targetIds: string[];
    }
  | {
      kind: "empty-property";
    };

export function resolveRigDrivenSelection(
  selection: VariableSelection,
  selectedRigId: string,
  objects: SceneObjectNode[],
): RigDrivenSelectionResolution {
  if (selection.type === "variable") {
    if (selection.id === selectedRigId) {
      return { kind: "self-variable" };
    }
    return {
      kind: "variable",
      childInputId: selection.id,
    };
  }

  const targetIds = resolveSelectionTargetIds(selection, objects);
  if (targetIds.length === 0) {
    return { kind: "empty-property" };
  }
  return {
    kind: "property",
    targetIds,
  };
}

export type PoseParentBindingEmptyState = "root" | "unlinked";

export function classifyPoseParentBindingEmptyState(
  drivenVariableCount: number,
  drivenPropertyCount: number,
): PoseParentBindingEmptyState {
  return drivenVariableCount > 0 || drivenPropertyCount > 0
    ? "root"
    : "unlinked";
}

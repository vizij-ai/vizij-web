import type { SceneObjectNode } from "../../scene/sceneGraph";
import type { VariableSelection } from "./VariableSelector";
import { resolveSelectionTargetIds } from "./bindingSelection";

type RigDrivenSelectorSelection = Exclude<VariableSelection, { type: "mixed" }>;

export type RigDrivenSelectionResolution =
  | {
      kind: "variable";
      childInputIds: string[];
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
  selection: RigDrivenSelectorSelection,
  selectedRigId: string,
  objects: SceneObjectNode[],
): RigDrivenSelectionResolution {
  if (selection.type === "variable") {
    const selectedInputIds = Array.from(
      new Set(
        (selection.ids && selection.ids.length > 0
          ? selection.ids
          : [selection.id]
        )
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );
    const childInputIds = selectedInputIds.filter((id) => id !== selectedRigId);
    if (childInputIds.length === 0) {
      return { kind: "self-variable" };
    }
    return {
      kind: "variable",
      childInputIds,
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

interface BindingSlotLike {
  inputId?: string | null;
}

interface InputBindingLike {
  inputId?: string | null;
  slots?: BindingSlotLike[] | null;
}

function normalizeInputToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "_")
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function hasParentBindingInput(
  binding: InputBindingLike | null | undefined,
  parentInputId: string,
): boolean {
  if (!binding) {
    return false;
  }

  const normalizedParent = normalizeInputToken(parentInputId);
  if (!normalizedParent) {
    return false;
  }

  if (normalizeInputToken(binding.inputId) === normalizedParent) {
    return true;
  }

  if (!Array.isArray(binding.slots)) {
    return false;
  }

  return binding.slots.some(
    (slot) => normalizeInputToken(slot.inputId) === normalizedParent,
  );
}

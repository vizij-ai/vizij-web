import type { StandardRigInput } from "@vizij/utils";
import { resolveRigMetadataInputId } from "../../utils/rigElementInputs";
import type { VariableSelection } from "./VariableSelector";

interface ResolvePosePropertySelectionInputIdsParams {
  selection: Extract<VariableSelection, { type: "property" }>;
  standardInputsById: ReadonlyMap<string, StandardRigInput>;
  fallbackTargetIds: readonly string[];
  propsrigInputIdByComponentId: ReadonlyMap<string, string>;
}

export function resolvePosePropertySelectionInputIds({
  selection,
  standardInputsById,
  fallbackTargetIds,
  propsrigInputIdByComponentId,
}: ResolvePosePropertySelectionInputIdsParams): string[] {
  const resolvedInputIds = new Set<string>();

  const addResolvedInputId = (candidateInputId: string | null | undefined) => {
    if (!candidateInputId) {
      return;
    }
    const canonicalInputId = resolveRigMetadataInputId(
      candidateInputId,
      standardInputsById as Map<string, StandardRigInput>,
    );
    if (!standardInputsById.has(canonicalInputId)) {
      return;
    }
    resolvedInputIds.add(canonicalInputId);
  };

  addResolvedInputId(selection.inputId);
  (selection.inputIds ?? []).forEach((inputId) => {
    addResolvedInputId(inputId);
  });

  if (resolvedInputIds.size === 0) {
    fallbackTargetIds.forEach((targetId) => {
      addResolvedInputId(propsrigInputIdByComponentId.get(targetId));
    });
  }

  return Array.from(resolvedInputIds).sort((left, right) =>
    left.localeCompare(right),
  );
}

import { useMemo } from "react";
import {
  bindingTargetFromInput,
  ensureBindingStructure,
  bindingToDefinition,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
import type { AutoRigInputBlueprint } from "../rig/autoInputs";
import type { AutoInputState } from "../types/autoInputs";
import type { ManagedStandardInput } from "../types/standardInputs";

interface UseManagedStandardInputsOptions {
  autoBlueprints: AutoRigInputBlueprint[];
  autoInputs: Map<string, AutoInputState>;
  customInputs: StandardRigInput[];
  inputBindings: InputBindingMap;
  disabledStandardInputIds: readonly string[];
  resolvePersistedAutoKey: (
    sourceId?: string | null,
    sourcePath?: string | null,
  ) => string | null;
}

export function useManagedStandardInputs(
  options: UseManagedStandardInputsOptions,
): ManagedStandardInput[] {
  const {
    autoBlueprints,
    autoInputs,
    customInputs,
    inputBindings,
    disabledStandardInputIds,
    resolvePersistedAutoKey,
  } = options;

  const derivedChildrenMap = useMemo(() => {
    const working = new Map<string, Set<string>>();

    const record = (sourceId: string | null | undefined, childId: string) => {
      if (!sourceId || sourceId === SELF_BINDING_ID) {
        return;
      }
      let set = working.get(sourceId);
      if (!set) {
        set = new Set<string>();
        working.set(sourceId, set);
      }
      set.add(childId);
    };

    Object.entries(inputBindings).forEach(([derivedId, binding]) => {
      record(binding?.inputId, derivedId);
      binding?.slots.forEach((slot) => {
        record(slot.inputId, derivedId);
      });
    });

    const result = new Map<string, string[]>();
    working.forEach((value, key) => {
      result.set(key, Array.from(value));
    });
    return result;
  }, [inputBindings]);

  const disabledInputSet = useMemo(
    () => new Set(disabledStandardInputIds),
    [disabledStandardInputIds],
  );

  return useMemo(() => {
    const entries: ManagedStandardInput[] = [];
    const handledAutoKeys = new Set<string>();
    const autoInputsBySourceId = new Map<string, AutoInputState>();
    const autoInputsBySourcePath = new Map<string, AutoInputState>();

    autoInputs.forEach((entry) => {
      if (entry.sourceId) {
        autoInputsBySourceId.set(entry.sourceId, entry);
      }
      autoInputsBySourcePath.set(entry.sourcePath, entry);
    });

    const enhanceInput = (input: StandardRigInput): StandardRigInput => {
      const binding = inputBindings[input.id];
      const target = bindingTargetFromInput(input);
      const normalized = binding
        ? ensureBindingStructure(binding, target)
        : null;
      const parentBinding = normalized ? bindingToDefinition(normalized) : null;
      const children = derivedChildrenMap.get(input.id);
      return {
        ...input,
        parentBinding,
        derivedChildren: children ? [...children] : [],
      };
    };

    autoBlueprints.forEach((blueprint) => {
      const entry =
        (blueprint.sourceId && autoInputsBySourceId.get(blueprint.sourceId)) ??
        autoInputsBySourcePath.get(blueprint.path) ??
        autoInputs.get(blueprint.path);
      if (!entry) {
        return;
      }
      const handledKey = resolvePersistedAutoKey(
        entry.sourceId,
        entry.sourcePath,
      );
      if (handledKey) {
        handledAutoKeys.add(handledKey);
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
        disabled: disabledInputSet.has(entry.input.id),
      });
    });

    autoInputs.forEach((entry) => {
      const handledKey = resolvePersistedAutoKey(
        entry.sourceId,
        entry.sourcePath,
      );
      if (handledKey && handledAutoKeys.has(handledKey)) {
        return;
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
        disabled: disabledInputSet.has(entry.input.id),
      });
    });

    customInputs.forEach((input) => {
      entries.push({
        input: enhanceInput(input),
        source: "custom",
        disabled: disabledInputSet.has(input.id),
      });
    });

    return entries;
  }, [
    autoBlueprints,
    autoInputs,
    customInputs,
    derivedChildrenMap,
    disabledInputSet,
    inputBindings,
    resolvePersistedAutoKey,
  ]);
}

import {
  bindingTargetFromComponent,
  bindingTargetFromInput,
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
  type BindingTarget,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent,
  RigBindingDefinition,
  StandardRigInput,
} from "@vizij/utils";
import {
  remapPipelineMetadataInputIds,
  type VizijPipelineMetadataV1,
} from "./standardInputRemap";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function appendStandardInputPathSuffix(
  path: string,
  suffix: string,
): string {
  const trimmed = path.trim();
  if (trimmed === "/") {
    return `/${suffix.replace(/^_*/, "")}`;
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    return `/${suffix.replace(/^_*/, "")}`;
  }
  const targetIndex = segments.length - 1;
  segments[targetIndex] = `${segments[targetIndex]}${suffix}`;
  return `/${segments.join("/")}`;
}

export function remapInputIdList(
  values: readonly string[],
  idRemap: ReadonlyMap<string, string>,
): string[] {
  if (idRemap.size === 0 || values.length === 0) {
    return [...values];
  }
  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const mapped = idRemap.get(value) ?? value;
    if (seen.has(mapped)) {
      return;
    }
    seen.add(mapped);
    next.push(mapped);
  });
  return next;
}

export function remapInputIdSet(
  values: ReadonlySet<string>,
  idRemap: ReadonlyMap<string, string>,
): Set<string> {
  if (idRemap.size === 0 || values.size === 0) {
    return new Set(values);
  }
  const next = new Set<string>();
  values.forEach((value) => {
    next.add(idRemap.get(value) ?? value);
  });
  return next;
}

export function remapStandardInputValues(
  values: StandardInputValues,
  idRemap: ReadonlyMap<string, string>,
): StandardInputValues {
  if (idRemap.size === 0) {
    return values;
  }
  let changed = false;
  const next: StandardInputValues = {};
  Object.entries(values).forEach(([rawInputId, value]) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    if (mappedInputId !== rawInputId) {
      changed = true;
    }
    if (
      mappedInputId !== rawInputId &&
      Object.prototype.hasOwnProperty.call(values, mappedInputId)
    ) {
      return;
    }
    next[mappedInputId] = value;
  });
  return changed ? next : values;
}

export function remapBindingMetadataInputIds(
  metadata: AnimatableBinding["metadata"],
  idRemap: ReadonlyMap<string, string>,
): AnimatableBinding["metadata"] {
  if (!metadata || idRemap.size === 0) {
    return metadata;
  }
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) {
    return metadata;
  }
  const vizij = asRecord(metadataRecord.vizij);
  const pipeline = vizij
    ? remapPipelineMetadataInputIds(
        asRecord(vizij.pipelineV1) as VizijPipelineMetadataV1 | null,
        idRemap,
      )
    : null;
  if (!pipeline || pipeline === vizij?.pipelineV1) {
    return metadata;
  }
  return {
    ...metadataRecord,
    vizij: {
      ...(vizij ?? {}),
      pipelineV1: pipeline,
    },
  };
}

export function remapBindingInputIds(
  binding: AnimatableBinding,
  target: BindingTarget,
  idRemap: ReadonlyMap<string, string>,
): AnimatableBinding {
  if (idRemap.size === 0) {
    return ensureBindingStructure(binding, target);
  }
  const ensured = ensureBindingStructure(binding, target);
  let changed = false;

  const nextInputId =
    ensured.inputId && idRemap.has(ensured.inputId)
      ? (idRemap.get(ensured.inputId) ?? ensured.inputId)
      : ensured.inputId;
  if (nextInputId !== ensured.inputId) {
    changed = true;
  }
  if (ensured.targetId !== target.id) {
    changed = true;
  }

  const nextSlots = ensured.slots.map((slot) => {
    if (!slot.inputId) {
      return slot;
    }
    const mapped = idRemap.get(slot.inputId);
    if (!mapped || mapped === slot.inputId) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      inputId: mapped,
    };
  });

  if (!changed) {
    const remappedMetadata = remapBindingMetadataInputIds(
      ensured.metadata,
      idRemap,
    );
    if (remappedMetadata === ensured.metadata) {
      return ensured;
    }
    return {
      ...ensured,
      metadata: remappedMetadata,
      targetId: target.id,
    };
  }

  return ensureBindingStructure(
    {
      ...ensured,
      inputId: nextInputId ?? null,
      slots: nextSlots,
      metadata: remapBindingMetadataInputIds(ensured.metadata, idRemap),
      targetId: target.id,
    },
    target,
  );
}

export function remapAnimatableBindings(
  bindings: BindingMap,
  componentsById: ReadonlyMap<string, AnimatableComponent>,
  idRemap: ReadonlyMap<string, string>,
): BindingMap {
  if (idRemap.size === 0) {
    return bindings;
  }
  let changed = false;
  const next: BindingMap = {};
  Object.entries(bindings).forEach(([targetId, binding]) => {
    if (!binding) {
      return;
    }
    const component = componentsById.get(targetId);
    if (!component) {
      next[targetId] = binding;
      return;
    }
    const remapped = remapBindingInputIds(
      binding,
      bindingTargetFromComponent(component),
      idRemap,
    );
    if (remapped !== binding) {
      changed = true;
    }
    next[targetId] = remapped;
  });
  return changed ? next : bindings;
}

export function remapInputBindings(
  inputBindings: InputBindingMap,
  standardInputsById: ReadonlyMap<string, StandardRigInput>,
  idRemap: ReadonlyMap<string, string>,
): InputBindingMap {
  if (idRemap.size === 0) {
    return inputBindings;
  }
  let changed = false;
  const next: InputBindingMap = {};
  Object.entries(inputBindings).forEach(([rawInputId, binding]) => {
    if (!binding) {
      return;
    }
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    const input = standardInputsById.get(mappedInputId);
    if (!input) {
      changed = true;
      return;
    }
    const remappedBinding = remapBindingInputIds(
      binding,
      bindingTargetFromInput(input),
      idRemap,
    );
    if (mappedInputId !== rawInputId || remappedBinding !== binding) {
      changed = true;
    }
    next[mappedInputId] = remappedBinding;
  });
  return changed ? next : inputBindings;
}

export function remapBindingDefinition(
  definition: RigBindingDefinition,
  idRemap: ReadonlyMap<string, string>,
): RigBindingDefinition {
  if (idRemap.size === 0) {
    return definition;
  }
  let changed = false;
  const nextInputId =
    definition.inputId && idRemap.has(definition.inputId)
      ? (idRemap.get(definition.inputId) ?? definition.inputId)
      : definition.inputId;
  if (nextInputId !== definition.inputId) {
    changed = true;
  }
  const nextSlots = definition.slots.map((slot) => {
    if (!slot.inputId) {
      return slot;
    }
    const mapped = idRemap.get(slot.inputId);
    if (!mapped || mapped === slot.inputId) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      inputId: mapped,
    };
  });
  if (!changed) {
    const remappedMetadata = remapBindingMetadataInputIds(
      definition.metadata,
      idRemap,
    );
    if (remappedMetadata === definition.metadata) {
      return definition;
    }
    return {
      ...definition,
      metadata: remappedMetadata,
    };
  }
  return {
    ...definition,
    inputId: nextInputId ?? null,
    slots: nextSlots,
    metadata: remapBindingMetadataInputIds(definition.metadata, idRemap),
  };
}

export function remapBindingDefinitionRecord(
  record: Record<string, RigBindingDefinition> | null,
  idRemap: ReadonlyMap<string, string>,
): Record<string, RigBindingDefinition> | null {
  if (!record || idRemap.size === 0) {
    return record;
  }
  let changed = false;
  const next: Record<string, RigBindingDefinition> = {};
  Object.entries(record).forEach(([rawInputId, definition]) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    const remappedDefinition = remapBindingDefinition(definition, idRemap);
    if (mappedInputId !== rawInputId || remappedDefinition !== definition) {
      changed = true;
    }
    next[mappedInputId] = remappedDefinition;
  });
  return changed ? next : record;
}

export function remapBindingDefinitionCache(
  cache: ReadonlyMap<string, RigBindingDefinition>,
  idRemap: ReadonlyMap<string, string>,
): Map<string, RigBindingDefinition> {
  if (idRemap.size === 0 || cache.size === 0) {
    return new Map(cache);
  }
  const next = new Map<string, RigBindingDefinition>();
  cache.forEach((definition, rawInputId) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    next.set(mappedInputId, remapBindingDefinition(definition, idRemap));
  });
  return next;
}

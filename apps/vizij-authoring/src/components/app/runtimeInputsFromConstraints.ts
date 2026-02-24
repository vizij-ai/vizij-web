import {
  createStandardRigInputFromPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export interface RuntimeInputConstraint {
  min?: number;
  max?: number;
  defaultValue?: number;
}

export interface RuntimeInputCatalog {
  inputs: StandardRigInput[];
  byId: Map<string, StandardRigInput>;
  byPath: Map<string, StandardRigInput>;
}

export function buildRuntimeInputCatalogFromConstraints(
  inputConstraints: Record<string, RuntimeInputConstraint> | null | undefined,
): RuntimeInputCatalog {
  if (!inputConstraints) {
    return {
      inputs: [],
      byId: new Map(),
      byPath: new Map(),
    };
  }

  const byId = new Map<string, StandardRigInput>();
  const byPath = new Map<string, StandardRigInput>();

  for (const [fullPath, constraint] of Object.entries(inputConstraints)) {
    if (!fullPath || fullPath.trim().length === 0) {
      continue;
    }

    const normalizedPath = normalizeStandardRigInputPath(fullPath);
    if (!normalizedPath || normalizedPath === "/custom/input") {
      continue;
    }
    if (byPath.has(normalizedPath)) {
      continue;
    }

    const input = createStandardRigInputFromPath(normalizedPath);
    if (constraint.min !== undefined || constraint.max !== undefined) {
      input.range = {
        min: constraint.min ?? input.range.min,
        max: constraint.max ?? input.range.max,
      };
    }
    if (constraint.defaultValue !== undefined) {
      input.defaultValue = constraint.defaultValue;
    }

    byPath.set(input.path, input);
    byId.set(input.id, input);
  }

  const inputs = Array.from(byId.values()).sort((a, b) => {
    const groupCompare = a.group.localeCompare(b.group);
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return a.label.localeCompare(b.label);
  });

  return {
    inputs,
    byId,
    byPath,
  };
}

import {
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
  type StandardRigInput,
} from "@vizij/utils";
import { extractStandardInputSubgroups } from "./standardInputs";

export interface StandardInputCollectionEntry {
  input: StandardRigInput;
  source?: "auto" | "custom" | "preset";
  disabled?: boolean;
  metadata?: {
    elementId?: string | null;
    elementType?: string | null;
    root?: string | null;
  } | null;
}

export interface StandardInputCollectionMetadata {
  source?: "auto" | "custom" | "preset";
  root?: string;
}

export interface StandardInputCollectionIndex {
  activeEntries: StandardInputCollectionEntry[];
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  standardInputsByPath: Map<string, StandardRigInput>;
  standardInputMetadataById: Map<string, StandardInputCollectionMetadata>;
  elementRootLookup: Map<string, readonly string[]>;
  allStandardInputSubgroups: Set<string>;
}

export function buildStandardInputCollectionIndex({
  entries,
  groupFallback,
}: {
  entries: readonly StandardInputCollectionEntry[];
  groupFallback: string;
}): StandardInputCollectionIndex {
  const activeEntries = entries.filter((entry) => !entry.disabled);
  const standardInputs = activeEntries.map((entry) => entry.input);
  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const standardInputsByPath = new Map<string, StandardRigInput>();

  standardInputs.forEach((input) => {
    const normalized = normalizeStandardRigInputPath(input.path);
    standardInputsByPath.set(normalized, input);
    const stripped = stripStandardInputPathPrefix(normalized);
    if (stripped !== normalized) {
      standardInputsByPath.set(stripped, input);
    }
  });

  const standardInputMetadataById = new Map<
    string,
    StandardInputCollectionMetadata
  >();
  const groupedRoots = new Map<string, Set<string>>();
  const allStandardInputSubgroups = new Set<string>();

  activeEntries.forEach((entry) => {
    const isPreset = entry.metadata?.elementType === "standard";
    const source = isPreset ? "preset" : entry.source;
    const root = entry.metadata?.root ?? entry.input.group ?? groupFallback;

    standardInputMetadataById.set(entry.input.id, {
      source,
      root,
    });

    const elementId = entry.metadata?.elementId ?? null;
    if (elementId && root) {
      const bucket = groupedRoots.get(elementId);
      if (bucket) {
        bucket.add(root);
      } else {
        groupedRoots.set(elementId, new Set([root]));
      }
    }

    extractStandardInputSubgroups(entry.input.path, root).forEach(
      (subgroup) => {
        if (subgroup) {
          allStandardInputSubgroups.add(subgroup);
        }
      },
    );
  });

  const elementRootLookup = new Map<string, readonly string[]>();
  groupedRoots.forEach((roots, elementId) => {
    elementRootLookup.set(elementId, Array.from(roots));
  });

  return {
    activeEntries,
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    standardInputMetadataById,
    elementRootLookup,
    allStandardInputSubgroups,
  };
}

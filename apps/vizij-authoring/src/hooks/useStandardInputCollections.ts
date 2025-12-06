import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
  type StandardRigInput,
} from "@vizij/utils";
import type { ManagedStandardInput } from "../types/standardInputs";
import { extractStandardInputSubgroups } from "../utils/standardInputs";

export interface StandardInputCollectionsOptions {
  managedStandardInputs: ManagedStandardInput[];
  groupFallback: string;
  allStandardInputsRef: MutableRefObject<Map<string, StandardRigInput>>;
  standardInputsByIdRef: MutableRefObject<Map<string, StandardRigInput>>;
}

export interface StandardInputCollectionsResult {
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  standardInputsByPath: Map<string, StandardRigInput>;
  standardInputMetadataById: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  elementRootLookup: Map<string, readonly string[]>;
  allStandardInputSubgroups: Set<string>;
}

export function useStandardInputCollections(
  options: StandardInputCollectionsOptions,
): StandardInputCollectionsResult {
  const {
    managedStandardInputs,
    groupFallback,
    allStandardInputsRef,
    standardInputsByIdRef,
  } = options;

  const standardInputs = useMemo(
    () => managedStandardInputs.map((entry) => entry.input),
    [managedStandardInputs],
  );

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const standardInputsByPath = useMemo(() => {
    const entries = new Map<string, StandardRigInput>();
    standardInputs.forEach((input) => {
      const normalized = normalizeStandardRigInputPath(input.path);
      entries.set(normalized, input);
      const stripped = stripStandardInputPathPrefix(normalized);
      if (stripped !== normalized) {
        entries.set(stripped, input);
      }
    });
    return entries;
  }, [standardInputs]);

  const standardInputMetadataById = useMemo(() => {
    const entries = new Map<
      string,
      { source?: "auto" | "custom" | "preset"; root?: string }
    >();
    managedStandardInputs.forEach((entry) => {
      const isPreset = entry.metadata?.elementType === "standard";
      const source: "auto" | "custom" | "preset" | undefined = isPreset
        ? "preset"
        : entry.source;
      entries.set(entry.input.id, {
        source,
        root: entry.metadata?.root ?? entry.input.group ?? groupFallback,
      });
    });
    return entries;
  }, [groupFallback, managedStandardInputs]);

  const elementRootLookup = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    managedStandardInputs.forEach((entry) => {
      const elementId = entry.metadata?.elementId;
      if (!elementId) {
        return;
      }
      const root = entry.metadata?.root ?? entry.input.group ?? groupFallback;
      if (!root) {
        return;
      }
      const bucket = grouped.get(elementId);
      if (bucket) {
        bucket.add(root);
      } else {
        grouped.set(elementId, new Set([root]));
      }
    });
    const lookup = new Map<string, readonly string[]>();
    grouped.forEach((roots, elementId) => {
      lookup.set(elementId, Array.from(roots));
    });
    return lookup;
  }, [groupFallback, managedStandardInputs]);

  const allStandardInputSubgroups = useMemo(() => {
    const set = new Set<string>();
    managedStandardInputs.forEach((entry) => {
      const root = entry.metadata?.root ?? entry.input.group ?? groupFallback;
      extractStandardInputSubgroups(entry.input.path, root).forEach(
        (subgroup) => {
          if (subgroup) {
            set.add(subgroup);
          }
        },
      );
    });
    return set;
  }, [groupFallback, managedStandardInputs]);

  useEffect(() => {
    const map = new Map<string, StandardRigInput>();
    managedStandardInputs.forEach((entry) => {
      map.set(entry.input.id, entry.input);
    });
    allStandardInputsRef.current = map;
  }, [allStandardInputsRef, managedStandardInputs]);

  useEffect(() => {
    standardInputsByIdRef.current = standardInputsById;
  }, [standardInputsById, standardInputsByIdRef]);

  return {
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    standardInputMetadataById,
    elementRootLookup,
    allStandardInputSubgroups,
  };
}

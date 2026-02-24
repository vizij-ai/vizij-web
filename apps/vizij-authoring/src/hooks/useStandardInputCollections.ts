import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
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

  const activeManagedInputs = useMemo(
    () => managedStandardInputs.filter((entry) => !entry.disabled),
    [managedStandardInputs],
  );

  const standardInputs = useMemo(
    () => activeManagedInputs.map((entry) => entry.input),
    [activeManagedInputs],
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
    activeManagedInputs.forEach((entry) => {
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
  }, [activeManagedInputs, groupFallback]);

  const elementRootLookup = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    activeManagedInputs.forEach((entry) => {
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
  }, [activeManagedInputs, groupFallback]);

  const allStandardInputSubgroups = useMemo(() => {
    const set = new Set<string>();
    activeManagedInputs.forEach((entry) => {
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
  }, [activeManagedInputs, groupFallback]);

  useEffect(() => {
    const map = new Map<string, StandardRigInput>();
    activeManagedInputs.forEach((entry) => {
      map.set(entry.input.id, entry.input);
    });
    allStandardInputsRef.current = map;
  }, [activeManagedInputs, allStandardInputsRef]);

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

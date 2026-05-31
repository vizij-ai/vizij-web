import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { buildStandardInputCollectionIndex } from "@vizij/studio-support";
import type { ManagedStandardInput } from "../types/standardInputs";

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

  const collections = useMemo(
    () =>
      buildStandardInputCollectionIndex({
        entries: managedStandardInputs,
        groupFallback,
      }),
    [groupFallback, managedStandardInputs],
  );

  useEffect(() => {
    const map = new Map<string, StandardRigInput>();
    collections.activeEntries.forEach((entry) => {
      map.set(entry.input.id, entry.input);
    });
    allStandardInputsRef.current = map;
  }, [allStandardInputsRef, collections.activeEntries]);

  useEffect(() => {
    standardInputsByIdRef.current = collections.standardInputsById;
  }, [collections.standardInputsById, standardInputsByIdRef]);

  return {
    standardInputs: collections.standardInputs,
    standardInputsById: collections.standardInputsById,
    standardInputsByPath: collections.standardInputsByPath,
    standardInputMetadataById: collections.standardInputMetadataById,
    elementRootLookup: collections.elementRootLookup,
    allStandardInputSubgroups: collections.allStandardInputSubgroups,
  };
}

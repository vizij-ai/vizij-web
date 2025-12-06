import {
  useEffect,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { normalizeStandardRigGroup } from "@vizij/utils";
import type { Selection, World } from "@vizij/render";

interface Options {
  elementSelection: Selection[] | undefined;
  namespace: string;
  world: World;
  standardInputRoots: string[];
  elementRootLookup: Map<string, readonly string[]>;
  selectedRoots: string[];
  setSelectedRoots: Dispatch<SetStateAction<string[]>>;
  selectedSubgroups: string[];
  setSelectedSubgroups: Dispatch<SetStateAction<string[]>>;
  allStandardInputSubgroups: Set<string>;
  viewerSelectionActiveRef: MutableRefObject<boolean>;
}

export function useStandardInputSelectionSync({
  elementSelection,
  namespace,
  world,
  standardInputRoots,
  elementRootLookup,
  selectedRoots,
  setSelectedRoots,
  selectedSubgroups,
  setSelectedSubgroups,
  allStandardInputSubgroups,
  viewerSelectionActiveRef,
}: Options) {
  useEffect(() => {
    if (selectedRoots.length === 0) {
      return;
    }
    const validRoots = new Set<string>(standardInputRoots);
    const filtered = selectedRoots.filter((root) => validRoots.has(root));
    if (filtered.length !== selectedRoots.length) {
      setSelectedRoots(filtered);
    }
  }, [selectedRoots, setSelectedRoots, standardInputRoots]);

  useEffect(() => {
    if (!Array.isArray(elementSelection)) {
      return;
    }
    const relevantSelection = elementSelection.filter(
      (entry) => entry.namespace === namespace,
    );
    if (relevantSelection.length === 0) {
      if (viewerSelectionActiveRef.current) {
        viewerSelectionActiveRef.current = false;
        setSelectedRoots((previous) => {
          if (previous.length === 0) {
            return previous;
          }
          return [];
        });
      }
      return;
    }

    const candidateRoots = new Set<string>();

    relevantSelection.forEach((selection) => {
      const mappedRoots = elementRootLookup.get(selection.id);
      if (mappedRoots) {
        mappedRoots.forEach((root) => {
          if (root) {
            candidateRoots.add(root);
          }
        });
      }
      const renderable = world[selection.id];
      if (renderable && typeof renderable === "object") {
        const baseName =
          typeof renderable.name === "string" &&
          renderable.name.trim().length > 0
            ? renderable.name
            : renderable.id;
        const normalized = normalizeStandardRigGroup(baseName, "");
        if (normalized) {
          candidateRoots.add(normalized);
        }
      }
    });

    const orderedRoots = standardInputRoots.filter((root) =>
      candidateRoots.has(root),
    );

    viewerSelectionActiveRef.current = true;

    setSelectedRoots((previous) => {
      if (
        previous.length === orderedRoots.length &&
        previous.every((value, index) => value === orderedRoots[index])
      ) {
        return previous;
      }
      return orderedRoots;
    });
  }, [
    elementRootLookup,
    elementSelection,
    namespace,
    setSelectedRoots,
    standardInputRoots,
    viewerSelectionActiveRef,
    world,
  ]);

  useEffect(() => {
    if (selectedSubgroups.length === 0) {
      return;
    }
    const filtered = selectedSubgroups.filter((token) =>
      allStandardInputSubgroups.has(token),
    );
    if (filtered.length !== selectedSubgroups.length) {
      setSelectedSubgroups(filtered);
    }
  }, [allStandardInputSubgroups, selectedSubgroups, setSelectedSubgroups]);
}

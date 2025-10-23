import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Selection } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import { buildFeatureEntries } from "./featureEntries";
import type { FeatureEntry } from "./types";

interface FeatureGroup {
  elementId: string;
  elementName: string;
  elementType: string;
  entries: FeatureEntry[];
}

interface UseFeatureCatalogueOptions {
  world: Record<string, any>;
  animatables: Record<string, AnimatableValue>;
  selectionStack: Selection[];
}

interface FeatureCatalogueResult {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  activeSelection: Selection | null;
  groupedEntries: FeatureGroup[];
  collapsedGroups: Set<string>;
  collapsedFeatureRows: Set<string>;
  toggleGroup: (elementId: string) => void;
  toggleFeatureCollapse: (featureId: string) => void;
}

export function useFeatureCatalogue({
  world,
  animatables,
  selectionStack,
}: UseFeatureCatalogueOptions): FeatureCatalogueResult {
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedFeatureRows, setCollapsedFeatureRows] = useState<Set<string>>(
    () => new Set(),
  );
  const knownGroupIdsRef = useRef<Set<string>>(new Set());

  const featureEntries = useMemo(
    () => buildFeatureEntries(world, animatables),
    [animatables, world],
  );

  const activeSelection = selectionStack[0] ?? null;

  const filteredEntries = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return featureEntries.filter((entry) => {
      if (activeSelection && entry.elementId !== activeSelection.id) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack =
        `${entry.featureLabel} ${entry.elementName} ${entry.elementType}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeSelection, featureEntries, searchTerm]);

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, FeatureEntry[]>();
    filteredEntries.forEach((entry) => {
      if (!grouped.has(entry.elementId)) {
        grouped.set(entry.elementId, []);
      }
      grouped.get(entry.elementId)!.push(entry);
    });
    return Array.from(grouped.entries()).map(([elementId, entries]) => {
      const descriptor = entries[0];
      return {
        elementId,
        elementName: descriptor.elementName,
        elementType: descriptor.elementType,
        entries,
      };
    });
  }, [filteredEntries]);

  useEffect(() => {
    setCollapsedGroups((previous) => {
      let changed = false;
      const next = new Set(previous);
      const currentIds = new Set(
        groupedEntries.map((group) => group.elementId),
      );

      previous.forEach((id) => {
        if (!currentIds.has(id)) {
          next.delete(id);
          knownGroupIdsRef.current.delete(id);
          changed = true;
        }
      });

      groupedEntries.forEach((group) => {
        if (!knownGroupIdsRef.current.has(group.elementId)) {
          knownGroupIdsRef.current.add(group.elementId);
          next.add(group.elementId);
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [groupedEntries]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedGroups((previous) => {
      if (!previous.has(activeSelection.id)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(activeSelection.id);
      return next;
    });
  }, [activeSelection]);

  useEffect(() => {
    setCollapsedFeatureRows((previous) => {
      const valid = new Set(filteredEntries.map((entry) => entry.id));
      let modified = false;
      const next = new Set<string>();
      previous.forEach((id) => {
        if (valid.has(id)) {
          next.add(id);
        } else {
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedFeatureRows((previous) => {
      let modified = false;
      const next = new Set(previous);
      filteredEntries.forEach((entry) => {
        if (entry.elementId === activeSelection.id && next.has(entry.id)) {
          next.delete(entry.id);
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries, activeSelection]);

  const toggleGroup = useCallback((elementId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(elementId)) {
        next.delete(elementId);
      } else {
        next.add(elementId);
      }
      return next;
    });
  }, []);

  const toggleFeatureCollapse = useCallback((id: string) => {
    setCollapsedFeatureRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    activeSelection,
    groupedEntries,
    collapsedGroups,
    collapsedFeatureRows,
    toggleGroup,
    toggleFeatureCollapse,
  };
}

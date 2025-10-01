import { useMemo } from "react";
import { useVizijStore } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";

export interface AnimInspectorItem {
  id: string;
  name: string;
  group: string;
  label: string;
  type: AnimatableValue["type"];
  defaultValue: RawValue;
  constraints: AnimatableValue["constraints"] | undefined;
}

export interface AnimInspectorGroup {
  key: string;
  label: string;
  items: AnimInspectorItem[];
}

function splitName(name: string) {
  const patterns = [
    " translation",
    " rotation",
    " scale",
    " Key",
    " key",
    " color",
    " Color",
    " opacity",
    " morph",
  ];
  for (const pattern of patterns) {
    const idx = name.indexOf(pattern);
    if (idx > 0) {
      return {
        group: name.slice(0, idx),
        label: name.slice(idx).trim() || name,
      };
    }
  }
  const dotIdx = name.indexOf(".");
  if (dotIdx > 0) {
    return {
      group: name.slice(0, dotIdx),
      label: name.slice(dotIdx + 1) || name,
    };
  }
  return { group: name, label: name };
}

export function useAnimatableList(namespace: string, filter: string) {
  void namespace;
  const animatables = useVizijStore((state) => state.animatables);

  return useMemo(() => {
    const groups = new Map<string, AnimInspectorGroup>();
    const normalizedFilter = filter.trim().toLowerCase();
    let total = 0;
    let filtered = 0;

    for (const anim of Object.values(animatables)) {
      total += 1;
      const name = anim.name ?? anim.id;
      const { group, label } = splitName(name);
      const matchesFilter = normalizedFilter
        ? [name, group, label, anim.id, anim.type]
            .join("|")
            .toLowerCase()
            .includes(normalizedFilter)
        : true;

      if (!matchesFilter) {
        continue;
      }
      filtered += 1;

      const item: AnimInspectorItem = {
        id: anim.id,
        name,
        group,
        label,
        type: anim.type,
        defaultValue: anim.default,
        constraints: (anim as AnimatableValue).constraints,
      };

      const groupKey = group || "ungrouped";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: group || "Misc",
          items: [],
        });
      }
      groups.get(groupKey)!.items.push(item);
    }

    const sortedGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      groups: sortedGroups,
      total,
      filtered,
    };
  }, [animatables, filter]);
}

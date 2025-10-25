import { useMemo, useState } from "react";
import type { Selection } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import { buildFeatureEntries } from "./featureEntries";
import type {
  FeatureEntry,
  ShapeTreeNode,
  FeatureTreeNode,
  FieldNode,
  PropertyNode,
} from "./types";

interface UseFeatureCatalogueOptions {
  world: Record<string, any>;
  animatables: Record<string, AnimatableValue>;
  selectionStack: Selection[];
  featureLabelOverrides: Record<string, string>;
}

interface FeatureCatalogueResult {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  activeSelection: Selection | null;
  allShapes: ShapeTreeNode[];
  visibleShapes: ShapeTreeNode[];
  totalFeatureCount: number;
  filteredFeatureCount: number;
}

function buildPropertyNodes(entry: FeatureEntry): FieldNode[] {
  if (!entry.animated || !entry.animatableId) {
    return [];
  }

  if (entry.type === "number") {
    const property: PropertyNode = {
      id: `${entry.id}:value`,
      label: "Value",
      targetId: entry.animatableId,
    };
    return [
      {
        id: `${entry.id}:field-value`,
        label: "Value",
        properties: [property],
      },
    ];
  }

  const properties: PropertyNode[] = entry.vector.components.map(
    (component) => ({
      id: `${entry.id}:${component}`,
      label: component.toUpperCase(),
      targetId: `${entry.animatableId}:${component}`,
      componentKey: component,
    }),
  );

  return [
    {
      id: `${entry.id}:field-components`,
      label: "Components",
      properties,
    },
  ];
}

function buildSearchText(entry: FeatureEntry, fields: FieldNode[]): string {
  const parts = [
    entry.defaultLabel,
    entry.featureLabel,
    entry.featureKey,
    entry.elementName,
    entry.elementType,
  ];
  if (entry.descriptor?.name) {
    parts.push(entry.descriptor.name);
  }
  if (entry.descriptor?.pub?.output) {
    parts.push(entry.descriptor.pub.output);
  }
  fields.forEach((field) => {
    parts.push(field.label);
    field.properties.forEach((property) => {
      parts.push(property.label);
    });
  });
  return parts.join(" ").toLowerCase();
}

export function useFeatureCatalogue({
  world,
  animatables,
  selectionStack,
  featureLabelOverrides,
}: UseFeatureCatalogueOptions): FeatureCatalogueResult {
  const [searchTerm, setSearchTerm] = useState("");

  const featureEntries = useMemo(
    () => buildFeatureEntries(world, animatables, featureLabelOverrides),
    [animatables, featureLabelOverrides, world],
  );

  const allShapes = useMemo<ShapeTreeNode[]>(() => {
    const shapes = new Map<string, ShapeTreeNode>();

    const ensureShape = (entry: FeatureEntry): ShapeTreeNode => {
      const existing = shapes.get(entry.elementId);
      if (existing) {
        return existing;
      }
      const created: ShapeTreeNode = {
        id: entry.elementId,
        name: entry.elementName,
        type: entry.elementType,
        features: [],
      };
      shapes.set(entry.elementId, created);
      return created;
    };

    featureEntries.forEach((entry) => {
      const fields = buildPropertyNodes(entry);

      const featureNode: FeatureTreeNode = {
        id: entry.id,
        entry,
        isAnimated: entry.animated && Boolean(entry.animatableId),
        animatable:
          entry.animated && entry.animatableId
            ? {
                id: entry.animatableId,
                label: entry.descriptor?.name ?? entry.featureLabel,
                animatableId: entry.animatableId,
                entry,
                descriptor: entry.descriptor,
                type: entry.type,
                vectorType:
                  entry.type === "vector3"
                    ? entry.vector.descriptorType
                    : undefined,
                fields,
              }
            : undefined,
        staticValue:
          entry.animated && entry.animatableId
            ? undefined
            : (entry.staticValue ?? entry.descriptor?.default),
        searchText: buildSearchText(entry, fields),
      };

      ensureShape(entry).features.push(featureNode);
    });

    return Array.from(shapes.values());
  }, [featureEntries]);

  const activeSelection = selectionStack[0] ?? null;

  const visibleShapes = useMemo<ShapeTreeNode[]>(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const shapeFilter = activeSelection ? new Set([activeSelection.id]) : null;

    return allShapes
      .filter((shape) => {
        if (shapeFilter && !shapeFilter.has(shape.id)) {
          return false;
        }
        return true;
      })
      .map((shape) => {
        const features = shape.features.filter((feature) => {
          if (!normalizedSearch) {
            return true;
          }
          return feature.searchText.includes(normalizedSearch);
        });
        return { ...shape, features };
      })
      .filter((shape) => shape.features.length > 0);
  }, [activeSelection, allShapes, searchTerm]);

  const totalFeatureCount = useMemo(
    () => allShapes.reduce((total, shape) => total + shape.features.length, 0),
    [allShapes],
  );

  const filteredFeatureCount = useMemo(
    () =>
      visibleShapes.reduce((total, shape) => total + shape.features.length, 0),
    [visibleShapes],
  );

  return {
    searchTerm,
    setSearchTerm,
    activeSelection,
    allShapes,
    visibleShapes,
    totalFeatureCount,
    filteredFeatureCount,
  };
}

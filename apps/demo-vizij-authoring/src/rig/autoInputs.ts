import {
  createStandardRigInput,
  deriveLabelFromNormalizedPath,
} from "@vizij/utils";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { buildFeatureEntries } from "../components/animatable-panel/featureEntries";
import type { FeatureEntry } from "../components/animatable-panel/types";

type VectorComponentKey = NonNullable<AnimatableComponent["component"]>;

function toPathToken(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function toFeaturePathSegment(entry: FeatureEntry): string {
  return toPathToken(entry.featureKey, "feature");
}

function toShapePathSegment(entry: FeatureEntry): string {
  const base = entry.elementName || entry.elementId;
  return toPathToken(base, "shape");
}

function toPropertyPathSegment(
  component: VectorComponentKey | undefined,
): string {
  if (!component) {
    return "value";
  }
  return toPathToken(component, "value");
}

function toPropertyLabel(component: VectorComponentKey | undefined): string {
  if (!component) {
    return "Value";
  }
  return component.toUpperCase();
}

function ensureUniquePath(path: string, registry: Set<string>): string {
  if (!registry.has(path)) {
    registry.add(path);
    return path;
  }
  let suffix = 2;
  let candidate = `${path}_${suffix}`;
  while (registry.has(candidate)) {
    suffix += 1;
    candidate = `${path}_${suffix}`;
  }
  registry.add(candidate);
  return candidate;
}

export interface AutoRigInputBlueprintMetadata {
  elementId: string;
  elementName: string;
  elementType: string;
  featureKey: string;
  featureLabel: string;
  animatableId: string;
  componentId: string;
  componentKey: VectorComponentKey | undefined;
  propertyLabel: string;
  root: string;
}

export interface AutoRigInputBlueprint {
  path: string;
  input: StandardRigInput;
  metadata: AutoRigInputBlueprintMetadata;
}

interface ComponentsByAnimatable {
  [animatableId: string]: AnimatableComponent[];
}

function groupComponentsByAnimatable(
  components: AnimatableComponent[],
): ComponentsByAnimatable {
  const grouped: ComponentsByAnimatable = {};
  components.forEach((component) => {
    if (!grouped[component.animatableId]) {
      grouped[component.animatableId] = [];
    }
    grouped[component.animatableId]!.push(component);
  });
  return grouped;
}

function resolveComponentForVector(
  components: AnimatableComponent[] | undefined,
  key: VectorComponentKey,
): AnimatableComponent | undefined {
  if (!components) {
    return undefined;
  }
  return components.find((component) => component.component === key);
}

function resolveScalarComponent(
  components: AnimatableComponent[] | undefined,
): AnimatableComponent | undefined {
  if (!components) {
    return undefined;
  }
  return components[0];
}

function createBlueprintFromComponent(
  entry: FeatureEntry,
  component: AnimatableComponent,
  propertyKey: VectorComponentKey | undefined,
  registry: Set<string>,
): AutoRigInputBlueprint {
  const shapeSegment = toShapePathSegment(entry);
  const featureSegment = toFeaturePathSegment(entry);
  const propertySegment = toPropertyPathSegment(propertyKey);
  const normalizedPath = ensureUniquePath(
    `/${shapeSegment}/${featureSegment}/${propertySegment}`,
    registry,
  );
  const label = deriveLabelFromNormalizedPath(normalizedPath);
  const input = createStandardRigInput({
    path: normalizedPath,
    label,
    group: shapeSegment,
    defaultValue: 0,
    range: {
      min: -1,
      max: 1,
    },
  });
  const metadata: AutoRigInputBlueprintMetadata = {
    elementId: entry.elementId,
    elementName: entry.elementName,
    elementType: entry.elementType,
    featureKey: entry.featureKey,
    featureLabel: entry.featureLabel,
    animatableId: component.animatableId,
    componentId: component.id,
    componentKey: propertyKey,
    propertyLabel: toPropertyLabel(propertyKey),
    root: input.group,
  };
  return {
    path: normalizedPath,
    input,
    metadata,
  };
}

export interface AutoRigInputBlueprintResult {
  blueprints: AutoRigInputBlueprint[];
  componentPathMap: Map<string, string>;
  roots: string[];
}

export function buildAutoRigInputBlueprints(
  world: Record<string, any>,
  animatables: Record<string, AnimatableValue>,
  components: AnimatableComponent[],
): AutoRigInputBlueprintResult {
  const featureEntries = buildFeatureEntries(world, animatables);
  const groupedComponents = groupComponentsByAnimatable(components);
  const registry = new Set<string>();
  const blueprints: AutoRigInputBlueprint[] = [];
  const componentPathMap = new Map<string, string>();
  const rootSet = new Set<string>();

  featureEntries.forEach((entry) => {
    if (!entry.animated || !entry.animatableId) {
      return;
    }
    const candidates = groupedComponents[entry.animatableId];
    if (!candidates || candidates.length === 0) {
      return;
    }
    if (entry.type === "number") {
      const component = resolveScalarComponent(candidates);
      if (!component) {
        return;
      }
      const blueprint = createBlueprintFromComponent(
        entry,
        component,
        undefined,
        registry,
      );
      blueprints.push(blueprint);
      componentPathMap.set(component.id, blueprint.path);
      rootSet.add(blueprint.metadata.root);
      return;
    }
    if (!entry.vector) {
      return;
    }
    entry.vector.components.forEach((componentKey) => {
      const component = resolveComponentForVector(
        candidates,
        componentKey as VectorComponentKey,
      );
      if (!component) {
        return;
      }
      const blueprint = createBlueprintFromComponent(
        entry,
        component,
        componentKey as VectorComponentKey,
        registry,
      );
      blueprints.push(blueprint);
      componentPathMap.set(component.id, blueprint.path);
      rootSet.add(blueprint.metadata.root);
    });
  });

  blueprints.sort((a, b) => {
    const elementComparison = a.metadata.elementName.localeCompare(
      b.metadata.elementName,
    );
    if (elementComparison !== 0) {
      return elementComparison;
    }
    const featureComparison = a.metadata.featureLabel.localeCompare(
      b.metadata.featureLabel,
    );
    if (featureComparison !== 0) {
      return featureComparison;
    }
    return a.metadata.propertyLabel.localeCompare(b.metadata.propertyLabel);
  });

  const roots = Array.from(rootSet.values()).sort((a, b) => a.localeCompare(b));

  return {
    blueprints,
    componentPathMap,
    roots,
  };
}

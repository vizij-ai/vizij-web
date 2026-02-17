import {
  createStandardRigInput,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  normalizeStandardRigGroup,
} from "@vizij/utils";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { buildFeatureEntries } from "../scene/featureEntries";
import type { FeatureEntry } from "../components/binding";

type VectorComponentKey = NonNullable<AnimatableComponent["component"]>;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(min)) {
    min = -1;
  }
  if (!Number.isFinite(max)) {
    max = 1;
  }
  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }
  if (!Number.isFinite(value)) {
    value = 0;
  }
  return Math.min(max, Math.max(min, value));
}

function encodeSourceToken(value: string): string {
  return encodeURIComponent(value ?? "");
}

function buildComponentSourceId(options: {
  elementId: string;
  featureKey: string;
  animatableId: string;
  componentId: string;
}): string {
  const { elementId, featureKey, animatableId, componentId } = options;
  return [
    "component",
    encodeSourceToken(elementId),
    encodeSourceToken(featureKey),
    encodeSourceToken(animatableId),
    encodeSourceToken(componentId),
  ].join(":");
}

function toPathToken(value: string, fallback: string): string {
  const normalized = normalizeStandardRigGroup(value, "");
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
  sourceId: string;
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
  const basePath = `/autorig/${shapeSegment}/${featureSegment}/${propertySegment}`;
  const normalizedPath = ensureUniquePath(
    normalizeStandardRigInputPath(basePath),
    registry,
  );
  const label = deriveLabelFromNormalizedPath(normalizedPath);
  const componentRange = component.range ?? { min: -1, max: 1 };
  const rangeMin = Number.isFinite(componentRange.min)
    ? componentRange.min
    : -1;
  const rangeMax = Number.isFinite(componentRange.max) ? componentRange.max : 1;
  const normalizedRange =
    rangeMin <= rangeMax
      ? { min: rangeMin, max: rangeMax }
      : { min: rangeMax, max: rangeMin };
  const componentDefault = Number.isFinite(component.defaultValue)
    ? (component.defaultValue as number)
    : 0;
  const clampedDefault = clamp(
    componentDefault,
    normalizedRange.min,
    normalizedRange.max,
  );
  const input = createStandardRigInput({
    path: normalizedPath,
    label,
    group: shapeSegment,
    defaultValue: clampedDefault,
    range: {
      min: normalizedRange.min,
      max: normalizedRange.max,
    },
    sourceId: buildComponentSourceId({
      elementId: entry.elementId,
      featureKey: entry.featureKey,
      animatableId: component.animatableId,
      componentId: component.id,
    }),
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
    sourceId: input.sourceId ?? "",
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
  labelOverrides: Record<string, string> = {},
): AutoRigInputBlueprintResult {
  const featureEntries = buildFeatureEntries(
    world,
    animatables,
    labelOverrides,
  );
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

import type { AnimatableValue } from "@vizij/utils";
import type { Feature, World } from "@vizij/render";

/**
 * A face's world split into what its GLB has to be re-made for and what the
 * loaded face takes in place.
 *
 * `structure` changes with the elements under the root, their hierarchy,
 * types, names, geometry and materials, which features are animated by which
 * animatable, the animatables' types and ranges, and every static value the
 * loaded face cannot take in place. `values` holds the rest: per element, per
 * feature, the value `setStaticFeature` sets — a static feature's value, or
 * the default of the animatable an animated feature reads. A feature an
 * output of the face's device drives shows the device's value again at the
 * device's next write to it, as it would after a reload.
 */
export interface WorldSplit {
  structure: string;
  values: InPlaceValues;
}

/** Per element id, per RobotData feature name, the value the face shows. */
export type InPlaceValues = ReadonlyMap<string, ReadonlyMap<string, unknown>>;

/** One feature to set in place: `setStaticFeature`'s arguments past the id. */
export interface InPlaceEdit {
  elementId: string;
  feature: string;
  value: unknown;
}

type Element = World[string];

/** What a value has to be for the loaded face to take it in place. */
type ValueShape = "triple" | "tripleOrNumber" | "rgb" | "number";

const TRANSFORM: Record<string, ValueShape> = {
  translation: "triple",
  rotation: "triple",
  scale: "tripleOrNumber",
};

const MATERIAL: Record<string, ValueShape> = {
  color: "rgb",
  emissive: "rgb",
  specular: "rgb",
  opacity: "number",
  metalness: "number",
  roughness: "number",
  emissiveIntensity: "number",
  shininess: "number",
};

/**
 * The value shape an element's feature takes in place, or `null` for a
 * feature only a reload changes. A group takes its transform; a shape its
 * transform, material factors and morph weights; an ellipse or a rectangle
 * its translation and rotation as triples — its width, height and fill are
 * drawn from its RobotData at load.
 */
function inPlaceShape(element: Element, feature: string): ValueShape | null {
  switch (element.type) {
    case "group":
      return TRANSFORM[feature] ?? null;
    case "shape":
      if (element.morphTargets?.includes(feature)) return "number";
      return TRANSFORM[feature] ?? MATERIAL[feature] ?? null;
    case "ellipse":
    case "rectangle":
      return feature === "translation" || feature === "rotation"
        ? "triple"
        : null;
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasNumbers(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => isNumber(record[key]));
}

function fits(shape: ValueShape, value: unknown): boolean {
  switch (shape) {
    case "triple":
      return hasNumbers(value, ["x", "y", "z"]);
    case "tripleOrNumber":
      return isNumber(value) || hasNumbers(value, ["x", "y", "z"]);
    case "rgb":
      return hasNumbers(value, ["r", "g", "b"]);
    case "number":
      return isNumber(value);
  }
}

/** The elements `buildSceneGraph` exports under `rootId`, root first. */
function elementsUnder(world: World, rootId: string): Element[] {
  const elements: Element[] = [];
  const pending = [rootId];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    const element = world[id];
    if (!element || seen.has(id)) continue;
    seen.add(id);
    elements.push(element);
    if (element.type === "group" || element.type === "shape") {
      pending.push(...[...(element.children ?? [])].reverse());
    }
  }
  return elements;
}

/**
 * Split the world under `rootId` (as `buildSceneGraph` exports it) into its
 * structure and its in-place values. An animated feature's value is its
 * animatable's default, in place in the form the world holds it: the face
 * reads it as RobotData stores it, unless the animatable also animates a
 * feature the face takes only at load. A static feature's value is in place only
 * in a form the face takes for that feature; any other is structure.
 */
export function splitWorld(
  world: World,
  animatables: Record<string, AnimatableValue>,
  rootId: string,
): WorldSplit {
  const elements: unknown[] = [];
  const used: Record<string, unknown> = {};
  const values = new Map<string, Map<string, unknown>>();
  for (const element of elementsUnder(world, rootId)) {
    const features: Record<string, unknown> = {};
    const shown = new Map<string, unknown>();
    for (const [name, feature] of Object.entries(element.features) as [
      string,
      Feature | undefined,
    ][]) {
      if (!feature) continue;
      const shape = inPlaceShape(element, name);
      if (feature.animated) {
        features[name] = { animated: feature.value };
        const animatable = animatables[feature.value];
        if (!animatable) continue;
        if (shape) {
          shown.set(name, animatable.default);
          const { default: _rest, ...declared } = animatable;
          used[feature.value] ??= declared;
        } else {
          // A default the face takes only at load.
          used[feature.value] = animatable;
        }
      } else if (shape && fits(shape, feature.value)) {
        features[name] = { inPlace: shape };
        shown.set(name, feature.value);
      } else {
        features[name] = { value: feature.value };
      }
    }
    const { features: _features, ...rest } = element;
    elements.push({
      ...rest,
      ...("geometry" in rest ? { geometry: rest.geometry.uuid } : {}),
      features,
    });
    if (shown.size > 0) values.set(element.id, shown);
  }
  return {
    structure: JSON.stringify({ rootId, elements, animatables: used }),
    values,
  };
}

/**
 * The features whose value in `to` differs from `from`, each to set to its
 * value in `to`. A feature `to` does not hold is left alone: one that stopped
 * being in place changed the structure, which reloads the face.
 */
export function changedValues(
  from: InPlaceValues,
  to: InPlaceValues,
): InPlaceEdit[] {
  const edits: InPlaceEdit[] = [];
  for (const [elementId, features] of to) {
    const before = from.get(elementId);
    for (const [feature, value] of features) {
      if (
        !before?.has(feature) ||
        JSON.stringify(before.get(feature)) !== JSON.stringify(value)
      ) {
        edits.push({ elementId, feature, value });
      }
    }
  }
  return edits;
}

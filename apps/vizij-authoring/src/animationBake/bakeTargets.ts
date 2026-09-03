import { propsRigElementSegment } from "../rig/autoInputs";

/**
 * What baking needs to know about one scene element.
 *
 * Baking cannot work from clip tracks alone. glTF animation channels carry a
 * whole vector per key, so an un-animated component has to be filled from the
 * element's current value; morph channels must be addressed by target *name*;
 * and every track has to bind to a real node name (see the exporter
 * constraints in `docs/ANIMATION_INTEROP.md`).
 */
export interface BakeTargetElement {
  /** Scene element name, which is also the exported glTF node name. */
  elementName: string;
  /** Current local translation, used to fill un-animated components. */
  translation: [number, number, number];
  /** Current local rotation as euler ZYX radians. */
  rotationEuler: [number, number, number];
  /** Current local scale. */
  scale: [number, number, number];
  /**
   * Morph target *feature keys* in target order, empty when the element has
   * none.
   *
   * These are the sanitized keys `importGeometry` produced, which is what the
   * renderer uses to build `morphTargetDictionary`
   * (`renderables/shape.tsx`) — so a baked morph track must be named with the
   * key, not the original morph name, or `GLTFExporter`'s
   * `mergeMorphTargetTracks` throws "Morph target name not found".
   */
  morphFeatureKeys: string[];
}

export interface BakeTargetIndex {
  /** Keyed by the propsrig path segment the element normalizes to. */
  bySegment: ReadonlyMap<string, BakeTargetElement>;
}

export function createBakeTargetIndex(
  elements: Iterable<BakeTargetElement>,
): BakeTargetIndex {
  const bySegment = new Map<string, BakeTargetElement>();
  for (const element of elements) {
    const segment = propsRigElementSegment(element.elementName);
    if (!bySegment.has(segment)) {
      bySegment.set(segment, element);
    }
  }
  return { bySegment };
}

type RenderableLike = {
  name?: unknown;
  id?: unknown;
  features?: Record<string, { animated?: unknown; value?: unknown } | null>;
  morphTargets?: unknown;
};

type AnimatableLike = {
  type?: unknown;
  default?: unknown;
};

function vectorFrom(
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const read = (key: string, index: number): number => {
    const entry = record[key];
    return typeof entry === "number" && Number.isFinite(entry)
      ? entry
      : fallback[index]!;
  };
  return [read("x", 0), read("y", 1), read("z", 2)];
}

/**
 * Builds a bake index from the authoring world and its animatables.
 *
 * Reads each element's *current* transform from its animatable defaults, which
 * is what an un-animated component should hold in the exported animation.
 */
export function buildBakeTargetIndexFromWorld(
  world: Record<string, RenderableLike>,
  animatables: Record<string, AnimatableLike>,
): BakeTargetIndex {
  const elements: BakeTargetElement[] = [];

  for (const renderable of Object.values(world)) {
    const elementName =
      (typeof renderable?.name === "string" && renderable.name) ||
      (typeof renderable?.id === "string" && renderable.id) ||
      "";
    if (!elementName) {
      continue;
    }

    const readFeature = (
      featureKey: string,
      fallback: [number, number, number],
    ): [number, number, number] => {
      const feature = renderable.features?.[featureKey];
      if (!feature?.animated || typeof feature.value !== "string") {
        return fallback;
      }
      const animatable = animatables[feature.value];
      return vectorFrom(animatable?.default, fallback);
    };

    elements.push({
      elementName,
      translation: readFeature("translation", [0, 0, 0]),
      rotationEuler: readFeature("rotation", [0, 0, 0]),
      scale: readFeature("scale", [1, 1, 1]),
      morphFeatureKeys: Array.isArray(renderable.morphTargets)
        ? renderable.morphTargets.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    });
  }

  return createBakeTargetIndex(elements);
}

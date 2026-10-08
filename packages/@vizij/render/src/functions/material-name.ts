import type { AnimatableValue } from "@vizij/utils";
import type { Shape } from "../types/shape";

const MATERIAL_FEATURE_KEYS: Array<Extract<keyof Shape["features"], string>> = [
  "color",
  "opacity",
  "roughness",
  "metalness",
  "shininess",
  "emissive",
  "emissiveIntensity",
  "specular",
];

const MATERIAL_NAME_SUFFIXES = [
  " color",
  " colours",
  " colour",
  " opacity",
  " roughness",
  " metalness",
  " shininess",
  " emissive intensity",
  " emissive",
  " specular",
];

/**
 * The material name a shape is exported under: the name of its first
 * animated material feature with the feature suffix removed ("Eye color" →
 * "Eye"), so a re-imported GLB maps its material back onto the same
 * animatables.
 */
export function deriveMaterialName(
  shape: Shape,
  values: Record<string, AnimatableValue>,
): string | undefined {
  for (const key of MATERIAL_FEATURE_KEYS) {
    const feature = shape.features[key as keyof Shape["features"]];
    if (feature && feature.animated) {
      const animatable = values[feature.value];
      const candidate = extractMaterialName(animatable?.name);
      if (candidate) {
        return candidate;
      }
    }
  }
  return undefined;
}

function extractMaterialName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }

  const lowered = trimmed.toLowerCase();

  for (const suffix of MATERIAL_NAME_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      return trimmed.slice(0, trimmed.length - suffix.length).trim();
    }
  }

  return trimmed;
}

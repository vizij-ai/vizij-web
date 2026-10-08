import type { AnimatableValue } from "@vizij/utils";
import { type Stored } from "../types/stored";
import { type RenderableBase } from "../types/renderable-base";
import type { Feature } from "../types/feature";
import { createStoredFeatures } from "./create-stored-features";

export function createStoredRenderable<T extends RenderableBase>(
  data: T,
  animatableValues: Record<string, AnimatableValue>,
): Stored<T> {
  const { geometry: _geometry, ...stored } = data as T & {
    geometry?: unknown;
  };
  const storedFeatures = createStoredFeatures(
    data.features as Record<string, Feature>,
    animatableValues,
  );
  return { ...stored, features: storedFeatures };
}

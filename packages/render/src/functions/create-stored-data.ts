import { omit } from "lodash";
import { AnimatableValue } from "utils";
import { type Stored } from "../types/stored";
import { type RenderableBase } from "../types/renderable-base";
import { Feature } from "../types/feature";
import { createStoredFeatures } from "./create-stored-features";

export function createStoredRenderable<T extends RenderableBase>(
  data: T,
  animatableValues: Record<string, AnimatableValue>,
): Stored<T> {
  const d = omit(data, "refs", "geometry");
  const storedFeatures = createStoredFeatures(
    data.features as Record<string, Feature>,
    animatableValues,
  );
  return { ...d, features: storedFeatures };
}

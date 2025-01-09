import { type StaticFeature, StoredAnimatedFeature } from "./feature";
import { RenderableBase } from "./renderable-base";

export type StoredFeatures<T extends RenderableBase["features"]> = {
  [key in keyof T]: StaticFeature | StoredAnimatedFeature;
};

export interface Stored<T extends Omit<RenderableBase, "refs">> {
  features: StoredFeatures<T["features"]>;
}

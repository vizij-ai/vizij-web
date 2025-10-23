import { type StaticFeature, StoredAnimatedFeature } from "./feature";
import { RenderableBase } from "./renderable-base";

export type StoredFeatures<T extends RenderableBase["features"]> = {
  [key in keyof T]: StaticFeature | StoredAnimatedFeature;
};

export interface Stored<T extends Omit<RenderableBase, "refs">> {
  id: T["id"];
  name: T["name"];
  tags: T["tags"];
  type: T["type"];
  features: StoredFeatures<T["features"]>;
}

export type StoredRenderable = Stored<RenderableBase>;

import type { StoredAnimatedFeature } from "./feature";
import { type StaticFeature } from "./feature";
import type { RenderableBase } from "./renderable-base";

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

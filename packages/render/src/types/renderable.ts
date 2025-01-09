import { type Feature } from "./feature";
import { RenderableFeature } from "./renderable-feature";

export interface Renderable {
  // The id of the renderable
  id: string;
  // The name of the renderable
  name: string;
  // The tags of the renderable
  tags: string[];
  // The features of the renderable
  features: Record<RenderableFeature, Feature>;
}

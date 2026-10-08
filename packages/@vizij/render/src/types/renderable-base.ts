import type { Feature } from "./feature";

export interface RenderableBase {
  id: string;
  name: string;
  tags: string[];
  type: string;
  features: Record<string, Feature>;
}

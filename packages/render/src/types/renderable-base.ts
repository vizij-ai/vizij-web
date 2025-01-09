import { type RefObject } from "react";
import type { Feature } from "./feature";

export interface RenderableBase {
  id: string;
  name: string;
  tags: string[];
  type: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic type */
  refs: Record<string, RefObject<any>>;

  features: Record<string, Feature>;
}

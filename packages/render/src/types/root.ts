import { RefObject } from "react";
import { Feature } from "./feature";
import { Stored } from "./stored";
import { RenderableBase } from "./renderable-base";

/**
 * An object for creating hierarchies/groups
 *
 * @param id - The id of the group
 * @param name - The name of the group
 * @param tags - The tags of the group
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the vizij, for each namespace
 * @param features - The features of the group (translation, rotation, and scale)
 * @param children - The children of the group (list of ids for other groups or shapes)
 */
export interface Root extends RenderableBase {
  type: "root";
  refs: Record<string, RefObject<SVGGElement>>;

  features: {
    width: Feature;
    height: Feature;
  };

  children: string[];
}

export type RootFeature = keyof Root["features"];

// Covenience type for storing a body
export type StoredRoot = Stored<Root>;

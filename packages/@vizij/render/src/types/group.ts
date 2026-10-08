import type { RawVector2 } from "@vizij/utils";
import type { Feature } from "./feature";
import type { Stored } from "./stored";
import type { RenderableBase } from "./renderable-base";

/**
 * An object for creating hierarchies/groups
 *
 * @param id - The id of the group
 * @param name - The name of the group
 * @param tags - The tags of the group
 * @param type - Type flag
 * @param features - The features of the group (translation, rotation, and scale)
 * @param root - Whether the group is a root node
 * @param children - The children of the group (list of ids for other groups or shapes)
 */
export interface Group extends RenderableBase {
  type: "group";
  root: boolean;

  features: {
    translation: Feature;
    rotation: Feature;
    scale?: Feature;
  };

  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  };
  children: string[];
}

export type GroupFeature = keyof Group["features"];

// Covenience type for storing a body
export type StoredGroup = Stored<Group>;

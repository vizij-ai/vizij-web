import { RefObject } from "react";
import { Group } from "three";
import { Feature } from "./feature";
import { Stored } from "./stored";
import { RenderableBase } from "./renderable-base";

/**
 * An object for creating hierarchies/bodies
 *
 * @param id - The id of the body
 * @param name - The name of the body
 * @param tags - The tags of the body
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the scene, for each namespace
 * @param features - The features of the body (translation, rotation, and scale)
 * @param root - Whether the body is a root node
 * @param children - The children of the body (list of ids for other bodies or shapes)
 */
export interface Body extends RenderableBase {
  type: "body";
  refs: Record<string, RefObject<Group>>;

  features: {
    translation: Feature;
    rotation: Feature;
    scale?: Feature;
  };

  root: boolean;
  children: string[];
}

export type BodyFeature = keyof Body["features"];

// Covenience type for storing a body
export type StoredBody = Stored<Body>;

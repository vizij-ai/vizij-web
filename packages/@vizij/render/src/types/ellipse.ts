import { RefObject } from "react";
import { Mesh } from "three";
import { Feature } from "./feature";
import { Stored } from "./stored";
import { RenderableBase } from "./renderable-base";

/**
 * An object for creating hierarchies/bodies
 *
 * @param id - The id of the ellipse
 * @param name - The name of the ellipse
 * @param tags - The tags of the ellipse
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the scene, for each namespace
 * @param features - The features of the ellipse (translation, rotation, and scale)
 * @param children - The children of the ellipse (list of ids for other bodies or shapes)
 */
export interface Ellipse extends RenderableBase {
  type: "ellipse";
  refs: Record<string, RefObject<Mesh>>;

  features: {
    height: Feature; // AnimatedNumber;
    width: Feature; // AnimatedNumber;
    fillOpacity?: Feature; // AnimatedNumber;
    strokeOpacity?: Feature; // AnimatedNumber;
    fillColor?: Feature; // AnimatedColor;
    strokeColor?: Feature; // AnimatedColor;
    strokeWidth?: Feature; // AnimatedNumber;
    strokeOffset?: Feature; // AnimatedNumber;
    translation: Feature; // AnimatedVector2 | AnimatedVector3;
    rotation: Feature; // AnimatedNumber | AnimatedEuler;
  };
}

export type EllipseFeature = keyof Ellipse["features"];

// Covenience type for storing a ellipse
export type StoredEllipse = Stored<Ellipse>;

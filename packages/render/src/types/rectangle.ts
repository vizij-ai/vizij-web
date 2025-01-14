import { RefObject } from "react";
import { Mesh } from "three";
import { Feature } from "./feature";
import { Stored } from "./stored";
import { RenderableBase } from "./renderable-base";

/**
 * An object for creating rectangles
 *
 * @param id - The id of the rectangle
 * @param name - The name of the rectangle
 * @param tags - The tags of the rectangle
 * @param type - Type flag
 * @param refs - The reference to the group[s] in the scene, for each namespace
 * @param features - The features of the rectangle (translation, rotation, and scale)
 * @param children - The children of the rectangle (list of ids for other bodies or shapes)
 */
export interface Rectangle extends RenderableBase {
  type: "rectangle";
  refs: Record<string, RefObject<Mesh>>;

  features: {
    height: Feature; // AnimatedNumber;
    width: Feature; // AnimatedNumber;
    fillOpacity?: Feature; // AnimatedNumber;
    strokeOpacity?: Feature; // AnimatedNumber;
    fillColor?: Feature; // AnimatedColor;
    strokeColor?: Feature; // AnimatedColor;
    strokeWidth?: Feature; // AnimatedNumber;
    strokeRadius?: Feature; // AnimatedNumber;
    strokeOffset?: Feature; // AnimatedNumber;
    translation: Feature; // AnimatedVector2 | AnimatedVector3;
    rotation: Feature; // AnimatedNumber | AnimatedEuler;
  };
}

export type RectangleFeature = keyof Rectangle["features"];

// Covenience type for storing a Rectangle
export type StoredRectangle = Stored<Rectangle>;

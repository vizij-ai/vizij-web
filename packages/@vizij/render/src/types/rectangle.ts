import type {
  ColorAxis,
  Feature,
  PerAxisFeatures,
  RotationAxis,
  VectorAxis,
} from "./feature";
import type { Stored } from "./stored";
import type { RenderableBase } from "./renderable-base";

/**
 * An object for creating rectangles
 *
 * @param id - The id of the rectangle
 * @param name - The name of the rectangle
 * @param tags - The tags of the rectangle
 * @param type - Type flag
 * @param features - The features of the rectangle (translation, rotation, and scale)
 * @param children - The children of the rectangle (list of ids for other bodies or shapes)
 */
export interface Rectangle extends RenderableBase {
  type: "rectangle";

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
    translation?: Feature; // AnimatedVector2 | AnimatedVector3;
    rotation?: Feature; // AnimatedNumber | AnimatedEuler;
  } & PerAxisFeatures<"translation", VectorAxis> &
    PerAxisFeatures<"rotation", RotationAxis> &
    PerAxisFeatures<"fillColor", ColorAxis> &
    PerAxisFeatures<"strokeColor", ColorAxis>;
}

export type RectangleFeature = keyof Rectangle["features"];

// Covenience type for storing a Rectangle
export type StoredRectangle = Stored<Rectangle>;

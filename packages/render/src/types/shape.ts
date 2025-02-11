import { RefObject } from "react";
import { type Mesh, BufferGeometry, ShapeGeometry } from "three";
import { Stored } from "./stored";
import { Feature } from "./feature";
import { RenderableBase } from "./renderable-base";

/**
 * Represents a 3D mesh object in the scene that can be rendered.
 *
 * Shapes are the visual building blocks of the scene, containing geometry and material
 * properties that define their appearance.
 *
 * @property id - Unique identifier for the shape
 * @property name - Human-readable name for the shape
 * @property tags - List of tags for categorizing and filtering
 * @property type - Always "shape"
 * @property refs - Map of React refs to Three.js Mesh objects
 * @property features - Visual and transformation properties that can be animated
 * @property material - The type of Three.js material to use for rendering
 * @property geometry - The Three.js geometry defining the shape's structure
 *
 * @remarks
 * Features include material properties (shininess, opacity, etc.) and transformations
 * (translation, rotation, scale).
 */
export interface Shape extends RenderableBase {
  type: "shape";
  refs: Record<string, RefObject<Mesh>>;

  features: {
    shininess?: Feature; // AnimatedNumber;
    opacity?: Feature; // AnimatedNumber;
    roughness?: Feature; // AnimatedNumber;
    metalness?: Feature; // AnimatedNumber;
    color?: Feature; // AnimatedColor;
    translation: Feature; // AnimatedVector3;
    rotation: Feature; // AnimatedVector3;
    scale?: Feature; // AnimatedVector3;
  };

  material: ShapeMaterial;
  geometry: BufferGeometry | ShapeGeometry;
  morphTargets?: string[];
  children?: string[];
}

/**
 * Supported material types for shapes.
 *
 * @remarks
 * Maps to Three.js material types.
 */
export enum ShapeMaterial {
  Standard = "standard",
  Phong = "phong",
  Basic = "basic",
  Lambert = "lambert",
  Normal = "normal",
}

export type ShapeFeature = keyof Shape["features"];

export type StoredShape = Stored<Omit<Shape, "geometry">>;

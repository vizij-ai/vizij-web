export type RawBoolean = boolean;
export type RawNumber = number;
export type RawString = string;
export interface RawVector3 {
  x: number;
  y: number;
  z: number;
}
export interface RawVector2 {
  x: number;
  y: number;
}
export interface RawEuler {
  x: number;
  y: number;
  z: number;
}
export interface RawRGB {
  r: number;
  g: number;
  b: number;
}
export interface RawHSL {
  h: number;
  s: number;
  l: number;
}
export type RawColor = RawRGB | RawHSL;

export type RawValue =
  | RawBoolean
  | RawNumber
  | RawString
  | RawVector3
  | RawVector2
  | RawEuler
  | RawColor;

export type AnimatableValue =
  | AnimatableBoolean
  | AnimatableNumber
  | AnimatableString
  | AnimatableVector3
  | AnimatableVector2
  | AnimatableEuler
  | AnimatableColor;

/**
 * A specification for an animated numerical value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "boolean" for this type).
 * @param default - the default value of the boolean.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableBoolean {
  id: string;
  name?: string;
  type: "boolean";
  default: RawBoolean;
  constraints: {
    frequency?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated numerical value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "number" for this type).
 * @param default - the default value of the number.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableNumber {
  id: string;
  name?: string;
  type: "number";
  default: RawNumber;
  constraints: {
    min?: number;
    max?: number;
    velocity?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated string value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "string" for this type).
 * @param default - the default value of the string.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableString {
  id: string;
  name?: string;
  type: "string";
  default: RawString;
  constraints: {
    length?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated 3-vector value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "vector3" for this type).
 * @param default - the default value of the vector3.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableVector3 {
  id: string;
  name?: string;
  type: "vector3";
  default: RawVector3;
  constraints: {
    min?: [number | null, number | null, number | null];
    max?: [number | null, number | null, number | null];
    velocity?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated 2-vector value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "vector2" for this type).
 * @param default - the default value of the vector2.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableVector2 {
  id: string;
  name?: string;
  type: "vector2";
  default: RawVector2;
  constraints: {
    min?: [number | null, number | null];
    max?: [number | null, number | null];
    velocity?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated Euler value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "euler" for this type).
 * @param default - the default value of the euler.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableEuler {
  id: string;
  name?: string;
  type: "euler";
  default: RawEuler;
  constraints: {
    min?: [number | null, number | null, number | null];
    max?: [number | null, number | null, number | null];
    velocity?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/**
 * A specification for an animated encoded color value
 *
 * @param id - a unique identifier for the value.
 * @param name - the name of the value, defined by the user.
 * @param type - the type of the value (always "rgb" or "hsl" for this type).
 * @param default - the default value of the color.
 * @param constraints - a collection of constraints that the value must adhere to.
 * @param pub - a collection of properties that determine whether the value is public and what its output should be.
 */
export interface AnimatableColor {
  id: string;
  name?: string;
  type: "rgb" | "hsl";
  default: RawColor;
  constraints: {
    min?: [number | null, number | null, number | null];
    max?: [number | null, number | null, number | null];
    velocity?: number;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

export function instanceOfRawBoolean(object: any): object is RawBoolean {
  return typeof object === "boolean";
}

export function instanceOfRawNumber(object: any): object is RawNumber {
  return typeof object === "number";
}

export function instanceOfRawString(object: any): object is RawString {
  return typeof object === "string";
}

export function instanceOfRawVector3(object: any): object is RawVector3 {
  return object.x !== undefined && object.y !== undefined && object.z !== undefined;
}

export function instanceOfRawVector2(object: any): object is RawVector2 {
  return object.x !== undefined && object.y !== undefined;
}

export function instanceOfRawEuler(object: any): object is RawEuler {
  return object.x !== undefined && object.y !== undefined && object.z !== undefined;
}

export function instanceOfRawColor(object: any): object is RawColor {
  return (
    (object.r !== undefined && object.g !== undefined && object.b !== undefined) ||
    (object.h !== undefined && object.s !== undefined && object.l !== undefined)
  );
}

export function instanceOfRawRGB(object: any): object is RawRGB {
  return object.r !== undefined && object.g !== undefined && object.b !== undefined;
}

export function instanceOfRawHSL(object: any): object is RawHSL {
  return object.h !== undefined && object.s !== undefined && object.l !== undefined;
}

export function isRawObject(value: any) {
  if (
    instanceOfRawVector3(value) ||
    instanceOfRawVector2(value) ||
    instanceOfRawEuler(value) ||
    instanceOfRawColor(value) ||
    instanceOfRawRGB(value) ||
    instanceOfRawHSL(value)
  )
    return true;
  return false;
}

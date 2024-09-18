export type RawBoolean = boolean;
export type RawNumber = number;
export type RawString = string;
export interface RawVector3 {
  x: number;
  y: number;
  z: number;
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
  | RawEuler
  | RawColor;

export type AnimatableValue =
  | AnimatableBoolean
  | AnimatableNumber
  | AnimatableString
  | AnimatableVector3
  | AnimatableEuler
  | AnimatableColor;

interface AnimatableBase {
  id: string;
  name?: string;
  type: string;
  default: any;
  constraints: any;
  pub?: {
    public: boolean;
    output: string;
  };
}

/*
A specification for an animated numerical value
*/
export interface AnimatableBoolean extends AnimatableBase {
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

/*
A specification for an animated numerical value
*/
export interface AnimatableNumber extends AnimatableBase {
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

/*
A specification for an animated string value
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

/*
A specification for an animated 3-vector value
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

/*
A specification for an animated Euler value
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

/*
A specification for an animated encoded color value
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
  return (
    object.x !== undefined && object.y !== undefined && object.z !== undefined
  );
}

export function instanceOfRawEuler(object: any): object is RawEuler {
  return (
    object.x !== undefined && object.y !== undefined && object.z !== undefined
  );
}

export function instanceOfRawColor(object: any): object is RawColor {
  return (
    (object.r !== undefined &&
      object.g !== undefined &&
      object.b !== undefined) ||
    (object.h !== undefined && object.s !== undefined && object.l !== undefined)
  );
}

export function instanceOfRawRGB(object: any): object is RawRGB {
  return (
    object.r !== undefined && object.g !== undefined && object.b !== undefined
  );
}

export function instanceOfRawHSL(object: any): object is RawHSL {
  return (
    object.h !== undefined && object.s !== undefined && object.l !== undefined
  );
}

export function isRawObject(value: any) {
  if (
    instanceOfRawVector3(value) ||
    instanceOfRawEuler(value) ||
    instanceOfRawColor(value) ||
    instanceOfRawRGB(value) ||
    instanceOfRawHSL(value)
  )
    return true;
  return false;
}

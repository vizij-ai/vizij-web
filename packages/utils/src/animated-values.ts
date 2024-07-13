export type AnimatableBoolean = boolean;
export type AnimatableNumber = number;
export type AnimatableString = string;
export interface AnimatableVector3 {
  x: number;
  y: number;
  z: number;
}
export interface AnimatableEuler {
  x: number;
  y: number;
  z: number;
}
export interface AnimatableRGB {
  r: number;
  g: number;
  b: number;
}
export interface AnimatableHSL {
  h: number;
  s: number;
  l: number;
}
export type AnimatableColor = AnimatableRGB | AnimatableHSL;

export type AnimatableValue =
  | AnimatableBoolean
  | AnimatableNumber
  | AnimatableString
  | AnimatableVector3
  | AnimatableEuler
  | AnimatableColor;

export type AnimatedValue =
  | AnimatedBoolean
  | AnimatedNumber
  | AnimatedString
  | AnimatedVector3
  | AnimatedEuler
  | AnimatedColor;

interface AnimatedBase {
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
export interface AnimatedBoolean extends AnimatedBase {
  id: string;
  name?: string;
  type: "boolean";
  default: AnimatableBoolean;
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
export interface AnimatedNumber extends AnimatedBase {
  id: string;
  name?: string;
  type: "number";
  default: AnimatableNumber;
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
export interface AnimatedString {
  id: string;
  name?: string;
  type: "string";
  default: AnimatableString;
  constraints: {
    length?: string;
  };
  pub?: {
    public: boolean;
    output: string;
  };
}

/*
A specification for an animated 3-vector value
*/
export interface AnimatedVector3 {
  id: string;
  name?: string;
  type: "vector3";
  default: AnimatableVector3;
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
export interface AnimatedEuler {
  id: string;
  name?: string;
  type: "euler";
  default: AnimatableEuler;
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
export interface AnimatedColor {
  id: string;
  name?: string;
  type: "rgb" | "hsl";
  default: AnimatableColor;
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

export function instanceOfAnimatableBoolean(
  object: any,
): object is AnimatableBoolean {
  return typeof object === "boolean";
}

export function instanceOfAnimatableNumber(
  object: any,
): object is AnimatableNumber {
  return typeof object === "number";
}

export function instanceOfAnimatableString(
  object: any,
): object is AnimatableString {
  return typeof object === "string";
}

export function instanceOfAnimatableVector3(
  object: any,
): object is AnimatableVector3 {
  return (
    object.x !== undefined && object.y !== undefined && object.z !== undefined
  );
}

export function instanceOfAnimatableEuler(
  object: any,
): object is AnimatableEuler {
  return (
    object.x !== undefined && object.y !== undefined && object.z !== undefined
  );
}

export function instanceOfAnimatableColor(
  object: any,
): object is AnimatableColor {
  return (
    (object.r !== undefined &&
      object.g !== undefined &&
      object.b !== undefined) ||
    (object.h !== undefined && object.s !== undefined && object.l !== undefined)
  );
}

export function instanceOfAnimatableRGB(object: any): object is AnimatableRGB {
  return (
    object.r !== undefined && object.g !== undefined && object.b !== undefined
  );
}

export function instanceOfAnimatableHSL(object: any): object is AnimatableHSL {
  return (
    object.h !== undefined && object.s !== undefined && object.l !== undefined
  );
}

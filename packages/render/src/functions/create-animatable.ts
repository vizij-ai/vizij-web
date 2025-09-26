import {
  AnimatableValue,
  AnimatableBoolean,
  AnimatableColor,
  AnimatableEuler,
  AnimatableNumber,
  AnimatableString,
  AnimatableVector3,
} from "utils";

export function createAnimatable(value: Partial<AnimatableValue>) {
  if (!value.type) {
    return null;
  }
  if (!value.name) {
    value.name = "New Animatable";
  }
  if (value.type === "euler") {
    const newAnimatable: AnimatableEuler = {
      id: value.id ?? crypto.randomUUID(),
      name: `${value.name} Rotation`,
      type: value.type,
      default: value.default ?? { x: 0, y: 0, z: 0 },
      constraints: value.constraints ?? {
        min: [0, 0, 0],
        max: [1, 1, 1],
        velocity: 1,
      },
      pub: value.pub ?? {
        output: `${value.name}-rotation`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "vector3") {
    const newAnimatable: AnimatableVector3 = {
      id: value.id ?? crypto.randomUUID(),
      name: `${value.name} Vector3`,
      type: value.type,
      default: value.default ?? { x: 0, y: 0, z: 0 },
      constraints: value.constraints ?? {
        min: [0, 0, 0],
        max: [1, 1, 1],
        velocity: 1,
      },
      pub: value.pub ?? {
        output: `${value.name}-translation`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "string") {
    const newAnimatable: AnimatableString = {
      id: value.id ?? crypto.randomUUID(),
      name: value.name,
      type: value.type,
      default: value.default ?? "Hello World",
      constraints: value.constraints ?? { length: 25 },
      pub: value.pub ?? {
        output: `${value.name}-string`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "number") {
    const newAnimatable: AnimatableNumber = {
      id: value.id ?? crypto.randomUUID(),
      name: value.name,
      type: value.type,
      default: value.default ?? 0,
      constraints: value.constraints ?? { min: 0, max: 255, velocity: 1 },
      pub: value.pub ?? {
        output: `${value.name}-number`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "boolean") {
    const newAnimatable: AnimatableBoolean = {
      id: value.id ?? crypto.randomUUID(),
      name: value.name,
      type: value.type,
      default: value.default ?? false,
      constraints: value.constraints ?? { frequency: 1 },
      pub: value.pub ?? {
        output: `${value.name}-boolean`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "rgb") {
    const newAnimatable: AnimatableColor = {
      id: value.id ?? crypto.randomUUID(),
      name: value.name,
      type: value.type,
      default: value.default ?? { r: 0, g: 0, b: 0 },
      constraints: value.constraints ?? {
        min: [0, 0, 0],
        max: [1, 1, 1],
        velocity: 10,
      },
      pub: value.pub ?? {
        output: `${value.name}-color`,
        public: true,
      },
    };
    return newAnimatable;
  } else if (value.type === "hsl") {
    const newAnimatable: AnimatableColor = {
      id: value.id ?? crypto.randomUUID(),
      name: value.name,
      type: value.type,
      default: value.default ?? { h: 0, s: 0, l: 0 },
      constraints: value.constraints ?? {
        min: [0, 0, 0],
        max: [360, 100, 100],
        velocity: 10,
      },
      pub: value.pub ?? {
        output: `${value.name}-color`,
        public: true,
      },
    };
    return newAnimatable;
  }
  return null;
}

createAnimatable({ type: "euler", name: "Rotation" });

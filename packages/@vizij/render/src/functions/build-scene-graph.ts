import * as THREE from "three";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import {
  instanceOfRawEuler,
  instanceOfRawHSL,
  instanceOfRawNumber,
  instanceOfRawRGB,
  instanceOfRawVector2,
  instanceOfRawVector3,
} from "@vizij/utils";
import type { Feature } from "../types/feature";
import { ShapeMaterial, type Shape } from "../types/shape";
import type { World } from "../types/world";
import { createStoredRenderable } from "./create-stored-data";
import { deriveMaterialName } from "./material-name";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

type FeatureHandlers = Record<string, (value: RawValue) => void>;

type MeshMaterial =
  | THREE.MeshBasicMaterial
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshNormalMaterial
  | THREE.MeshStandardMaterial;

/**
 * Build the three.js graph of the world element `rootId` and its descendants,
 * for `exportScene`.
 *
 * Each group becomes a `THREE.Group` and each shape a `THREE.Mesh` carrying a
 * copy of its geometry and a material of its kind, as the renderer mounts
 * them, with the element's `RobotData` in `userData`. No renderer is involved,
 * so this runs in Node.
 *
 * A compound feature — translation, rotation, scale, a colour — is read whole,
 * per axis (`translation.x`, `rotation.r`, `color.g`: Semio Studio's form),
 * or both, a component given per axis standing over the whole value's. A
 * rotation is an euler `{ x, y, z }` or, as Studio names it, `{ r, p, y }`
 * (roll, pitch, yaw), applied in ZYX order.
 *
 * Every feature takes its authored value: a static feature its value, an
 * animated one its animatable's `default` in `animatables`. Node translation,
 * rotation and scale, morph weights and material factors in the exported file
 * are therefore the same numbers as the `RobotData` defaults, never a runtime
 * pose. A caller that wants other values in the file passes them as the
 * defaults of `animatables`.
 *
 * An ellipse or a rectangle becomes a node with no mesh: its RobotData —
 * `type`, `width`, `height`, `fillColor`, `fillOpacity` among its features —
 * is what the Bevy view draws it from (a unit circle or square scaled by the
 * width and height, filled with the colour and opacity). The node carries its
 * translation and rotation, and the width and height as its scale on X and Y.
 *
 * Throws when an element is missing from `world`, and when an animated
 * feature names an animatable missing from `animatables`.
 */
export function buildSceneGraph(
  world: World,
  animatables: Record<string, AnimatableValue>,
  rootId: string,
): THREE.Object3D {
  const entry = world[rootId];
  if (!entry) {
    throw new Error(`The world has no element "${rootId}".`);
  }
  const used: Record<string, AnimatableValue> = {};
  for (const feature of Object.values(entry.features) as Feature[]) {
    if (feature.animated) {
      used[feature.value] = animatableOf(animatables, feature.value);
    }
  }
  const robotData = createStoredRenderable(entry, used);

  switch (entry.type) {
    case "group": {
      const object = new THREE.Group();
      object.name = entry.name;
      object.userData = { gltfExtensions: { RobotData: robotData } };
      applyFeatures(entry.features, animatables, {
        ...groupTransform(object),
        ...perAxisTransform(object, { scale: true }),
      });
      for (const child of entry.children) {
        object.add(buildSceneGraph(world, animatables, child));
      }
      return object;
    }
    case "shape": {
      const geometry = entry.geometry.clone();
      if (entry.name) {
        geometry.name = entry.name;
      }
      const material = createMaterial(entry.material);
      material.name = deriveMaterialName(entry, used) ?? entry.name ?? "";
      const object = new THREE.Mesh(geometry, material);
      object.name = entry.name;
      object.userData = { gltfExtensions: { RobotData: robotData } };
      applyFeatures(entry.features, animatables, {
        ...shapeTransform(object),
        ...perAxisTransform(object, { scale: true }),
        ...materialFactors(material),
        ...perAxisMaterialFactors(material),
        ...morphWeights(object, entry),
      });
      for (const child of entry.children ?? []) {
        object.add(buildSceneGraph(world, animatables, child));
      }
      return object;
    }
    case "ellipse":
    case "rectangle": {
      const object = new THREE.Group();
      object.name = entry.name;
      object.userData = { gltfExtensions: { RobotData: robotData } };
      const { translation, rotation } = groupTransform(object);
      applyFeatures(entry.features, animatables, {
        translation,
        rotation,
        ...perAxisTransform(object, { scale: false }),
        width: (value) => {
          if (instanceOfRawNumber(value)) object.scale.x = value;
        },
        height: (value) => {
          if (instanceOfRawNumber(value)) object.scale.y = value;
        },
      });
      return object;
    }
  }
}

function animatableOf(
  animatables: Record<string, AnimatableValue>,
  id: string,
): AnimatableValue {
  const animatable = animatables[id];
  if (!animatable) {
    throw new Error(`No animatable "${id}".`);
  }
  return animatable;
}

function applyFeatures(
  features: Record<string, Feature | undefined>,
  animatables: Record<string, AnimatableValue>,
  handlers: FeatureHandlers,
): void {
  for (const [key, handler] of Object.entries(handlers)) {
    const feature = features[key];
    if (!feature) {
      continue;
    }
    const value = feature.animated
      ? authoredDefault(animatableOf(animatables, feature.value))
      : feature.value;
    if (value !== undefined) {
      handler(value);
    }
  }
}

function groupTransform(object: THREE.Group): FeatureHandlers {
  return {
    translation: (value) => {
      if (instanceOfRawVector3(value)) {
        object.position.set(value.x, value.y, value.z);
      } else if (instanceOfRawVector2(value)) {
        object.position.set(value.x, value.y, object.position.z);
      }
    },
    rotation: (value) => {
      const euler = eulerOf(value);
      if (euler) {
        object.rotation.set(...euler, "ZYX");
      } else if (instanceOfRawNumber(value)) {
        object.rotation.set(0, 0, 0);
        object.rotateZ(value);
      }
    },
    scale: (value) => {
      if (instanceOfRawVector3(value)) {
        if (value.x === null || value.y === null || value.z === null) {
          object.scale.set(0.1, 0.1, 0.1);
        } else {
          object.scale.set(value.x, value.y, value.z);
        }
      } else if (instanceOfRawNumber(value)) {
        object.scale.set(value, value, value);
      } else {
        object.scale.set(1, 1, 1);
      }
    },
  };
}

function shapeTransform(object: THREE.Mesh): FeatureHandlers {
  return {
    translation: (value) => {
      if (instanceOfRawVector3(value)) {
        object.position.set(value.x, value.y, value.z);
      }
    },
    rotation: (value) => {
      const euler = eulerOf(value);
      if (euler) {
        object.rotation.set(...euler, "ZYX");
      }
    },
    scale: (value) => {
      if (instanceOfRawVector3(value)) {
        object.scale.set(value.x, value.y, value.z);
      } else if (instanceOfRawNumber(value)) {
        object.scale.set(value, value, value);
      } else {
        object.scale.set(1, 1, 1);
      }
    },
  };
}

/**
 * A rotation's euler angles about X, Y and Z: an euler `{ x, y, z }`, or a
 * roll, pitch and yaw `{ r, p, y }`, Semio Studio's names for the same
 * angles. `undefined` for any other value.
 */
function eulerOf(value: RawValue): [number, number, number] | undefined {
  if (instanceOfRawEuler(value)) {
    return [value.x, value.y, value.z];
  }
  const rpy = value as { r?: unknown; p?: unknown; y?: unknown } | null;
  if (
    rpy !== null &&
    typeof rpy === "object" &&
    typeof rpy.r === "number" &&
    typeof rpy.p === "number" &&
    typeof rpy.y === "number"
  ) {
    return [rpy.r, rpy.p, rpy.y];
  }
  return undefined;
}

/**
 * Handlers for the components of `name` named per axis: `<name>.<axis>` sets
 * component `index` of the value, through `set`, and leaves the others.
 */
function perAxis(
  name: string,
  axes: readonly string[],
  set: (index: number, value: number) => void,
): FeatureHandlers {
  return Object.fromEntries(
    axes.map((axis, index) => [
      `${name}.${axis}`,
      (value: RawValue) => {
        if (instanceOfRawNumber(value)) {
          set(index, value);
        }
      },
    ]),
  );
}

/**
 * The per-axis translation and rotation of `object` and, with `scale`, its
 * per-axis scale. A rotation component recomposes the euler in ZYX order.
 */
function perAxisTransform(
  object: THREE.Object3D,
  { scale }: { scale: boolean },
): FeatureHandlers {
  return {
    ...perAxis("translation", ["x", "y", "z"], (index, value) => {
      object.position.setComponent(index, value);
    }),
    ...perAxis("rotation", ["r", "p", "y"], (index, value) => {
      const euler = [object.rotation.x, object.rotation.y, object.rotation.z];
      euler[index] = value;
      object.rotation.set(euler[0], euler[1], euler[2], "ZYX");
    }),
    ...(scale
      ? perAxis("scale", ["x", "y", "z"], (index, value) => {
          object.scale.setComponent(index, value);
        })
      : {}),
  };
}

/** The per-axis colour, emissive and specular of `material`. */
function perAxisMaterialFactors(material: MeshMaterial): FeatureHandlers {
  const standard = material as THREE.MeshStandardMaterial;
  const phong = material as THREE.MeshPhongMaterial;
  const channels = ["r", "g", "b"] as const;
  const component =
    (color: THREE.Color | undefined) => (index: number, value: number) => {
      if (color) {
        color[channels[index]] = value;
      }
    };
  return {
    ...perAxis("color", channels, component(standard.color)),
    ...perAxis("emissive", channels, component(standard.emissive)),
    ...perAxis("specular", channels, component(phong.specular)),
  };
}

function materialFactors(material: MeshMaterial): FeatureHandlers {
  const standard = material as THREE.MeshStandardMaterial;
  const phong = material as THREE.MeshPhongMaterial;
  return {
    opacity: (value) => {
      if (instanceOfRawNumber(value)) {
        material.opacity = value;
        material.transparent = value < 1.0;
      }
    },
    color: (value) => {
      if (!standard.color) {
        return;
      }
      if (instanceOfRawRGB(value)) {
        standard.color.setRGB(value.r, value.g, value.b);
      } else if (instanceOfRawVector3(value)) {
        standard.color.setRGB(value.x, value.y, value.z);
      } else if (instanceOfRawHSL(value)) {
        standard.color.setHSL(value.h, value.s, value.l);
      }
    },
    roughness: (value) => {
      if (standard.roughness !== undefined && instanceOfRawNumber(value)) {
        standard.roughness = value;
      }
    },
    metalness: (value) => {
      if (standard.metalness !== undefined && instanceOfRawNumber(value)) {
        standard.metalness = value;
      }
    },
    shininess: (value) => {
      if (phong.shininess !== undefined && instanceOfRawNumber(value)) {
        phong.shininess = value;
      }
    },
    emissive: (value) => {
      if (standard.emissive && instanceOfRawRGB(value)) {
        standard.emissive.setRGB(value.r, value.g, value.b);
      }
    },
    emissiveIntensity: (value) => {
      if (
        standard.emissiveIntensity !== undefined &&
        instanceOfRawNumber(value)
      ) {
        standard.emissiveIntensity = value;
      }
    },
    specular: (value) => {
      if (phong.specular && instanceOfRawRGB(value)) {
        phong.specular.setRGB(value.r, value.g, value.b);
      }
    },
  };
}

function morphWeights(object: THREE.Mesh, shape: Shape): FeatureHandlers {
  const targets = shape.morphTargets ?? [];
  if (targets.length === 0) {
    return {};
  }
  const influences = targets.map(() => 0);
  object.morphTargetDictionary = Object.fromEntries(
    targets.map((target, index) => [target, index]),
  );
  object.morphTargetInfluences = influences;
  return Object.fromEntries(
    targets.map((target, index) => [
      target,
      (value: RawValue) => {
        if (instanceOfRawNumber(value)) {
          influences[index] = value;
        }
      },
    ]),
  );
}

function createMaterial(kind: ShapeMaterial): MeshMaterial {
  const parameters = { side: THREE.DoubleSide };
  switch (kind) {
    case ShapeMaterial.Basic:
      return new THREE.MeshBasicMaterial(parameters);
    case ShapeMaterial.Lambert:
      return new THREE.MeshLambertMaterial(parameters);
    case ShapeMaterial.Phong:
      return new THREE.MeshPhongMaterial(parameters);
    case ShapeMaterial.Normal:
      return new THREE.MeshNormalMaterial(parameters);
    case ShapeMaterial.Standard:
      return new THREE.MeshStandardMaterial(parameters);
  }
}

const SCALAR_KEYS = ["f32", "f64", "i64", "i32", "u64", "u32", "float"];

function scalarOf(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of SCALAR_KEYS) {
      const scalar = (value as Record<string, unknown>)[key];
      if (typeof scalar === "number") {
        return scalar;
      }
    }
  }
  return undefined;
}

/**
 * An animatable's `default` as the renderer's raw value.
 *
 * Defaults loaded from a GLB are arora Values: a number is `{ f32: n }` and a
 * vector or colour is `{ struct: { fields } }` with its components in order.
 * Raw defaults pass through.
 */
function authoredDefault(animatable: AnimatableValue): RawValue | undefined {
  const value: unknown = animatable.default;
  const scalar = scalarOf(value);
  if (scalar !== undefined) {
    return scalar;
  }
  const fields = (value as { struct?: { fields?: unknown } } | null)?.struct
    ?.fields;
  if (!Array.isArray(fields)) {
    return value as RawValue | undefined;
  }
  const n = fields.map(
    (field) => scalarOf((field as { value?: unknown } | null)?.value) ?? 0,
  );
  switch (animatable.type) {
    case "vector3":
    case "euler":
      return { x: n[0], y: n[1], z: n[2] };
    case "vector2":
      return { x: n[0], y: n[1] };
    case "rgb":
      return { r: n[0], g: n[1], b: n[2] };
    case "hsl":
      return { h: n[0], s: n[1], l: n[2] };
    default:
      return undefined;
  }
}

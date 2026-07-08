// @ts-nocheck
import { createRef } from "react";
import type { RefObject } from "react";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { BindingMap } from "@vizij/node-graph-authoring";
import type {
  World,
  Feature,
  Shape,
  Group,
  ShapeMaterial,
} from "@vizij/render";
import {
  cloneRawValue,
  createBrowserSafeId,
  getLookup,
  type AnimatableValue,
  type RawValue,
  type RawVector3,
} from "@vizij/utils";

const MATERIAL_FEATURE_KEYS = [
  "color",
  "opacity",
  "roughness",
  "metalness",
  "shininess",
] as const;

type MaterialFeatureKey = (typeof MATERIAL_FEATURE_KEYS)[number];

type TransformKey = "translation" | "rotation" | "scale";

export interface SceneMaterial {
  id: string;
  label: string;
  type: ShapeMaterial;
  featureKeys: MaterialFeatureKey[];
  animated: Partial<Record<MaterialFeatureKey, string>>;
  staticValues: Partial<Record<MaterialFeatureKey, RawValue>>;
  memberShapeIds: string[];
  sourceShapeId: string;
}

export interface SceneEditState {
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  bindings: BindingMap;
  featureLabelOverrides?: Record<string, string>;
  namespace: string;
}

export interface DuplicateNodeOptions {
  includeChildren?: boolean;
  parentId?: string | null;
  cloneInputs?: (inputIds: Set<string>) => Map<string, string>;
}

export interface DuplicateNodeResult {
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  bindings: BindingMap;
  featureLabelOverrides?: Record<string, string>;
  idMap: Map<string, string>;
  newRootId: string;
  clonedInputMap?: Map<string, string> | null;
}

export interface SceneMutationResult {
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  bindings: BindingMap;
  featureLabelOverrides?: Record<string, string>;
  driverScaleAdjustments?: Map<string, number>;
}

export const TRANSLATION_SCALE_COMPENSATION = false;
export const ROTATION_COMPENSATION = false;

type RenderableWithChildren = (Shape | Group | { children?: string[] }) & {
  id: string;
  name?: string;
  type?: string;
  refs?: Record<string, RefObject<any>>;
  features?: Record<string, Feature | undefined>;
  children?: string[];
  root?: boolean;
  material?: ShapeMaterial;
};

function isVector3Like(value: unknown): value is RawVector3 {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in (value as Record<string, unknown>) &&
    "y" in (value as Record<string, unknown>) &&
    "z" in (value as Record<string, unknown>)
  );
}

function toVector3(value: RawValue | undefined, fallback: Vector3): Vector3 {
  if (typeof value === "number") {
    return new Vector3(value, value, value);
  }
  if (isVector3Like(value)) {
    const record = value as RawVector3;
    const x = typeof record.x === "number" ? record.x : 0;
    const y = typeof record.y === "number" ? record.y : 0;
    const z = typeof record.z === "number" ? record.z : 0;
    return new Vector3(x, y, z);
  }
  return fallback.clone();
}

function toEuler(value: RawValue | undefined, fallback: Euler): Euler {
  if (isVector3Like(value)) {
    const record = value as RawVector3;
    const x = typeof record.x === "number" ? record.x : 0;
    const y = typeof record.y === "number" ? record.y : 0;
    const z = typeof record.z === "number" ? record.z : 0;
    return new Euler(x, y, z, "ZYX");
  }
  return fallback.clone();
}

function buildParentIndex(world: World): Map<string, string> {
  const parentIndex = new Map<string, string>();
  Object.values(world).forEach((entry) => {
    const children = (entry as RenderableWithChildren).children ?? [];
    children.forEach((childId) => {
      if (!parentIndex.has(childId)) {
        parentIndex.set(childId, entry.id);
      }
    });
  });
  return parentIndex;
}

function collectDescendants(world: World, rootId: string): Set<string> {
  const descendants = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    if (descendants.has(current)) {
      continue;
    }
    descendants.add(current);
    const entry = world[current] as RenderableWithChildren | undefined;
    if (!entry?.children) {
      continue;
    }
    entry.children.forEach((child) => pending.push(child));
  }
  return descendants;
}

function readFeatureValue(
  renderable: { features?: Record<string, Feature | undefined> },
  key: string,
  animatables: Record<string, AnimatableValue>,
  values: Map<string, RawValue | undefined>,
  namespace: string,
): RawValue | undefined {
  const feature = renderable.features?.[key];
  if (!feature) {
    return undefined;
  }
  if (!feature.animated) {
    return cloneRawValue(feature.value);
  }
  const animatable = animatables[feature.value];
  const lookup = getLookup(namespace, feature.value);
  const current = values.get(lookup);
  if (current !== undefined) {
    return cloneRawValue(current);
  }
  return cloneRawValue(animatable?.default as RawValue);
}

function buildLocalTransform(
  renderable: { features?: Record<string, Feature | undefined> },
  animatables: Record<string, AnimatableValue>,
  values: Map<string, RawValue | undefined>,
  namespace: string,
) {
  const translation = toVector3(
    readFeatureValue(renderable, "translation", animatables, values, namespace),
    new Vector3(),
  );
  const rotation = toEuler(
    readFeatureValue(renderable, "rotation", animatables, values, namespace),
    new Euler(0, 0, 0, "ZYX"),
  );
  const scale = toVector3(
    readFeatureValue(renderable, "scale", animatables, values, namespace),
    new Vector3(1, 1, 1),
  );

  const matrix = new Matrix4();
  const quat = new Quaternion().setFromEuler(rotation);
  matrix.compose(translation, quat, scale);

  return { translation, rotation, scale, matrix };
}

function computeWorldMatrices(
  world: World,
  animatables: Record<string, AnimatableValue>,
  values: Map<string, RawValue | undefined>,
  namespace: string,
): Map<string, Matrix4> {
  const parentIndex = buildParentIndex(world);
  const roots = Object.values(world)
    .filter((entry) => !parentIndex.has(entry.id))
    .map((entry) => entry.id);
  const matrices = new Map<string, Matrix4>();

  const traverse = (id: string, parentMatrix: Matrix4) => {
    const entry = world[id];
    if (!entry) return;
    const { matrix } = buildLocalTransform(
      entry,
      animatables,
      values,
      namespace,
    );
    const worldMatrix = parentMatrix.clone().multiply(matrix);
    matrices.set(id, worldMatrix);
    const children = (entry as RenderableWithChildren).children ?? [];
    children.forEach((child) => traverse(child, worldMatrix));
  };

  const identity = new Matrix4();
  roots.forEach((rootId) => traverse(rootId, identity));
  return matrices;
}

function setTransformFeature(
  renderable: RenderableWithChildren,
  featureKey: TransformKey,
  nextValue: RawValue,
  animatables: Record<string, AnimatableValue>,
  values: Map<string, RawValue | undefined>,
  namespace: string,
): {
  renderable: RenderableWithChildren;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
} {
  const existing = renderable.features?.[featureKey];
  const nextAnimatables = { ...animatables };
  const nextValues = new Map(values);
  const nextFeatures: Record<string, Feature | undefined> = {
    ...(renderable.features ?? {}),
  };

  if (existing?.animated) {
    const descriptor = animatables[existing.value];
    if (descriptor) {
      nextAnimatables[existing.value] = {
        ...descriptor,
        default: cloneRawValue(nextValue) as never,
      } as AnimatableValue;
      nextValues.set(
        getLookup(namespace, existing.value),
        cloneRawValue(nextValue),
      );
      nextFeatures[featureKey] = { ...existing } as Feature;
    } else {
      nextFeatures[featureKey] = {
        animated: false,
        value: cloneRawValue(nextValue),
      };
    }
  } else {
    nextFeatures[featureKey] = {
      animated: false,
      value: cloneRawValue(nextValue),
    };
  }

  return {
    renderable: {
      ...renderable,
      features: nextFeatures,
    },
    animatables: nextAnimatables,
    values: nextValues,
  };
}

function updateTransforms(
  renderable: RenderableWithChildren,
  nextValues: {
    translation: Vector3;
    rotation: Euler;
    scale: Vector3;
  },
  animatables: Record<string, AnimatableValue>,
  values: Map<string, RawValue | undefined>,
  namespace: string,
) {
  let working: RenderableWithChildren = renderable;
  let workingAnimatables = animatables;
  let workingValues = values;

  const rotValue = {
    x: nextValues.rotation.x,
    y: nextValues.rotation.y,
    z: nextValues.rotation.z,
  };
  const scaleValue = {
    x: nextValues.scale.x,
    y: nextValues.scale.y,
    z: nextValues.scale.z,
  };
  const translationValue = {
    x: nextValues.translation.x,
    y: nextValues.translation.y,
    z: nextValues.translation.z,
  };

  ({
    renderable: working,
    animatables: workingAnimatables,
    values: workingValues,
  } = setTransformFeature(
    working,
    "translation",
    translationValue,
    workingAnimatables,
    workingValues,
    namespace,
  ));

  ({
    renderable: working,
    animatables: workingAnimatables,
    values: workingValues,
  } = setTransformFeature(
    working,
    "rotation",
    rotValue,
    workingAnimatables,
    workingValues,
    namespace,
  ));

  ({
    renderable: working,
    animatables: workingAnimatables,
    values: workingValues,
  } = setTransformFeature(
    working,
    "scale",
    scaleValue,
    workingAnimatables,
    workingValues,
    namespace,
  ));

  return {
    renderable: working,
    animatables: workingAnimatables,
    values: workingValues,
  };
}

function pruneBindingsForAnimatables(
  bindings: BindingMap,
  animatableIds: Set<string>,
): BindingMap {
  if (animatableIds.size === 0) {
    return bindings;
  }
  let changed = false;
  const next: BindingMap = {};
  Object.entries(bindings).forEach(([targetId, binding]) => {
    const rootId = targetId.split(":")[0];
    if (animatableIds.has(targetId) || animatableIds.has(rootId)) {
      changed = true;
      return;
    }
    next[targetId] = binding;
  });
  return changed ? next : bindings;
}

function buildAnimatableUsage(world: World): Map<string, number> {
  const usage = new Map<string, number>();
  Object.values(world).forEach((entry) => {
    Object.values(entry.features ?? {}).forEach((feature) => {
      if (feature?.animated) {
        const count = usage.get(feature.value) ?? 0;
        usage.set(feature.value, count + 1);
      }
    });
  });
  return usage;
}

function cloneRefs<T>(
  refs: Record<string, RefObject<T>>,
): Record<string, RefObject<T>> {
  return Object.keys(refs ?? {}).reduce(
    (acc, ns) => ({ ...acc, [ns]: createRef<T>() }),
    {} as Record<string, RefObject<T>>,
  );
}

function renameText(
  value: string | undefined,
  currentName: string,
  nextName: string,
): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  if (trimmed === currentName) {
    return value.replace(trimmed, nextName);
  }
  if (trimmed.startsWith(`${currentName} `)) {
    return value.replace(
      trimmed,
      `${nextName}${trimmed.slice(currentName.length)}`,
    );
  }
  return value;
}

function cloneAnimatable(
  source: AnimatableValue,
  newId: string,
  nameHint?: string,
  currentName?: string,
  nextName?: string,
): AnimatableValue {
  const nameReplacement =
    currentName && nextName
      ? renameText(source.name, currentName, nextName)
      : undefined;
  const pubName =
    currentName && nextName
      ? renameText(source.pub?.output, currentName, nextName)
      : source.pub?.output;
  return {
    ...source,
    id: newId,
    name:
      nameReplacement ?? (source.name ? `${source.name} (Copy)` : source.name),
    pub: source.pub
      ? {
          ...source.pub,
          output:
            pubName ??
            (source.pub.output ? `${source.pub.output} Copy` : undefined),
        }
      : source.pub,
  } as AnimatableValue;
}

function mapTargetId(
  targetId: string,
  animatableMap: Map<string, string>,
): string | null {
  for (const [oldId, newId] of animatableMap.entries()) {
    if (targetId === oldId) {
      return newId;
    }
    if (targetId.startsWith(`${oldId}:`)) {
      return `${newId}${targetId.slice(oldId.length)}`;
    }
  }
  return null;
}

function cloneBindingsForAnimatables(
  bindings: BindingMap,
  animatableMap: Map<string, string>,
  inputRemap?: Map<string, string>,
  usedInputIds?: Set<string>,
  includeOriginalParents?: boolean,
): BindingMap {
  const additions: BindingMap = {};
  Object.entries(bindings).forEach(([targetId, binding]) => {
    const mapped = mapTargetId(targetId, animatableMap);
    if (!mapped) return;
    const cloned = {
      ...binding,
      targetId: mapped,
      inputId: binding.inputId
        ? (inputRemap?.get(binding.inputId) ??
          (includeOriginalParents ? binding.inputId : null))
        : binding.inputId,
      slots: binding.slots.map((slot) => ({
        ...slot,
        inputId: slot.inputId
          ? (inputRemap?.get(slot.inputId) ??
            (includeOriginalParents ? slot.inputId : null))
          : slot.inputId,
      })),
    };
    cloned.slots.forEach((slot) => {
      if (slot.inputId) {
        usedInputIds?.add(slot.inputId);
      }
    });
    if (cloned.inputId) {
      usedInputIds?.add(cloned.inputId);
    }
    additions[mapped] = cloned;
  });
  return additions;
}

function createChildrenArray(
  renderable: RenderableWithChildren | undefined,
): string[] {
  if (!renderable) return [];
  return Array.isArray(renderable.children) ? [...renderable.children] : [];
}

function generateCopyName(base: string, existing: Set<string>): string {
  let attempt = `${base} Copy`;
  let counter = 2;
  while (existing.has(attempt)) {
    attempt = `${base} Copy ${counter}`;
    counter += 1;
  }
  return attempt;
}

function updateHierarchy(
  world: World,
  nodeId: string,
  newParentId: string | null,
  parentIndex: Map<string, string>,
): World {
  const nextWorld = { ...world } as World;

  const oldParentId = parentIndex.get(nodeId) ?? null;
  if (oldParentId) {
    const parent = nextWorld[oldParentId] as RenderableWithChildren | undefined;
    if (parent) {
      const filtered = createChildrenArray(parent).filter(
        (child) => child !== nodeId,
      );
      nextWorld[oldParentId] = {
        ...parent,
        children: filtered,
      } as typeof parent;
    }
  }

  if (newParentId) {
    const parent = nextWorld[newParentId] as RenderableWithChildren | undefined;
    if (parent) {
      const children = createChildrenArray(parent);
      if (!children.includes(nodeId)) {
        children.push(nodeId);
      }
      nextWorld[newParentId] = { ...parent, children } as typeof parent;
    }
  }

  return nextWorld;
}

export function reparentSceneNodeWithPreservedWorld(
  state: SceneEditState,
  nodeId: string,
  newParentId: string | null,
): SceneMutationResult | null {
  const {
    world,
    animatables,
    values,
    bindings,
    namespace,
    featureLabelOverrides,
  } = state;
  if (!world[nodeId]) {
    return null;
  }

  if (newParentId === nodeId) {
    return null;
  }

  const parentIndex = buildParentIndex(world);
  const descendants = collectDescendants(world, nodeId);
  if (newParentId && descendants.has(newParentId)) {
    return null;
  }

  const matrices = computeWorldMatrices(world, animatables, values, namespace);
  const currentWorldMatrix = matrices.get(nodeId);
  const parentWorldMatrix = newParentId
    ? matrices.get(newParentId)
    : new Matrix4();
  if (!currentWorldMatrix) {
    return null;
  }
  const parentMatrix = parentWorldMatrix ?? new Matrix4();

  const oldParentId = parentIndex.get(nodeId) ?? null;
  const oldParentMatrix =
    oldParentId && matrices.has(oldParentId)
      ? (matrices.get(oldParentId) as Matrix4)
      : new Matrix4();

  const parentInverse = parentMatrix.clone().invert();
  const nextLocalMatrix = new Matrix4().multiplyMatrices(
    parentInverse,
    currentWorldMatrix,
  );
  const nextPosition = new Vector3();
  const nextQuat = new Quaternion();
  const nextScale = new Vector3();
  nextLocalMatrix.decompose(nextPosition, nextQuat, nextScale);
  const nextEuler = new Euler().setFromQuaternion(nextQuat, "ZYX");

  const entry = world[nodeId] as RenderableWithChildren;
  const {
    renderable,
    animatables: updatedAnimatables,
    values: updatedValues,
  } = updateTransforms(
    entry,
    {
      translation: nextPosition,
      rotation: ROTATION_COMPENSATION
        ? nextEuler
        : toEuler(
            readFeatureValue(entry, "rotation", animatables, values, namespace),
            new Euler(0, 0, 0, "ZYX"),
          ),
      scale: nextScale,
    },
    animatables,
    values,
    namespace,
  );

  const nextWorld: World = {
    ...world,
    [nodeId]: renderable,
  };

  const reparentedWorld = updateHierarchy(
    nextWorld,
    nodeId,
    newParentId,
    parentIndex,
  );

  // Adjust translation binding expressions to account for parent scale change so driver deltas stay stable.
  let nextBindings = bindings;
  const driverScaleAdjustments = new Map<string, number>();
  if (TRANSLATION_SCALE_COMPENSATION) {
    const translationFeature = renderable.features?.translation;
    if (translationFeature?.animated) {
      const animId = translationFeature.value;
      const oldScale = new Vector3();
      const oldQuat = new Quaternion();
      const oldPos = new Vector3();
      oldParentMatrix.decompose(oldPos, oldQuat, oldScale);

      const newScale = new Vector3();
      const newQuat2 = new Quaternion();
      const newPos2 = new Vector3();
      parentMatrix.decompose(newPos2, newQuat2, newScale);

      const ratios: Record<"x" | "y" | "z", number> = {
        x: safeRatio(oldScale.x, newScale.x),
        y: safeRatio(oldScale.y, newScale.y),
        z: safeRatio(oldScale.z, newScale.z),
      };

      const maybeScaleBinding = (axis: "x" | "y" | "z") => {
        const targetId = `${animId}:${axis}`;
        const binding = bindings[targetId];
        if (!binding) return;
        const factor = ratios[axis];
        if (Number.isFinite(factor) && factor !== 1) {
          const baseExpr = (binding.expression ?? "").trim() || "s1";
          const needsWrap =
            baseExpr.includes(" ") ||
            baseExpr.includes("*") ||
            baseExpr.includes("+") ||
            baseExpr.includes("-");
          const wrapped = needsWrap ? `(${baseExpr})` : baseExpr;
          nextBindings = {
            ...nextBindings,
            [targetId]: { ...binding, expression: `${wrapped}*${factor}` },
          };
          binding.slots.forEach((slot) => {
            recordInputFactor(driverScaleAdjustments, slot.inputId, factor);
          });
          recordInputFactor(driverScaleAdjustments, binding.inputId, factor);
        }
      };

      maybeScaleBinding("x");
      maybeScaleBinding("y");
      maybeScaleBinding("z");
    }
  }

  return {
    world: reparentedWorld,
    animatables: updatedAnimatables,
    values: updatedValues,
    bindings: nextBindings,
    featureLabelOverrides,
  };
}

function safeRatio(a: number, b: number): number {
  if (b === 0) return 1;
  const ratio = a / b;
  if (!Number.isFinite(ratio) || ratio === 0) return 1;
  return ratio;
}

function recordInputFactor(
  map: Map<string, number>,
  inputId: string | null | undefined,
  factor: number,
) {
  if (!inputId || !Number.isFinite(factor) || factor === 0) {
    return;
  }
  const existing = map.get(inputId);
  if (existing !== undefined && Math.abs(existing - factor) > 1e-3) {
    // Conflicting factors for a shared input—skip adjusting to avoid corrupting ranges.
    map.delete(inputId);
    // eslint-disable-next-line no-console -- debug aid for authoring flows
    console.warn("[vizij] skip driver scaling – conflicting factors", inputId, {
      existing,
      factor,
    });
    return;
  }
  map.set(inputId, factor);
}

export function duplicateSceneNode(
  state: SceneEditState,
  nodeId: string,
  options?: DuplicateNodeOptions,
): DuplicateNodeResult | null {
  const {
    world,
    animatables,
    values,
    bindings,
    namespace,
    featureLabelOverrides,
  } = state;
  const includeChildren = options?.includeChildren ?? true;
  const entry = world[nodeId];
  if (!entry) return null;

  const parentIndex = buildParentIndex(world);
  const idsToClone = includeChildren
    ? collectDescendants(world, nodeId)
    : new Set([nodeId]);
  const newIdMap = new Map<string, string>();
  idsToClone.forEach((id) => newIdMap.set(id, createBrowserSafeId()));

  const animIdMap = new Map<string, string>();
  const nextWorld: World = { ...world };
  const nextAnimatables: Record<string, AnimatableValue> = { ...animatables };
  const nextValues = new Map(values);
  const nextFeatureLabelOverrides = featureLabelOverrides
    ? { ...featureLabelOverrides }
    : undefined;

  const existingNames = new Set(
    Object.values(world)
      .map((node) => node.name || node.id)
      .filter(Boolean),
  );

  idsToClone.forEach((id) => {
    const original = world[id] as RenderableWithChildren;
    const newId = newIdMap.get(id)!;
    const newName = generateCopyName(
      original.name || original.id,
      existingNames,
    );
    existingNames.add(newName);

    const clonedFeatures: Record<string, Feature | undefined> = {};
    Object.entries(original.features ?? {}).forEach(([featureKey, feature]) => {
      if (!feature) {
        return;
      }
      if (feature.animated) {
        const sourceAnim = animatables[feature.value];
        const newAnimId = createBrowserSafeId();
        animIdMap.set(feature.value, newAnimId);
        const clonedAnim = cloneAnimatable(
          sourceAnim,
          newAnimId,
          undefined,
          original.name,
          newName,
        );
        nextAnimatables[newAnimId] = clonedAnim;

        const lookup = getLookup(namespace, feature.value);
        if (values.has(lookup)) {
          nextValues.set(
            getLookup(namespace, newAnimId),
            cloneRawValue(values.get(lookup) as RawValue),
          );
        }

        clonedFeatures[featureKey] = {
          ...feature,
          value: newAnimId,
        } as Feature;
      } else {
        clonedFeatures[featureKey] = {
          ...feature,
          value: cloneRawValue(feature.value as RawValue),
        } as Feature;
      }
    });

    const cloned: RenderableWithChildren = {
      ...original,
      id: newId,
      name: newName,
      refs: cloneRefs((original.refs ?? {}) as Record<string, RefObject<any>>),
      features: clonedFeatures,
      root: original.type === "group" ? false : (original as any).root,
    } as RenderableWithChildren;

    if (original.children && includeChildren) {
      cloned.children = original.children
        .filter((child) => idsToClone.has(child))
        .map((child) => newIdMap.get(child)!) as string[];
    } else if (original.children) {
      cloned.children = [];
    }

    nextWorld[newId] = cloned as unknown as World[string];

    if (nextFeatureLabelOverrides) {
      Object.keys(original.features ?? {}).forEach((featureKey) => {
        const overrideKey = `${id}:${featureKey}`;
        if (
          nextFeatureLabelOverrides &&
          overrideKey in nextFeatureLabelOverrides
        ) {
          nextFeatureLabelOverrides[`${newId}:${featureKey}`] =
            nextFeatureLabelOverrides[overrideKey];
        }
      });
    }
  });

  idsToClone.forEach((id) => {
    const original = world[id] as RenderableWithChildren;
    const newId = newIdMap.get(id)!;
    const cloned = nextWorld[newId] as RenderableWithChildren;
    const originalChildren = createChildrenArray(original);
    if (originalChildren.length > 0 && includeChildren) {
      cloned.children = originalChildren
        .filter((child) => idsToClone.has(child))
        .map((child) => newIdMap.get(child)!) as string[];
      nextWorld[newId] = { ...cloned } as unknown as World[string];
    }
  });

  idsToClone.forEach((id) => {
    const newId = newIdMap.get(id)!;
    const originalParent = parentIndex.get(id) ?? null;
    let resolvedParent = originalParent;
    if (id === nodeId && options?.parentId !== undefined) {
      resolvedParent = options.parentId;
    } else if (originalParent && idsToClone.has(originalParent)) {
      resolvedParent = newIdMap.get(originalParent)!;
    }

    if (resolvedParent) {
      const parent = nextWorld[resolvedParent] as
        | RenderableWithChildren
        | undefined;
      if (parent) {
        const children = createChildrenArray(parent);
        if (children.includes(newId)) {
          return;
        }
        const siblingIndex = children.indexOf(id);
        const insertIndex =
          siblingIndex >= 0 ? siblingIndex + 1 : children.length;
        const nextChildren = [
          ...children.slice(0, insertIndex),
          newId,
          ...children.slice(insertIndex),
        ];
        nextWorld[resolvedParent] = {
          ...parent,
          children: nextChildren,
        } as unknown as World[string];
      }
    }
  });

  // Clone any driver inputs referenced by bindings that target the duplicated animatables.
  let clonedInputMap: Map<string, string> | null = null;
  if (options?.cloneInputs) {
    const inputsToClone = new Set<string>();
    Object.entries(bindings).forEach(([targetId, binding]) => {
      const mapped = mapTargetId(targetId, animIdMap);
      if (!mapped) return;
      if (binding.inputId) {
        inputsToClone.add(binding.inputId);
      }
      binding.slots.forEach((slot) => {
        if (slot.inputId) {
          inputsToClone.add(slot.inputId);
        }
      });
    });
    if (inputsToClone.size > 0) {
      clonedInputMap = options.cloneInputs(inputsToClone);
    }
  }

  // Clone bindings for duplicated animatables, applying input remaps when available.
  const clonedBindings = cloneBindingsForAnimatables(
    bindings,
    animIdMap,
    clonedInputMap ?? undefined,
    undefined,
    clonedInputMap ? false : true,
  );

  const mergedBindings =
    Object.keys(clonedBindings).length > 0
      ? { ...bindings, ...clonedBindings }
      : bindings;

  const nextBindings =
    clonedInputMap && clonedInputMap.size > 0
      ? (() => {
          const remapped: BindingMap = { ...mergedBindings };
          const animSet = new Set(animIdMap.values());
          Object.entries(mergedBindings).forEach(([targetId, binding]) => {
            const rootId = targetId.split(":")[0];
            if (!animSet.has(rootId)) {
              return;
            }
            const mapInput = (id?: string | null): string | null =>
              id ? (clonedInputMap!.get(id) ?? id) : null;
            remapped[targetId] = {
              ...binding,
              inputId: mapInput(binding.inputId),
              slots: binding.slots.map((slot) => ({
                ...slot,
                inputId: mapInput(slot.inputId),
              })),
            };
          });
          return remapped;
        })()
      : mergedBindings;

  return {
    world: nextWorld,
    animatables: nextAnimatables,
    values: nextValues,
    bindings: nextBindings,
    featureLabelOverrides: nextFeatureLabelOverrides,
    idMap: newIdMap,
    newRootId: newIdMap.get(nodeId)!,
    clonedInputMap,
  };
}

export function deleteSceneNode(
  state: SceneEditState,
  nodeId: string,
  options?: { includeChildren?: boolean },
): SceneMutationResult | null {
  const {
    world,
    animatables,
    values,
    bindings,
    namespace,
    featureLabelOverrides,
  } = state;
  if (!world[nodeId]) {
    return null;
  }
  const includeChildren = options?.includeChildren ?? true;
  const toRemove = includeChildren
    ? collectDescendants(world, nodeId)
    : new Set([nodeId]);
  const nextWorld: World = { ...world };
  toRemove.forEach((id) => {
    delete nextWorld[id];
  });

  Object.entries(nextWorld).forEach(([id, entry]) => {
    const children = (entry as RenderableWithChildren).children;
    if (!children) return;
    const filtered = children.filter((child) => !toRemove.has(child));
    if (filtered.length !== children.length) {
      nextWorld[id] = { ...entry, children: filtered } as World[string];
    }
  });

  const usage = buildAnimatableUsage(nextWorld);
  const nextAnimatables: Record<string, AnimatableValue> = { ...animatables };
  const nextValues = new Map(values);
  const removedAnimIds = new Set<string>();

  Object.keys(animatables).forEach((animId) => {
    if (usage.get(animId) === undefined) {
      delete nextAnimatables[animId];
      nextValues.delete(getLookup(namespace, animId));
      removedAnimIds.add(animId);
    }
  });

  const nextBindings = pruneBindingsForAnimatables(bindings, removedAnimIds);

  let nextFeatureLabelOverrides = featureLabelOverrides;
  if (featureLabelOverrides) {
    const filtered: Record<string, string> = {};
    Object.entries(featureLabelOverrides).forEach(([key, value]) => {
      const [ownerId] = key.split(":");
      if (!toRemove.has(ownerId)) {
        filtered[key] = value;
      }
    });
    nextFeatureLabelOverrides = filtered;
  }

  return {
    world: nextWorld,
    animatables: nextAnimatables,
    values: nextValues,
    bindings: nextBindings,
    featureLabelOverrides: nextFeatureLabelOverrides,
  };
}

export function materialKey(shape: Shape): string {
  const parts: string[] = [`type:${shape.material}`];
  MATERIAL_FEATURE_KEYS.forEach((key) => {
    const feature = shape.features?.[key];
    if (!feature) return;
    if (feature.animated) {
      parts.push(`${key}:anim:${feature.value}`);
    } else {
      parts.push(`${key}:static:${JSON.stringify(feature.value)}`);
    }
  });
  return parts.join("|");
}

function deriveMaterialLabel(
  shape: Shape,
  animatables: Record<string, AnimatableValue>,
): string {
  const colorFeature = shape.features?.color;
  if (colorFeature?.animated) {
    const anim = animatables[colorFeature.value];
    return (
      anim?.pub?.output?.trim() ||
      anim?.name?.trim() ||
      shape.name ||
      shape.id ||
      "Material"
    );
  }
  return shape.name ? `${shape.name} material` : "Material";
}

export function buildSceneMaterials(state: {
  world: World;
  animatables: Record<string, AnimatableValue>;
}): SceneMaterial[] {
  const { world, animatables } = state;
  const materials = new Map<string, SceneMaterial>();

  Object.values(world).forEach((entry) => {
    if (entry.type !== "shape") return;
    const shape = entry as Shape;
    const key = materialKey(shape);
    const label = deriveMaterialLabel(shape, animatables);
    const descriptor: SceneMaterial = materials.get(key) ?? {
      id: key,
      label,
      type: shape.material,
      featureKeys: [],
      animated: {},
      staticValues: {},
      memberShapeIds: [],
      sourceShapeId: shape.id,
    };

    MATERIAL_FEATURE_KEYS.forEach((feat) => {
      const feature = shape.features?.[feat];
      if (!feature) return;
      if (!descriptor.featureKeys.includes(feat)) {
        descriptor.featureKeys.push(feat);
      }
      if (feature.animated) {
        descriptor.animated[feat] = feature.value;
      } else {
        descriptor.staticValues[feat] = cloneRawValue(feature.value);
      }
    });

    descriptor.memberShapeIds.push(shape.id);
    materials.set(key, descriptor);
  });

  return Array.from(materials.values());
}

export function assignMaterialToShape(
  state: SceneEditState,
  shapeId: string,
  materialId: string,
): SceneMutationResult | null {
  const {
    world,
    animatables,
    values,
    bindings,
    namespace,
    featureLabelOverrides,
  } = state;
  const shape = world[shapeId];
  if (!shape || shape.type !== "shape") return null;
  const materials = buildSceneMaterials({ world, animatables });
  const material = materials.find((entry) => entry.id === materialId);
  if (!material) return null;

  const nextWorld: World = { ...world };
  const nextAnimatables: Record<string, AnimatableValue> = { ...animatables };
  const nextValues = new Map(values);
  const removedAnimatables = new Set<string>();

  const nextFeatures: Record<string, Feature | undefined> = {
    ...(shape.features ?? {}),
  };

  MATERIAL_FEATURE_KEYS.forEach((key) => {
    const targetAnim = material.animated[key];
    const targetStatic = material.staticValues[key];
    const currentFeature = shape.features?.[key];
    if (
      currentFeature?.animated &&
      currentFeature.value &&
      currentFeature.value !== targetAnim
    ) {
      removedAnimatables.add(currentFeature.value);
    }
    if (targetAnim) {
      nextFeatures[key] = { animated: true, value: targetAnim } as Feature;
    } else if (targetStatic !== undefined) {
      nextFeatures[key] = {
        animated: false,
        value: cloneRawValue(targetStatic),
      };
    }
  });

  const updatedShape: Shape = {
    ...(shape as Shape),
    material: material.type,
    features: nextFeatures,
  } as Shape;

  nextWorld[shapeId] = updatedShape as World[string];
  const usage = buildAnimatableUsage(nextWorld);
  const leftover = new Set<string>();
  removedAnimatables.forEach((animId) => {
    if (usage.get(animId) === undefined) {
      delete nextAnimatables[animId];
      nextValues.delete(getLookup(namespace, animId));
      leftover.add(animId);
    }
  });

  const prunedBindings = pruneBindingsForAnimatables(bindings, leftover);

  return {
    world: nextWorld,
    animatables: nextAnimatables,
    values: nextValues,
    bindings: prunedBindings,
    featureLabelOverrides,
  };
}

export function duplicateMaterialForShape(
  state: SceneEditState,
  shapeId: string,
  options?: { label?: string; type?: ShapeMaterial; copyBindings?: boolean },
): SceneMutationResult | null {
  const {
    world,
    animatables,
    values,
    bindings,
    namespace,
    featureLabelOverrides,
  } = state;
  const shape = world[shapeId];
  if (!shape || shape.type !== "shape") return null;

  const label =
    options?.label ?? deriveMaterialLabel(shape as Shape, animatables);
  const materialType = options?.type ?? (shape as Shape).material;

  const animIdMap = new Map<string, string>();
  const nextAnimatables: Record<string, AnimatableValue> = { ...animatables };
  const nextValues = new Map(values);
  const nextFeatures: Record<string, Feature | undefined> = {
    ...(shape.features ?? {}),
  };

  MATERIAL_FEATURE_KEYS.forEach((key) => {
    const feature = shape.features?.[key];
    if (!feature) return;
    if (feature.animated) {
      const sourceAnim = animatables[feature.value];
      const newAnimId = createBrowserSafeId();
      animIdMap.set(feature.value, newAnimId);
      const nameSuffix = `${label} ${key}`.trim();
      const clonedAnim: AnimatableValue = {
        ...cloneAnimatable(
          sourceAnim,
          newAnimId,
          nameSuffix,
          shape.name,
          label,
        ),
        name: nameSuffix,
        pub: sourceAnim.pub
          ? { ...sourceAnim.pub, output: `${nameSuffix}` }
          : { public: true, output: nameSuffix },
      } as AnimatableValue;
      nextAnimatables[newAnimId] = clonedAnim;
      const lookup = getLookup(namespace, feature.value);
      if (values.has(lookup)) {
        nextValues.set(
          getLookup(namespace, newAnimId),
          cloneRawValue(values.get(lookup) as RawValue),
        );
      }
      nextFeatures[key] = { ...feature, value: newAnimId } as Feature;
    } else {
      nextFeatures[key] = {
        animated: false,
        value: cloneRawValue(feature.value as RawValue),
      } as Feature;
    }
  });

  const nextBindings = options?.copyBindings
    ? (() => {
        const additions = cloneBindingsForAnimatables(bindings, animIdMap);
        return Object.keys(additions).length > 0
          ? { ...bindings, ...additions }
          : bindings;
      })()
    : bindings;

  const updatedShape: Shape = {
    ...(shape as Shape),
    material: materialType,
    features: nextFeatures,
  } as Shape;

  const nextWorld: World = {
    ...world,
    [shapeId]: updatedShape as World[string],
  };

  return {
    world: nextWorld,
    animatables: nextAnimatables,
    values: nextValues,
    bindings: nextBindings,
    featureLabelOverrides,
  };
}

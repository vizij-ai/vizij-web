import type { RefObject } from "react";
import type { World } from "@vizij/render";
import type { Feature } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";

const FEATURE_KEYS = [
  "translation",
  "rotation",
  "scale",
  "color",
  "opacity",
] as const;

type AuditedFeature = (typeof FEATURE_KEYS)[number];

type SceneObject = {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  userData?: Record<string, unknown>;
  name?: string;
  isMesh?: boolean;
  material?: unknown;
};

type Renderable = World[string] & {
  refs: Record<string, RefObject<SceneObject | null>>;
};

interface ValueSummary {
  type: "number" | "vector" | "color" | "unknown";
  value: Record<string, number> | number | null;
}

type Vector3Like = {
  [component: string]: number;
} & {
  x: number;
  y: number;
  z: number;
};

export interface RobotDataDriftEntry {
  nodeId: string;
  nodeName: string;
  feature: AuditedFeature;
  expected: ValueSummary;
  actual: ValueSummary;
  delta: number;
}

export interface RobotDataMissingAnimatableEntry {
  nodeId: string;
  nodeName: string;
  feature: string;
  animatableId: string;
}

export interface RobotDataNameMismatchEntry {
  nodeId: string;
  storedName: string;
  objectName: string;
}

export interface RobotDataAuditResult {
  totalNodes: number;
  robotDataNodes: number;
  nodesWithoutRobotData: string[];
  refsUnavailable: string[];
  missingAnimatables: RobotDataMissingAnimatableEntry[];
  nameMismatches: RobotDataNameMismatchEntry[];
  drifts: RobotDataDriftEntry[];
}

interface AuditOptions {
  namespace?: string;
  epsilon?: number;
}

function getObjectForRenderable(
  renderable: Renderable,
  namespace?: string,
): SceneObject | null {
  if (!renderable?.refs) {
    return null;
  }
  if (namespace && renderable.refs[namespace]?.current) {
    return renderable.refs[namespace]!.current;
  }
  const firstRef = Object.values(renderable.refs).find((ref) => ref?.current);
  return firstRef?.current ?? null;
}

function featureExpectedValue(
  feature: Feature | undefined,
  animatables: Record<string, AnimatableValue>,
): RawValue | null {
  if (!feature) {
    return null;
  }
  if (feature.animated) {
    const anim = animatables[feature.value];
    return anim?.default ?? null;
  }
  return feature.value;
}

function normalizeVector(value: RawValue | null): Vector3Like | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return { x: value, y: value, z: value };
  }
  if (Array.isArray(value)) {
    const [x = 0, y = 0, z = 0] = value;
    return { x: Number(x), y: Number(y), z: Number(z) };
  }
  if (typeof value === "object") {
    const maybeVector = value as unknown as Record<string, number>;
    const x = maybeVector.x ?? maybeVector.r ?? 0;
    const y = maybeVector.y ?? maybeVector.g ?? 0;
    const z = maybeVector.z ?? maybeVector.b ?? 0;
    return {
      x: typeof x === "number" ? x : Number(x),
      y: typeof y === "number" ? y : Number(y),
      z: typeof z === "number" ? z : Number(z),
    };
  }
  return null;
}

function buildValueSummary(
  type: ValueSummary["type"],
  value: Record<string, number> | number | null,
): ValueSummary {
  return { type, value };
}

function readObjectVector(
  object: SceneObject,
  feature: AuditedFeature,
): ValueSummary {
  switch (feature) {
    case "translation":
      if (!object.position) {
        return buildValueSummary("vector", null);
      }
      return buildValueSummary("vector", {
        x: object.position.x ?? 0,
        y: object.position.y ?? 0,
        z: object.position.z ?? 0,
      });
    case "rotation":
      if (!object.rotation) {
        return buildValueSummary("vector", null);
      }
      return buildValueSummary("vector", {
        x: object.rotation.x ?? 0,
        y: object.rotation.y ?? 0,
        z: object.rotation.z ?? 0,
      });
    case "scale":
      if (!object.scale) {
        return buildValueSummary("vector", null);
      }
      return buildValueSummary("vector", {
        x: object.scale.x ?? 1,
        y: object.scale.y ?? 1,
        z: object.scale.z ?? 1,
      });
    case "color": {
      if (!object?.isMesh) {
        return buildValueSummary("color", null);
      }
      const material = Array.isArray(
        (object as { material?: unknown }).material,
      )
        ? (object as { material?: unknown[] }).material?.[0]
        : (object as { material?: unknown }).material;
      const color = (
        material as { color?: { r: number; g: number; b: number } } | undefined
      )?.color;
      if (!color) {
        return buildValueSummary("color", null);
      }
      return buildValueSummary("color", {
        r: color.r,
        g: color.g,
        b: color.b,
      });
    }
    case "opacity": {
      if (!object?.isMesh) {
        return buildValueSummary("number", null);
      }
      const material = Array.isArray(
        (object as { material?: unknown }).material,
      )
        ? (object as { material?: unknown[] }).material?.[0]
        : (object as { material?: unknown }).material;
      const opacity =
        material && typeof material === "object" && "opacity" in material
          ? (material as { opacity?: number }).opacity
          : null;
      return buildValueSummary("number", opacity ?? null);
    }
    default:
      return buildValueSummary("unknown", null);
  }
}

function normalizeExpectedValue(
  feature: AuditedFeature,
  raw: RawValue | null,
): ValueSummary {
  if (feature === "opacity") {
    const record = raw as unknown as Record<string, unknown>;
    return buildValueSummary(
      "number",
      typeof raw === "number"
        ? raw
        : typeof record?.value === "number"
          ? Number(record.value)
          : null,
    );
  }
  if (feature === "color") {
    const vector = normalizeVector(raw);
    if (!vector) {
      return buildValueSummary("color", null);
    }
    return buildValueSummary("color", {
      r: vector.x,
      g: vector.y,
      b: vector.z,
    });
  }
  const vector = normalizeVector(raw);
  return buildValueSummary("vector", vector);
}

function computeDelta(a: ValueSummary, b: ValueSummary): number {
  if (a.type === "number" && b.type === "number") {
    const av = typeof a.value === "number" ? a.value : 0;
    const bv = typeof b.value === "number" ? b.value : 0;
    return Math.abs((av ?? 0) - (bv ?? 0));
  }
  if (
    a.value &&
    b.value &&
    typeof a.value === "object" &&
    typeof b.value === "object"
  ) {
    const keys = new Set([
      ...Object.keys(a.value as Record<string, number>),
      ...Object.keys(b.value as Record<string, number>),
    ]);
    let max = 0;
    keys.forEach((key) => {
      const av = (a.value as Record<string, number>)[key] ?? 0;
      const bv = (b.value as Record<string, number>)[key] ?? 0;
      max = Math.max(max, Math.abs(av - bv));
    });
    return max;
  }
  return 0;
}

export function auditRobotData(
  world: World,
  animatables: Record<string, AnimatableValue>,
  options: AuditOptions = {},
): RobotDataAuditResult {
  const task = createRobotDataAuditTask(world, animatables, options);
  if (!task.done) {
    task.step(task.totalNodes || 1);
  }
  return task.result;
}

export interface RobotDataAuditTask {
  readonly totalNodes: number;
  readonly result: RobotDataAuditResult;
  readonly options: AuditOptions;
  processedNodes: number;
  done: boolean;
  step(batchSize?: number): void;
}

export function createRobotDataAuditTask(
  world: World,
  animatables: Record<string, AnimatableValue>,
  options: AuditOptions = {},
): RobotDataAuditTask {
  const namespace = options.namespace;
  const epsilon = options.epsilon ?? 1e-3;
  const renderables = Object.values(world ?? {}) as Renderable[];

  const nodesWithoutRobotData: string[] = [];
  const refsUnavailable: string[] = [];
  const missingAnimatables: RobotDataMissingAnimatableEntry[] = [];
  const nameMismatches: RobotDataNameMismatchEntry[] = [];
  const drifts: RobotDataDriftEntry[] = [];

  const result: RobotDataAuditResult = {
    totalNodes: renderables.length,
    robotDataNodes: 0,
    nodesWithoutRobotData,
    refsUnavailable,
    missingAnimatables,
    nameMismatches,
    drifts,
  };

  let index = 0;

  const processNode = (renderable: Renderable) => {
    const object = getObjectForRenderable(renderable, namespace);
    if (!object) {
      refsUnavailable.push(renderable.id);
      return;
    }
    const robotExtension = (
      object.userData as
        | { gltfExtensions?: { RobotData?: unknown } }
        | undefined
    )?.gltfExtensions?.RobotData;
    const hasRobotData = Boolean(robotExtension);
    if (hasRobotData) {
      result.robotDataNodes += 1;
    } else {
      nodesWithoutRobotData.push(renderable.id);
    }

    if (object.name && object.name !== renderable.name) {
      nameMismatches.push({
        nodeId: renderable.id,
        storedName: renderable.name,
        objectName: object.name,
      });
    }

    const featureMap = renderable.features as Record<
      string,
      Feature | undefined
    >;
    FEATURE_KEYS.forEach((featureKey) => {
      const feature = featureMap[featureKey];
      if (!feature) {
        return;
      }
      if (feature.animated && !animatables[feature.value]) {
        missingAnimatables.push({
          nodeId: renderable.id,
          nodeName: renderable.name,
          feature: featureKey,
          animatableId: feature.value,
        });
        return;
      }

      const expectedRaw = featureExpectedValue(feature, animatables);
      const expected = normalizeExpectedValue(featureKey, expectedRaw);
      const actual = readObjectVector(object, featureKey);
      const delta = computeDelta(expected, actual);
      if (delta > epsilon) {
        drifts.push({
          nodeId: renderable.id,
          nodeName: renderable.name,
          feature: featureKey,
          expected,
          actual,
          delta,
        });
      }
    });
  };

  const task: RobotDataAuditTask = {
    totalNodes: renderables.length,
    result,
    options: { namespace, epsilon },
    processedNodes: 0,
    done: renderables.length === 0,
    step(batchSize = 1) {
      if (task.done) {
        return;
      }
      let processed = 0;
      const limit = Math.max(1, batchSize);
      while (processed < limit && index < renderables.length) {
        processNode(renderables[index]);
        index += 1;
        processed += 1;
        task.processedNodes += 1;
      }
      if (index >= renderables.length) {
        task.done = true;
      }
    },
  };

  return task;
}

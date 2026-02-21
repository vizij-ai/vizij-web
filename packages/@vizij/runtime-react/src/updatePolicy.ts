import type {
  VizijAssetBundle,
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
  RuntimeMutationClass,
} from "./types";

export type { RuntimeUpdateTier, RuntimeUpdatePlan, RuntimeGraphBundle };

const serializedPayloadCache = new WeakMap<object, string>();

export function resolveRuntimeUpdatePlanFromMutationClass(
  mutationClass: Exclude<RuntimeMutationClass, "value">,
  tier: RuntimeUpdateTier,
): RuntimeUpdatePlan {
  if (tier === "assets") {
    return { reloadAssets: true, reregisterGraphs: false };
  }

  if (mutationClass === "topology" || mutationClass === "pose") {
    return { reloadAssets: false, reregisterGraphs: true };
  }

  return { reloadAssets: false, reregisterGraphs: false };
}

function normalizeSpecPayload(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "object") {
    const objectValue = value as object;
    const cached = serializedPayloadCache.get(objectValue);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const serialized = JSON.stringify(objectValue);
      serializedPayloadCache.set(objectValue, serialized);
      return serialized;
    } catch {
      const fallback = String(objectValue);
      serializedPayloadCache.set(objectValue, fallback);
      return fallback;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function glbSignature(glb: VizijAssetBundle["glb"]): string {
  if (glb.kind === "url") {
    return `url:${glb.src}`;
  }
  if (glb.kind === "blob") {
    return `blob:${glb.blob?.size ?? 0}`;
  }
  return `world:${normalizeSpecPayload(glb.world)}`;
}

function graphSignature(graph?: VizijAssetBundle["rig"]): string {
  if (!graph) {
    return "";
  }
  const id = graph.id ?? "";
  return `${id}:${normalizeSpecPayload(graph.spec ?? graph.ir ?? null)}`;
}

function poseGraphSignature(pose?: VizijAssetBundle["pose"]): string {
  const graph = pose?.graph;
  if (!graph) {
    return "";
  }
  return graphSignature({ id: graph.id, spec: graph.spec });
}

export function resolveRuntimeUpdatePlan(
  previous: VizijAssetBundle | null,
  next: VizijAssetBundle,
  tier: RuntimeUpdateTier,
): RuntimeUpdatePlan {
  if (!previous) {
    return { reloadAssets: true, reregisterGraphs: false };
  }

  const glbChanged = glbSignature(previous.glb) !== glbSignature(next.glb);
  const rigChanged = graphSignature(previous.rig) !== graphSignature(next.rig);
  const poseGraphChanged =
    poseGraphSignature(previous.pose) !== poseGraphSignature(next.pose);
  const graphsChanged = rigChanged || poseGraphChanged;

  if (tier === "assets") {
    return { reloadAssets: true, reregisterGraphs: false };
  }

  if (tier === "graphs") {
    if (glbChanged) {
      return { reloadAssets: true, reregisterGraphs: false };
    }
    return { reloadAssets: false, reregisterGraphs: graphsChanged };
  }

  if (glbChanged) {
    return { reloadAssets: true, reregisterGraphs: false };
  }
  if (graphsChanged) {
    return { reloadAssets: false, reregisterGraphs: true };
  }
  return { reloadAssets: false, reregisterGraphs: false };
}

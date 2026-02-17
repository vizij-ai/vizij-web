import type {
  VizijAssetBundle,
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
} from "./types";

export type { RuntimeUpdateTier, RuntimeUpdatePlan, RuntimeGraphBundle };

function normalizeSpecPayload(value: unknown): string {
  if (!value) {
    return "";
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

function poseSignature(pose?: VizijAssetBundle["pose"]): string {
  if (!pose) {
    return "";
  }
  const graph = pose.graph;
  const config = pose.config;
  const graphPart = graph
    ? graphSignature({ id: graph.id, spec: graph.spec })
    : "";
  const configPart = config ? normalizeSpecPayload(config) : "";
  return `${graphPart}:${configPart}`;
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
  const poseChanged = poseSignature(previous.pose) !== poseSignature(next.pose);
  const rigReferenceChanged =
    previous.rig?.id !== next.rig?.id ||
    previous.rig?.spec !== next.rig?.spec ||
    previous.rig?.ir !== next.rig?.ir;
  const poseReferenceChanged =
    previous.pose?.graph?.id !== next.pose?.graph?.id ||
    previous.pose?.graph?.spec !== next.pose?.graph?.spec ||
    previous.pose?.config !== next.pose?.config;
  const graphsChanged =
    rigChanged || poseChanged || rigReferenceChanged || poseReferenceChanged;

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

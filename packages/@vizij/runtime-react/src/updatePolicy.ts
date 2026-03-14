import type {
  VizijAssetBundle,
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
} from "./types";

export type { RuntimeUpdateTier, RuntimeUpdatePlan, RuntimeGraphBundle };

const blobIdentityMap = new WeakMap<Blob, number>();
let nextBlobIdentity = 0;

function getBlobIdentity(blob: Blob | undefined): string {
  if (!blob) {
    return "missing";
  }
  let identity = blobIdentityMap.get(blob);
  if (identity === undefined) {
    identity = nextBlobIdentity++;
    blobIdentityMap.set(blob, identity);
  }
  return `${identity}:${blob.size}:${blob.type}`;
}

export function applyRuntimeGraphBundle(
  base: VizijAssetBundle,
  bundle: RuntimeGraphBundle,
): VizijAssetBundle {
  const next: VizijAssetBundle = {
    ...base,
  };
  const hasRigOverride = Object.prototype.hasOwnProperty.call(bundle, "rig");
  const hasPoseOverride = Object.prototype.hasOwnProperty.call(bundle, "pose");
  const hasAnimationsOverride = Object.prototype.hasOwnProperty.call(
    bundle,
    "animations",
  );
  const hasProgramsOverride = Object.prototype.hasOwnProperty.call(
    bundle,
    "programs",
  );

  if (hasRigOverride) {
    next.rig = bundle.rig;
  }

  if (hasPoseOverride) {
    next.pose = bundle.pose;
  }

  if (hasAnimationsOverride) {
    next.animations = Array.isArray(bundle.animations)
      ? bundle.animations
      : undefined;
  }

  if (hasProgramsOverride) {
    next.programs = Array.isArray(bundle.programs)
      ? bundle.programs
      : undefined;
  }

  return next;
}

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
    const importOptions = normalizeSpecPayload({
      aggressiveImport: glb.aggressiveImport ?? false,
      rootBounds: glb.rootBounds ?? null,
    });
    return `url:${glb.src}:${importOptions}`;
  }
  if (glb.kind === "blob") {
    const importOptions = normalizeSpecPayload({
      aggressiveImport: glb.aggressiveImport ?? false,
      rootBounds: glb.rootBounds ?? null,
    });
    return `blob:${getBlobIdentity(glb.blob)}:${importOptions}`;
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

function animationsSignature(
  animations?: VizijAssetBundle["animations"],
): string {
  if (!Array.isArray(animations) || animations.length === 0) {
    return "";
  }
  return animations
    .map((animation) => {
      const id = animation.id ?? "";
      const clipSignature = normalizeSpecPayload(animation.clip ?? null);
      const setupSignature = normalizeSpecPayload(animation.setup ?? null);
      const weightSignature =
        animation.weight == null ? "" : String(animation.weight);
      return `${id}:${clipSignature}:${setupSignature}:${weightSignature}`;
    })
    .sort()
    .join("|");
}

function programsSignature(programs?: VizijAssetBundle["programs"]): string {
  if (!Array.isArray(programs) || programs.length === 0) {
    return "";
  }
  return programs
    .map((program) => {
      const id = program.id ?? "";
      const label = program.label ?? "";
      const graphId = program.graph?.id ?? "";
      const graphPayload = normalizeSpecPayload(
        program.graph?.spec ?? program.graph?.ir ?? null,
      );
      const resetValues = normalizeSpecPayload(program.resetValues ?? null);
      return `${id}:${label}:${graphId}:${graphPayload}:${resetValues}`;
    })
    .sort()
    .join("|");
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
  const animationsChanged =
    animationsSignature(previous.animations) !==
    animationsSignature(next.animations);
  const programsChanged =
    programsSignature(previous.programs) !== programsSignature(next.programs);
  const controllersChanged =
    graphsChanged || animationsChanged || programsChanged;

  if (tier === "assets") {
    return { reloadAssets: true, reregisterGraphs: false };
  }

  if (tier === "graphs") {
    if (glbChanged) {
      return { reloadAssets: true, reregisterGraphs: false };
    }
    return { reloadAssets: false, reregisterGraphs: controllersChanged };
  }

  if (glbChanged) {
    return { reloadAssets: true, reregisterGraphs: false };
  }
  if (controllersChanged) {
    return { reloadAssets: false, reregisterGraphs: true };
  }
  return { reloadAssets: false, reregisterGraphs: false };
}

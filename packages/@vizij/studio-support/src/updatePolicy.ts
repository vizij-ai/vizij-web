import type {
  VizijAssetBundle,
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
  RuntimeGraphBundleApplicationPlan,
  RuntimeGraphBundleUpdateSource,
} from "./types";

export type {
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
  RuntimeGraphBundleApplicationPlan,
  RuntimeGraphBundlePendingUpdate,
  RuntimeGraphBundleUpdateSource,
} from "./types";

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

  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(value, (_key, currentValue) => {
        if (!currentValue || typeof currentValue !== "object") {
          return currentValue;
        }
        if (seen.has(currentValue as object)) {
          return "[Circular]";
        }
        seen.add(currentValue as object);
        if (Array.isArray(currentValue)) {
          return currentValue;
        }
        const record = currentValue as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        Object.keys(record)
          .sort((left, right) => left.localeCompare(right))
          .forEach((key) => {
            sorted[key] = record[key];
          });
        return sorted;
      }) ?? String(value)
    );
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
  return `world:${normalizeSpecPayload({
    animatables: glb.animatables,
    bundle: glb.bundle ?? null,
    world: glb.world,
  })}`;
}

function graphSignature(graph?: VizijAssetBundle["rig"]): string {
  if (!graph) {
    return "";
  }
  const id = graph.id ?? "";
  const specPayload = normalizeSpecPayload(graph.spec ?? null);
  const irPayload = normalizeSpecPayload(graph.ir ?? null);
  const subscriptions = normalizeSpecPayload(graph.subscriptions ?? null);
  const inputMetadata = normalizeSpecPayload(graph.inputMetadata ?? null);
  return `${id}:${specPayload}:${irPayload}:${subscriptions}:${inputMetadata}`;
}

function poseSignature(pose?: VizijAssetBundle["pose"]): string {
  if (!pose) {
    return "";
  }
  const graph = pose.graph;
  const config = pose.config;
  const graphPart = graph ? graphSignature(graph) : "";
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
      const graphPayload = graphSignature(program.graph);
      const resetValues = normalizeSpecPayload(program.resetValues ?? null);
      return `${id}:${label}:${graphPayload}:${resetValues}`;
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
  const graphsChanged = rigChanged || poseChanged;
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

export function planRuntimeGraphBundleApplication(args: {
  baseAssetBundle: VizijAssetBundle;
  extractedBundle?: VizijAssetBundle["bundle"] | null;
  graphBundle: RuntimeGraphBundle;
  tier: RuntimeUpdateTier;
  source?: RuntimeGraphBundleUpdateSource;
  revision?: number;
}): RuntimeGraphBundleApplicationPlan {
  const baseAssetBundle =
    !args.baseAssetBundle.bundle && args.extractedBundle
      ? {
          ...args.baseAssetBundle,
          bundle: args.extractedBundle,
        }
      : args.baseAssetBundle;
  const nextAssetBundle = applyRuntimeGraphBundle(
    baseAssetBundle,
    args.graphBundle,
  );
  const updatePlan = resolveRuntimeUpdatePlan(
    baseAssetBundle,
    nextAssetBundle,
    args.tier,
  );
  const pendingUpdate = args.source
    ? {
        revision: args.revision ?? 0,
        source: {
          ...args.source,
          signature: args.source.signature ?? null,
        },
        reregistered: updatePlan.reregisterGraphs,
        reloadedAssets: updatePlan.reloadAssets,
      }
    : null;

  return {
    baseAssetBundle,
    nextAssetBundle,
    updatePlan,
    pendingUpdate,
  };
}

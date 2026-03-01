import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren, ReactNode } from "react";
import {
  VizijContext,
  createVizijStore,
  type VizijStore,
  type VizijBundleExtension,
  type VizijBundleGraphEntry,
  type VizijBundleAnimationEntry,
  loadGLTFWithBundle,
  loadGLTFFromBlobWithBundle,
} from "@vizij/render";
import {
  OrchestratorProvider,
  OrchestratorContext,
  useOrchestrator,
  useOrchFrame,
  type CreateOrchOptions,
  type GraphRegistrationConfig,
  type GraphSubscriptions,
  type MergeStrategyOptions,
  type ValueJSON,
  type ShapeJSON,
  type AnimationRegistrationConfig,
  type ControllerId,
  type WriteOp,
} from "@vizij/orchestrator-react";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import { valueAsNumber } from "@vizij/value-json";
import { getLookup, type AnimatableValue, type RawValue } from "@vizij/utils";
import { VizijRuntimeContext } from "./context";
import {
  resolveRuntimeUpdatePlan,
  type RuntimeGraphBundle,
  type RuntimeUpdateTier,
} from "./updatePolicy";
import type {
  AnimateValueOptions,
  InputDriverFactory,
  InputDriverLifecycle,
  PlayAnimationOptions,
  RuntimeError,
  VizijAssetBundle,
  VizijAnimationAsset,
  VizijGraphAsset,
  PoseRigConfig,
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
  VizijRuntimeContextValue,
  VizijRuntimeProviderProps,
  VizijRuntimeStatus,
  RuntimeOutputWrite,
} from "./types";
import {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "./utils/graph";
import { valueJSONToRaw } from "./utils/valueConversion";
import type { VizijInputMetadata } from "./types";

type ProviderProps = PropsWithChildren<VizijRuntimeProviderProps>;

type AnimationState = {
  path: string;
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
  resolve: () => void;
};

type ClipPlaybackState = {
  id: string;
  time: number;
  duration: number;
  speed: number;
  weight: number;
  resolve: () => void;
};

type LoopMode = "active" | "idle-visible" | "idle-hidden" | "stopped";

const ACTIVE_GRACE_MS = 250;
const VISIBLE_IDLE_FPS = 30;
const HIDDEN_IDLE_FPS = 1;

const DEFAULT_MERGE: MergeStrategyOptions = {
  outputs: "add",
  intermediate: "add",
};

const DEFAULT_DURATION = 0.35;
const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;
const DEV_MODE =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV !== "production";

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};

function resolveEasing(easing?: AnimateValueOptions["easing"]) {
  if (typeof easing === "function") {
    return easing;
  }
  if (typeof easing === "string" && easing in EASINGS) {
    return EASINGS[easing];
  }
  return EASINGS.linear;
}

function findRootId(world: Record<string, any>): string | null {
  let fallback: string | null = null;
  for (const entry of Object.values(world)) {
    if (!entry || typeof entry !== "object" || entry.type !== "group") {
      continue;
    }
    if (entry.rootBounds && entry.id) {
      return entry.id as string;
    }
    if (!fallback && entry.id) {
      fallback = entry.id as string;
    }
  }
  return fallback;
}

function normalisePath(path: string): string {
  if (!path) {
    return path;
  }
  return path.startsWith("debug/") ? path.slice("debug/".length) : path;
}

function normaliseBundleKind(kind: unknown): string {
  return typeof kind === "string" ? kind.toLowerCase() : "";
}

type InputConstraint = { min?: number; max?: number; defaultValue?: number };

function addConstraintVariant(
  map: Record<string, InputConstraint>,
  key: string,
  constraint: InputConstraint,
) {
  if (!key) return;
  if (!map[key]) {
    map[key] = constraint;
  }
}

function stripRigFacePrefix(path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  const match = /^rig\/[^/]+\/(.+)$/.exec(trimmed);
  if (match && match[1]) {
    return match[1];
  }
  if (trimmed.startsWith("rig/")) {
    return trimmed.slice("rig/".length);
  }
  return trimmed;
}

function extractInputConstraints(
  spec: GraphRegistrationConfig["spec"],
  extraInputs: VizijInputMetadata[] | undefined,
  namespace: string,
): Record<string, InputConstraint> {
  if (!spec || typeof spec !== "object") {
    return {};
  }
  const inputs: VizijInputMetadata[] = [];
  if (Array.isArray(extraInputs)) {
    inputs.push(...extraInputs);
  }
  const entries = (spec as { metadata?: { vizij?: { inputs?: unknown } } })
    .metadata?.vizij?.inputs;
  if (Array.isArray(entries)) {
    entries.forEach((entry) => {
      if (entry && typeof entry === "object") {
        inputs.push(entry as VizijInputMetadata);
      }
    });
  }
  if (inputs.length === 0) {
    return {};
  }
  const map: Record<string, InputConstraint> = {};
  inputs.forEach((entry) => {
    const path = entry.path;
    if (typeof path !== "string") return;
    const namespaced = namespaceTypedPath(path, namespace);
    const stripped = stripRigFacePrefix(path);
    const strippedNamespaced = stripped
      ? namespaceTypedPath(stripped, namespace)
      : stripped;
    const min = entry.range?.min;
    const max = entry.range?.max;
    const defaultValue = entry.defaultValue;
    const constraint: InputConstraint = {
      ...(Number.isFinite(Number(min)) ? { min: Number(min) } : {}),
      ...(Number.isFinite(Number(max)) ? { max: Number(max) } : {}),
      ...(Number.isFinite(Number(defaultValue))
        ? { defaultValue: Number(defaultValue) }
        : {}),
    };
    addConstraintVariant(map, namespaced, constraint);
    addConstraintVariant(map, path, constraint);
    if (stripped) {
      addConstraintVariant(map, stripped, constraint);
    }
    if (strippedNamespaced) {
      addConstraintVariant(map, strippedNamespaced, constraint);
    }
  });
  return map;
}

function namespaceTypedPath(path: string, namespace: string): string {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (!trimmed) {
    return trimmed;
  }
  const prefix = `${namespace}/`;
  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }
  if (trimmed.startsWith("debug/")) {
    const rest = trimmed.slice("debug/".length);
    const namespacedRest = namespaceTypedPath(rest, namespace);
    return namespacedRest.startsWith("debug/")
      ? namespacedRest
      : `debug/${namespacedRest}`;
  }
  return `${prefix}${trimmed}`;
}

function stripNamespace(path: string, namespace: string): string {
  const prefix = `${namespace}/`;
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length);
  }
  const debugPrefix = `debug/${prefix}`;
  if (path.startsWith(debugPrefix)) {
    return path.slice(debugPrefix.length);
  }
  if (path.startsWith("debug/")) {
    return path.slice("debug/".length);
  }
  return path;
}

function namespaceControllerId(
  id: string | undefined,
  namespace: string,
  kind: "graph" | "animation" | "merged" = "graph",
): string | undefined {
  if (!id) {
    return undefined;
  }
  const trimmed = id.trim();
  if (!trimmed) {
    return undefined;
  }
  const prefix = `${namespace}/${kind}/`;
  if (trimmed.startsWith(prefix)) {
    return trimmed;
  }
  return `${prefix}${trimmed}`;
}

function namespaceSubscriptions(
  subs: GraphSubscriptions | undefined,
  namespace: string,
): GraphSubscriptions | undefined {
  if (!subs) {
    return undefined;
  }
  const inputs = Array.isArray(subs.inputs)
    ? subs.inputs.map((path) => namespaceTypedPath(path, namespace))
    : undefined;
  const outputs = Array.isArray(subs.outputs)
    ? subs.outputs.map((path) => namespaceTypedPath(path, namespace))
    : undefined;

  if (!inputs && !outputs) {
    return subs;
  }

  return {
    ...subs,
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
  };
}

function namespaceGraphSpec(
  spec: GraphRegistrationConfig["spec"],
  namespace: string,
): GraphRegistrationConfig["spec"] {
  if (!spec || typeof spec !== "object") {
    return spec;
  }
  const nodes = (spec as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) {
    return spec;
  }
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (!node || typeof node !== "object") {
      return node;
    }
    const path = (node as { params?: { path?: string } }).params?.path;
    if (typeof path !== "string") {
      return node;
    }
    const namespacedPath = namespaceTypedPath(path, namespace);
    if (namespacedPath === path) {
      return node;
    }
    changed = true;
    return {
      ...(node as Record<string, unknown>),
      params: {
        ...(((node as { params?: Record<string, unknown> }).params ?? {}) as
          | Record<string, unknown>
          | undefined),
        path: namespacedPath,
      },
    } as GraphNodeSpec;
  });

  if (!changed) {
    return spec;
  }

  return {
    ...(spec as Record<string, unknown>),
    nodes: nextNodes,
  } as GraphRegistrationConfig["spec"];
}

function stripNulls<T>(value: T): T {
  if (value === null) {
    return undefined as T;
  }
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => stripNulls(entry))
      .filter((entry) => entry !== undefined && entry !== null);
    return next as unknown as T;
  }
  if (typeof value !== "object" || value === undefined) {
    return value;
  }
  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (entry === null) {
      return;
    }
    const cleaned = stripNulls(entry);
    if (cleaned === undefined) {
      return;
    }
    next[key] = cleaned;
  });
  return next as T;
}

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function pickBundleGraph(
  bundle: VizijBundleExtension | null,
  preferredKinds: string[],
): VizijBundleGraphEntry | null {
  if (!bundle?.graphs || bundle.graphs.length === 0) {
    return null;
  }
  const preferred = preferredKinds.map((kind) => kind.toLowerCase());
  for (const entry of bundle.graphs) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const kind = normaliseBundleKind(entry.kind);
    if (preferred.includes(kind)) {
      return entry;
    }
  }
  if (bundle.graphs.length === 1) {
    return bundle.graphs[0] ?? null;
  }
  return null;
}

function extractIrGraph(payload: unknown): IrGraph | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return payload as IrGraph;
}

function convertBundleGraph(
  entry: VizijBundleGraphEntry | null,
): VizijGraphAsset | null {
  if (!entry || !entry.id) {
    return null;
  }
  const rawSpec = entry.spec as GraphRegistrationConfig["spec"] | undefined;
  const inputMetadata = extractVizijInputMetadata(
    rawSpec as GraphRegistrationConfig["spec"],
  );
  const spec = rawSpec ? stripVizijMetadata(rawSpec) : undefined;
  const ir = extractIrGraph(entry.ir);
  if (!spec && !ir) {
    return null;
  }
  return {
    id: entry.id,
    spec,
    ir: ir ?? null,
    inputMetadata,
  };
}

function resolveGraphSpec(
  asset: VizijGraphAsset,
  context: string,
): GraphRegistrationConfig["spec"] | null {
  if (asset.spec) {
    return stripVizijMetadata(asset.spec);
  }
  if (asset.ir) {
    try {
      const compiled = compileIrGraph(asset.ir, { preferLegacySpec: false });
      if (compiled.issues && compiled.issues.length > 0) {
        console.warn(
          `[vizij-runtime] IR compile for graph "${context}" reported issues`,
          compiled.issues,
        );
      }
      return stripVizijMetadata(compiled.spec);
    } catch (error) {
      console.warn(
        `[vizij-runtime] Failed to compile IR graph "${context}"`,
        error,
      );
    }
  }
  return null;
}

type GraphNodeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["nodes"]
>[number];
type GraphEdgeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["edges"]
>[number];

function stripVizijMetadata(
  spec: GraphRegistrationConfig["spec"],
): GraphRegistrationConfig["spec"] {
  if (!spec || typeof spec !== "object") {
    return spec;
  }
  const cloned: GraphRegistrationConfig["spec"] = {
    ...spec,
    nodes: spec.nodes
      ? spec.nodes.map((node: GraphNodeSpec) => ({ ...node }))
      : spec.nodes,
    edges: spec.edges
      ? spec.edges.map((edge: GraphEdgeSpec) => ({ ...edge }))
      : spec.edges,
  } as GraphRegistrationConfig["spec"];
  if (cloned.metadata && typeof cloned.metadata === "object") {
    const metadata = { ...(cloned.metadata as Record<string, unknown>) };
    if ("vizij" in metadata) {
      delete metadata.vizij;
    }
    if (Object.keys(metadata).length === 0) {
      delete cloned.metadata;
    } else {
      cloned.metadata = metadata;
    }
  }
  return cloned;
}

function extractVizijInputMetadata(
  spec: GraphRegistrationConfig["spec"],
): VizijInputMetadata[] {
  if (!spec || typeof spec !== "object") {
    return [];
  }
  const inputs = (spec as { metadata?: { vizij?: { inputs?: unknown } } })
    .metadata?.vizij?.inputs;
  if (!Array.isArray(inputs)) {
    return [];
  }
  return inputs
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      return entry as VizijInputMetadata;
    })
    .filter(Boolean) as VizijInputMetadata[];
}

function convertBundleAnimations(
  entries: VizijBundleAnimationEntry[] | undefined | null,
): VizijAnimationAsset[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries
    .filter((entry): entry is VizijBundleAnimationEntry =>
      Boolean(entry && typeof entry.id === "string" && entry.clip),
    )
    .map((entry) => ({
      id: entry.id,
      clip: entry.clip as AnimationClipLike,
    }));
}

type ExtractedAnimationTrack = {
  componentId?: string;
  component?: string;
  componentIndex?: number | string;
  valueSize?: number | string;
  times?: unknown;
  values?: unknown;
};

type ExtractedAnimationClip = {
  id?: string;
  name?: string;
  duration?: number | string;
  metadata?: unknown;
  tracks?: ExtractedAnimationTrack[];
};

function resolveChannelId(track: ExtractedAnimationTrack): string | null {
  if (typeof track.componentId !== "string" || track.componentId.length === 0) {
    return null;
  }
  if (typeof track.component === "string" && track.component.length > 0) {
    return `${track.componentId}:${track.component}`;
  }
  const rawIndex =
    track.componentIndex != null ? Number(track.componentIndex) : undefined;
  const valueSize =
    track.valueSize != null ? Number(track.valueSize) : undefined;
  if (
    Number.isInteger(rawIndex) &&
    Number.isFinite(rawIndex) &&
    rawIndex! >= 0 &&
    Number.isFinite(valueSize) &&
    valueSize! > 1
  ) {
    return `${track.componentId}:${rawIndex}`;
  }
  return track.componentId;
}

function convertExtractedAnimations(
  clips: ExtractedAnimationClip[] | undefined,
): VizijAnimationAsset[] {
  if (!Array.isArray(clips) || clips.length === 0) {
    return [];
  }

  const assets: VizijAnimationAsset[] = [];

  clips.forEach((clip) => {
    const clipTracks = Array.isArray(clip.tracks) ? clip.tracks : [];
    if (clipTracks.length === 0) {
      return;
    }

    const convertedTracks: AnimationTrackLike[] = [];

    clipTracks.forEach((track) => {
      const channelId = resolveChannelId(track);
      if (!channelId) {
        return;
      }

      const rawTimes = Array.isArray(track.times) ? track.times : [];
      const rawValues = Array.isArray(track.values) ? track.values : [];
      if (rawTimes.length === 0 || rawValues.length === 0) {
        return;
      }

      const times: number[] = [];
      for (const entry of rawTimes) {
        const time = Number(entry);
        if (!Number.isFinite(time)) {
          return;
        }
        times.push(time);
      }

      const values: number[] = [];
      for (const entry of rawValues) {
        const value = Number(entry);
        if (!Number.isFinite(value)) {
          return;
        }
        values.push(value);
      }

      const parsedValueSize =
        track.valueSize != null ? Number(track.valueSize) : NaN;
      const valueSize =
        Number.isFinite(parsedValueSize) && parsedValueSize > 0
          ? parsedValueSize
          : 1;
      if (values.length !== times.length * valueSize) {
        return;
      }

      const rawIndex =
        track.componentIndex != null ? Number(track.componentIndex) : 0;
      const componentIndex =
        Number.isInteger(rawIndex) && rawIndex >= 0
          ? Math.min(rawIndex, valueSize - 1)
          : 0;

      const keyframes: AnimationKeyframeLike[] = [];
      times.forEach((time, index) => {
        const base = index * valueSize + componentIndex;
        const value = values[base];
        if (!Number.isFinite(value)) {
          return;
        }
        keyframes.push({ time, value });
      });

      if (keyframes.length === 0) {
        return;
      }

      convertedTracks.push({
        channel: channelId,
        keyframes,
      });
    });

    if (convertedTracks.length === 0) {
      return;
    }

    const durationFromTracks = convertedTracks.reduce((maxTime, track) => {
      const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (keyframes.length === 0) {
        return maxTime;
      }
      const lastKeyframe = keyframes[keyframes.length - 1];
      const time = Number(lastKeyframe?.time ?? 0);
      if (!Number.isFinite(time)) {
        return maxTime;
      }
      return time > maxTime ? time : maxTime;
    }, 0);

    const duration =
      typeof clip.duration === "number" && Number.isFinite(clip.duration)
        ? clip.duration
        : durationFromTracks;

    const clipId =
      typeof clip.id === "string" && clip.id.length > 0
        ? clip.id
        : typeof clip.name === "string" && clip.name.length > 0
          ? clip.name
          : `gltf-animation-${assets.length}`;

    const metadata =
      clip.metadata &&
      typeof clip.metadata === "object" &&
      !Array.isArray(clip.metadata)
        ? (clip.metadata as Record<string, unknown>)
        : undefined;

    assets.push({
      id: clipId,
      clip: {
        id: clipId,
        name: typeof clip.name === "string" ? clip.name : clipId,
        duration,
        tracks: convertedTracks,
        metadata,
      },
    });
  });

  return assets;
}

function pickExtractedAnimations(
  asset: unknown,
): ExtractedAnimationClip[] | undefined {
  if (!asset || typeof asset !== "object") {
    return undefined;
  }
  const animations = (asset as { animations?: unknown }).animations;
  if (!Array.isArray(animations)) {
    return undefined;
  }
  return animations as ExtractedAnimationClip[];
}

function mergeAnimationLists(
  explicit: VizijAnimationAsset[] | undefined,
  fromBundle: VizijAnimationAsset[],
): VizijAnimationAsset[] | undefined {
  if (!explicit?.length && fromBundle.length === 0) {
    return undefined;
  }
  if (!explicit?.length) {
    return fromBundle.length > 0 ? fromBundle : undefined;
  }
  if (fromBundle.length === 0) {
    return explicit;
  }
  const seen = new Set(explicit.map((anim) => anim.id));
  let changed = false;
  const merged = [...explicit];
  for (const anim of fromBundle) {
    if (!anim.id || seen.has(anim.id)) {
      continue;
    }
    merged.push(anim);
    seen.add(anim.id);
    changed = true;
  }
  return changed ? merged : explicit;
}

function mergeAssetBundle(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): VizijAssetBundle {
  const resolvedBundle = base.bundle ?? extracted ?? null;

  const rigFromBundle = convertBundleGraph(
    pickBundleGraph(resolvedBundle, ["rig"]),
  );
  const resolvedRig = base.rig ?? rigFromBundle ?? undefined;

  const basePose = base.pose;
  const hasBasePoseGraphOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "graph"),
  );
  const hasBasePoseConfigOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "config"),
  );
  const poseStageFilter = basePose?.stageNeutralFilter;
  const poseGraphFromBundle = hasBasePoseGraphOverride
    ? null
    : convertBundleGraph(
        pickBundleGraph(resolvedBundle, ["pose-driver", "pose"]),
      );
  const resolvedPoseGraph = hasBasePoseGraphOverride
    ? basePose?.graph
    : (basePose?.graph ?? poseGraphFromBundle ?? undefined);
  const resolvedPoseConfig = hasBasePoseConfigOverride
    ? basePose?.config
    : (basePose?.config ??
      (resolvedBundle?.poses?.config as PoseRigConfig | undefined) ??
      undefined);

  let resolvedPose = basePose;
  if (basePose) {
    const nextPose: typeof basePose = { ...basePose };
    let changed = false;
    if (resolvedPoseGraph && basePose.graph !== resolvedPoseGraph) {
      nextPose.graph = resolvedPoseGraph;
      changed = true;
    }
    if (resolvedPoseConfig && basePose.config !== resolvedPoseConfig) {
      nextPose.config = resolvedPoseConfig;
      changed = true;
    }
    if (!resolvedPoseGraph && !basePose.graph) {
      // keep as is
    }
    if (!resolvedPoseConfig && !basePose.config) {
      // keep as is
    }
    resolvedPose = changed ? nextPose : basePose;
  } else if (
    resolvedPoseGraph ||
    resolvedPoseConfig ||
    typeof poseStageFilter === "function"
  ) {
    resolvedPose = {
      ...(resolvedPoseGraph ? { graph: resolvedPoseGraph } : {}),
      ...(resolvedPoseConfig ? { config: resolvedPoseConfig } : {}),
      ...(typeof poseStageFilter === "function"
        ? { stageNeutralFilter: poseStageFilter }
        : {}),
    };
  }

  const animationsFromBundle = convertBundleAnimations(
    resolvedBundle?.animations,
  );
  let resolvedAnimations = mergeAnimationLists(
    base.animations,
    animationsFromBundle,
  );
  const animationsFromAsset =
    extractedAnimations && extractedAnimations.length > 0
      ? extractedAnimations
      : [];
  if (animationsFromAsset.length > 0) {
    resolvedAnimations = mergeAnimationLists(
      resolvedAnimations,
      animationsFromAsset,
    );
  }

  const merged: VizijAssetBundle = {
    ...base,
  };

  if (resolvedRig) {
    merged.rig = resolvedRig;
  } else {
    merged.rig = undefined;
  }

  merged.pose = resolvedPose;
  merged.animations = resolvedAnimations;
  merged.bundle = resolvedBundle;

  return merged;
}

export function VizijRuntimeProvider({
  assetBundle,
  children,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier = "auto",
  autoCreate = true,
  createOptions,
  autostart = false,
  driveOrchestrator = true,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  transformOutputWrite,
  orchestratorScope = "auto",
}: ProviderProps) {
  const storeRef = useRef<VizijStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createVizijStore();
  }

  const parentOrchestrator = useContext(OrchestratorContext);
  const hasParentOrchestrator = Boolean(parentOrchestrator);
  const shouldProvideOrchestrator =
    orchestratorScope === "isolated" ||
    (!hasParentOrchestrator && orchestratorScope !== "shared");

  if (orchestratorScope === "shared" && !hasParentOrchestrator) {
    console.warn(
      '[vizij-runtime] orchestratorScope="shared" requires an OrchestratorProvider higher in the tree; falling back to an isolated provider.',
    );
  }

  const runtimeTree = (
    <VizijContext.Provider value={storeRef.current}>
      <VizijRuntimeProviderInner
        assetBundle={assetBundle}
        namespace={namespaceProp}
        faceId={faceIdProp}
        updateTier={updateTier}
        autoCreate={autoCreate}
        autostart={autostart}
        driveOrchestrator={driveOrchestrator}
        createOptions={createOptions}
        mergeStrategy={mergeStrategy}
        onRegisterControllers={onRegisterControllers}
        onStatusChange={onStatusChange}
        transformOutputWrite={transformOutputWrite}
        store={storeRef.current}
      >
        {children}
      </VizijRuntimeProviderInner>
    </VizijContext.Provider>
  );

  if (!shouldProvideOrchestrator) {
    return runtimeTree;
  }

  return (
    <OrchestratorProvider
      autoCreate={autoCreate}
      createOptions={createOptions}
      autostart={false}
    >
      {runtimeTree}
    </OrchestratorProvider>
  );
}

type VizijRuntimeProviderInnerProps = {
  assetBundle: VizijAssetBundle;
  namespace?: string;
  faceId?: string;
  updateTier: RuntimeUpdateTier;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
  store: VizijStore;
  children: ReactNode;
  autoCreate: boolean;
  autostart: boolean;
  createOptions?: CreateOrchOptions;
  driveOrchestrator: boolean;
};

function VizijRuntimeProviderInner({
  assetBundle: initialAssetBundle,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  transformOutputWrite,
  store,
  children,
  autoCreate,
  autostart,
  createOptions,
  driveOrchestrator,
}: VizijRuntimeProviderInnerProps) {
  const [assetBundleOverride, setAssetBundleOverride] =
    useState<VizijAssetBundle | null>(null);
  const [graphUpdateToken, setGraphUpdateToken] = useState(0);
  const effectiveAssetBundle = assetBundleOverride ?? initialAssetBundle;
  const [extractedBundle, setExtractedBundle] =
    useState<VizijBundleExtension | null>(() => {
      if (effectiveAssetBundle.bundle) {
        return effectiveAssetBundle.bundle;
      }
      if (
        effectiveAssetBundle.glb.kind === "world" &&
        effectiveAssetBundle.glb.bundle
      ) {
        return effectiveAssetBundle.glb.bundle;
      }
      return null;
    });
  const [extractedAnimations, setExtractedAnimations] = useState<
    VizijAnimationAsset[]
  >([]);
  const previousBundleRef = useRef<VizijAssetBundle | null>(null);
  const pendingPlanRef = useRef<ReturnType<
    typeof resolveRuntimeUpdatePlan
  > | null>(null);
  const updateTierRef = useRef<RuntimeUpdateTier>(updateTier);

  useEffect(() => {
    if (effectiveAssetBundle.bundle) {
      setExtractedBundle(effectiveAssetBundle.bundle);
      return;
    }
    if (effectiveAssetBundle.glb.kind === "world") {
      setExtractedBundle(effectiveAssetBundle.glb.bundle ?? null);
    } else {
      setExtractedBundle(null);
    }
  }, [effectiveAssetBundle]);

  useEffect(() => {
    updateTierRef.current = updateTier;
  }, [updateTier]);

  const assetBundle = useMemo(
    () =>
      mergeAssetBundle(
        effectiveAssetBundle,
        extractedBundle,
        extractedAnimations,
      ),
    [effectiveAssetBundle, extractedBundle, extractedAnimations],
  );

  useEffect(() => {
    const plan = resolveRuntimeUpdatePlan(
      previousBundleRef.current,
      effectiveAssetBundle,
      updateTierRef.current,
    );
    pendingPlanRef.current = plan;
    previousBundleRef.current = effectiveAssetBundle;
    if (plan.reregisterGraphs) {
      setGraphUpdateToken((prev) => prev + 1);
    }
  }, [effectiveAssetBundle]);

  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerMergedGraph,
    registerAnimation,
    removeGraph,
    removeAnimation,
    listControllers,
    setInput: orchestratorSetInput,
    getPathSnapshot,
    step: stepRuntime,
  } = useOrchestrator();
  const frame = useOrchFrame();

  const namespace = namespaceProp ?? assetBundle.namespace ?? "default";
  const faceId =
    faceIdProp ??
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
    assetBundle.pose?.config?.faceId ??
    undefined;

  const [status, setStatus] = useState<VizijRuntimeStatus>({
    loading: true,
    ready: false,
    error: null,
    errors: [],
    namespace,
    faceId,
    rootId: null,
    outputPaths: [],
    stepHz: undefined,
    controllers: { graphs: [], anims: [] },
  });

  const errorsRef = useRef<RuntimeError[]>([]);
  // namespaced output paths exposed via status
  const outputPathsRef = useRef<Set<string>>(new Set());
  // base (unnamespaced) output paths used for renderer/world mapping
  const baseOutputPathsRef = useRef<Set<string>>(new Set());
  const namespacedOutputPathsRef = useRef<Set<string>>(new Set());
  const namespaceRef = useRef(namespace);
  const driveOrchestratorRef = useRef(driveOrchestrator);
  const rigInputMapRef = useRef<Record<string, string>>({});
  const registeredGraphsRef = useRef<string[]>([]);
  const registeredAnimationsRef = useRef<string[]>([]);
  const mergedGraphRef = useRef<string | null>(null);
  const poseControlBridgeValuesRef = useRef<Map<string, number>>(new Map());
  const [inputConstraints, setInputConstraints] = useState<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const avgStepDtRef = useRef<number | null>(null);

  const animationTweensRef = useRef<Map<string, AnimationState>>(new Map());
  const clipPlaybackRef = useRef<Map<string, ClipPlaybackState>>(new Map());
  const stagedInputsRef = useRef<
    Map<string, { value: ValueJSON; shape?: ShapeJSON }>
  >(new Map());
  const autostartRef = useRef(autostart);
  const lastActivityTimeRef = useRef<number>(now());
  const [loopMode, setLoopMode] = useState<LoopMode>("stopped");
  const loopModeRef = useRef<LoopMode>("stopped");
  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);
  const runtimeMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      runtimeMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const rigAsset = assetBundle.rig;
    if (!rigAsset) {
      setInputConstraints({});
      return;
    }

    const rigSpec = resolveGraphSpec(
      rigAsset,
      `${rigAsset.id ?? "rig"} graph (constraints)`,
    );

    const constraints = extractInputConstraints(
      rigSpec as GraphRegistrationConfig["spec"],
      rigAsset.inputMetadata,
      namespace,
    );
    setInputConstraints(constraints);

    // Intentionally no logging here to keep runtime console quiet.
  }, [assetBundle.rig, namespace]);

  const requestLoopMode = useCallback((mode: LoopMode) => {
    if (!runtimeMountedRef.current) {
      return;
    }
    setLoopMode((prev) => (prev === mode ? prev : mode));
  }, []);

  const hasActiveAnimations = useCallback(() => {
    return (
      animationTweensRef.current.size > 0 || clipPlaybackRef.current.size > 0
    );
  }, []);

  const computeDesiredLoopMode = useCallback((): LoopMode => {
    const hasAnimations = hasActiveAnimations();
    const recentlyActive =
      now() - lastActivityTimeRef.current <= ACTIVE_GRACE_MS;
    if (autostartRef.current && (hasAnimations || recentlyActive)) {
      return "active";
    }
    if (autostartRef.current) {
      return "idle-visible";
    }
    return "idle-hidden";
  }, [hasActiveAnimations]);

  const updateLoopMode = useCallback(() => {
    requestLoopMode(computeDesiredLoopMode());
  }, [computeDesiredLoopMode, requestLoopMode]);

  const markActivity = useCallback(() => {
    lastActivityTimeRef.current = now();
    updateLoopMode();
  }, [updateLoopMode]);

  const setInput = useCallback(
    (path: string, value: ValueJSON, shape?: ShapeJSON) => {
      markActivity();
      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      stagedInputsRef.current.set(namespacedPath, { value, shape });
    },
    [markActivity],
  );

  const reportStatus = useCallback(
    (updater: (prev: VizijRuntimeStatus) => VizijRuntimeStatus) => {
      setStatus((prev) => {
        const next = updater(prev);
        onStatusChange?.(next);
        return next;
      });
    },
    [onStatusChange],
  );

  const pushError = useCallback(
    (error: RuntimeError) => {
      errorsRef.current = [...errorsRef.current, error];
      reportStatus((prev) => ({
        ...prev,
        error,
        errors: errorsRef.current,
      }));
      console.warn("[vizij-runtime]", error.message, error.cause);
    },
    [reportStatus],
  );

  const resetErrors = useCallback(() => {
    errorsRef.current = [];
    reportStatus((prev) => ({
      ...prev,
      error: null,
      errors: [],
    }));
  }, [reportStatus]);

  useEffect(() => {
    autostartRef.current = autostart;
    updateLoopMode();
  }, [autostart, updateLoopMode]);

  const clearControllers = useCallback(() => {
    const existing = listControllers();
    existing.graphs.forEach((id: ControllerId) => {
      try {
        removeGraph(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to remove graph ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    existing.anims.forEach((id: ControllerId) => {
      try {
        removeAnimation(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to remove animation ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    registeredGraphsRef.current = [];
    registeredAnimationsRef.current = [];
    mergedGraphRef.current = null;
    outputPathsRef.current = new Set();
    baseOutputPathsRef.current = new Set();
    namespacedOutputPathsRef.current = new Set();
  }, [listControllers, removeAnimation, removeGraph, pushError]);

  useEffect(() => {
    namespaceRef.current = namespace;
    reportStatus((prev) => ({
      ...prev,
      namespace,
      faceId,
    }));
  }, [namespace, faceId, reportStatus]);

  useEffect(() => {
    driveOrchestratorRef.current = driveOrchestrator;
  }, [driveOrchestrator]);

  const glbAsset = effectiveAssetBundle.glb;
  const baseBundle: VizijBundleExtension | null =
    effectiveAssetBundle.bundle ?? null;

  useEffect(() => {
    let cancelled = false;
    const plan = pendingPlanRef.current;
    if (plan && !plan.reloadAssets && status.rootId !== null) {
      reportStatus((prev) =>
        prev.loading ? { ...prev, loading: false } : prev,
      );
      return () => {
        cancelled = true;
      };
    }
    resetErrors();
    reportStatus((prev) => ({
      ...prev,
      loading: true,
      rootId: null,
      ready: false,
      outputPaths: [],
      controllers: { graphs: [], anims: [] },
    }));
    setExtractedAnimations([]);

    const loadAssets = async () => {
      try {
        let world: Record<string, any>;
        let animatables: Record<string, AnimatableValue>;
        let bundle: VizijBundleExtension | null = baseBundle;
        let gltfAnimations: ExtractedAnimationClip[] | undefined;

        if (glbAsset.kind === "url") {
          const loaded = await loadGLTFWithBundle(
            glbAsset.src,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
          world = loaded.world as Record<string, any>;
          animatables = loaded.animatables;
          bundle = loaded.bundle ?? bundle;
          gltfAnimations = pickExtractedAnimations(loaded);
        } else if (glbAsset.kind === "blob") {
          const loaded = await loadGLTFFromBlobWithBundle(
            glbAsset.blob,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
          world = loaded.world as Record<string, any>;
          animatables = loaded.animatables;
          bundle = loaded.bundle ?? bundle;
          gltfAnimations = pickExtractedAnimations(loaded);
        } else {
          world = glbAsset.world as Record<string, any>;
          animatables = glbAsset.animatables as Record<string, AnimatableValue>;
          bundle = glbAsset.bundle ?? bundle;
          gltfAnimations = undefined;
        }

        if (cancelled) {
          return;
        }

        setExtractedBundle(bundle ?? null);
        setExtractedAnimations(convertExtractedAnimations(gltfAnimations));

        const rootId = findRootId(world);
        store.getState().addWorldElements(world as any, animatables, true);

        reportStatus((prev) => ({
          ...prev,
          loading: false,
          rootId,
          namespace,
          faceId,
        }));
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        pushError({
          message: "Failed to load Vizij assets",
          cause: err,
          phase: "assets",
          timestamp: performance.now(),
        });
        reportStatus((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    };

    loadAssets();

    return () => {
      cancelled = true;
    };
  }, [
    glbAsset,
    baseBundle,
    namespace,
    faceId,
    store,
    pushError,
    reportStatus,
    resetErrors,
    setExtractedBundle,
    setExtractedAnimations,
    status.rootId,
  ]);

  useEffect(() => {
    if (!ready && autoCreate) {
      createOrchestrator(createOptions).catch((err: unknown) => {
        pushError({
          message: "Failed to create orchestrator runtime",
          cause: err,
          phase: "orchestrator",
          timestamp: performance.now(),
        });
      });
    }
  }, [ready, autoCreate, createOptions, createOrchestrator, pushError]);

  const registerControllers = useCallback(async () => {
    clearControllers();

    if (DEV_MODE) {
      console.log("[vizij-runtime] registerControllers", {
        hasRig: Boolean(assetBundle.rig),
        hasPose: Boolean(assetBundle.pose?.graph),
        namespace,
      });
    }

    const baseOutputPaths = new Set<string>();
    const namespacedOutputPaths = new Set<string>();
    const recordOutputs = (paths: string[]) => {
      paths.forEach((path) => {
        const trimmed = path.trim();
        if (!trimmed) return;
        const basePath = stripNamespace(trimmed, namespace);
        baseOutputPaths.add(basePath);
        namespacedOutputPaths.add(namespaceTypedPath(trimmed, namespace));
      });
    };

    const graphConfigs: GraphRegistrationConfig[] = [];
    rigInputMapRef.current = {};
    poseControlBridgeValuesRef.current.clear();

    const rigAsset = assetBundle.rig;
    if (rigAsset) {
      const rigSpec = resolveGraphSpec(
        rigAsset,
        `${rigAsset.id ?? "rig"} graph`,
      );
      if (!rigSpec) {
        pushError({
          message: "Rig graph is missing a usable spec or IR payload.",
          phase: "registration",
          timestamp: performance.now(),
        });
      } else {
        // Avoid logging here; browsers building DTS don't have `process` types.
        const rigOutputs = collectOutputPaths(rigSpec);
        const rigInputs = collectInputPaths(rigSpec);
        rigInputMapRef.current = collectInputPathMap(rigSpec);
        recordOutputs(rigOutputs);

        const rigSubs = rigAsset.subscriptions ?? {
          inputs: rigInputs,
          outputs: rigOutputs,
        };

        graphConfigs.push({
          id: namespaceControllerId(rigAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(rigSpec, namespace)),
          subs: namespaceSubscriptions(rigSubs, namespace),
        });
      }
    }

    const poseGraphAsset = assetBundle.pose?.graph;
    if (poseGraphAsset) {
      const poseSpec = resolveGraphSpec(
        poseGraphAsset,
        `${poseGraphAsset.id ?? "pose"} graph`,
      );
      if (poseSpec) {
        const poseOutputs = collectOutputPaths(poseSpec);
        const poseInputs = collectInputPaths(poseSpec);
        recordOutputs(poseOutputs);

        const poseSubs = poseGraphAsset.subscriptions ?? {
          inputs: poseInputs,
          outputs: poseOutputs,
        };

        graphConfigs.push({
          id: namespaceControllerId(poseGraphAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(poseSpec, namespace)),
          subs: namespaceSubscriptions(poseSubs, namespace),
        });
      } else {
        console.warn(
          "[vizij-runtime] Pose graph is missing a usable spec or IR payload; skipping registration.",
        );
      }
    }

    outputPathsRef.current = namespacedOutputPaths;
    baseOutputPathsRef.current = baseOutputPaths;
    namespacedOutputPathsRef.current = namespacedOutputPaths;

    const graphIds: string[] = [];

    try {
      if (graphConfigs.length > 1) {
        const mergedId = registerMergedGraph({
          id:
            namespaceControllerId(
              mergedGraphRef.current ?? `merged-${namespace}`,
              namespace,
              "merged",
            ) ?? undefined,
          graphs: graphConfigs,
          strategy: mergeStrategy ?? DEFAULT_MERGE,
        });
        mergedGraphRef.current = mergedId;
        graphIds.push(mergedId);
      } else {
        graphConfigs.forEach((cfg) => {
          const id = registerGraph(cfg);
          graphIds.push(id);
        });
      }
    } catch (err: unknown) {
      pushError({
        message: "Failed to register rig graphs",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    }

    registeredGraphsRef.current = graphIds;
    if (DEV_MODE) {
      console.log("[vizij-runtime] registered graph ids", graphIds);
    }

    const animationIds: string[] = [];
    for (const anim of assetBundle.animations ?? []) {
      try {
        const controllerId =
          namespaceControllerId(anim.id, namespace, "animation") ?? anim.id;
        const config: AnimationRegistrationConfig = {
          id: controllerId,
          setup: {
            animation: anim.clip,
            ...(anim.setup ?? {}),
          } as AnimationRegistrationConfig["setup"],
        };
        const id = registerAnimation(config);
        animationIds.push(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to register animation ${anim.id}`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
      }
    }

    registeredAnimationsRef.current = animationIds;

    if (assetBundle.initialInputs) {
      Object.entries(assetBundle.initialInputs).forEach(([path, value]) => {
        try {
          setInput(path, value);
        } catch (err: unknown) {
          pushError({
            message: `Failed to stage initial input ${path}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
      });
    }

    const controllers = listControllers();
    if (DEV_MODE) {
      console.log("[vizij-runtime] controllers after register", {
        controllers,
        graphIds,
        animationIds,
      });
    }
    reportStatus((prev) => ({
      ...prev,
      ready: true,
      controllers,
      outputPaths: Array.from(outputPathsRef.current),
    }));
    onRegisterControllers?.(controllers);
  }, [
    assetBundle,
    clearControllers,
    listControllers,
    mergeStrategy,
    namespace,
    onRegisterControllers,
    pushError,
    registerAnimation,
    registerGraph,
    registerMergedGraph,
    reportStatus,
    setInput,
  ]);

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    const plan = pendingPlanRef.current;
    const hasRegistered =
      registeredGraphsRef.current.length > 0 ||
      registeredAnimationsRef.current.length > 0;
    if (plan && !plan.reregisterGraphs && hasRegistered) {
      return;
    }
    registerControllers().catch((err: unknown) => {
      pushError({
        message: "Failed to register controllers",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    });
  }, [ready, status.loading, graphUpdateToken, registerControllers, pushError]);

  useEffect(() => {
    if (!frame) {
      return;
    }
    const writes = frame.merged_writes ?? [];
    if (!writes.length) {
      return;
    }
    const setWorldValues = store.getState().setValues;
    const namespaceValue = status.namespace;
    const currentValues = store.getState().values;
    const rigInputPathMap = rigInputMapRef.current;
    const batched: Array<{ id: string; namespace: string; value: RawValue }> =
      [];
    const namespacedOutputs = namespacedOutputPathsRef.current;
    const baseOutputs = baseOutputPathsRef.current;
    writes.forEach((write: WriteOp) => {
      const path = normalisePath(write.path);
      if (!namespacedOutputs.has(path)) {
        return;
      }
      const raw = valueJSONToRaw(write.value);
      if (raw === undefined) {
        return;
      }
      const basePath = stripNamespace(path, namespaceValue);
      const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
        basePath,
      );
      if (poseControlMatch && typeof raw === "number" && Number.isFinite(raw)) {
        const inputId = (poseControlMatch[1] ?? "").trim();
        const mappedInputPath = inputId ? rigInputPathMap[inputId] : undefined;
        if (mappedInputPath) {
          const bridgeKey = `${namespaceValue}:${mappedInputPath}`;
          const previousValue =
            poseControlBridgeValuesRef.current.get(bridgeKey);
          if (
            previousValue === undefined ||
            Math.abs(previousValue - raw) > POSE_CONTROL_BRIDGE_EPSILON
          ) {
            poseControlBridgeValuesRef.current.set(bridgeKey, raw);
            setInput(mappedInputPath, { float: raw });
          }
        }
      }
      const targetPath = baseOutputs.has(basePath) ? basePath : path;
      const currentValue = currentValues.get(
        getLookup(namespaceValue, targetPath),
      );
      const nextWrite = transformOutputWrite
        ? transformOutputWrite({
            id: targetPath,
            namespace: namespaceValue,
            value: raw,
            currentValue,
          })
        : {
            id: targetPath,
            namespace: namespaceValue,
            value: raw,
          };
      if (nextWrite) {
        batched.push(nextWrite);
      }
    });
    if (batched.length > 0) {
      setWorldValues(batched);
    }
  }, [frame, status.namespace, store, transformOutputWrite]);

  const stagePoseNeutral = useCallback(
    (force = false) => {
      const neutral = assetBundle.pose?.config?.neutralInputs ?? {};
      const rigMap = rigInputMapRef.current;
      const staged = new Set<string>();
      Object.entries(neutral).forEach(([id, value]) => {
        const path = rigMap[id];
        if (!path) {
          return;
        }
        const include = assetBundle.pose?.stageNeutralFilter;
        if (include && !include(id, path)) {
          return;
        }
        setInput(path, { float: Number.isFinite(value) ? value : 0 });
        staged.add(path);
      });
      if (force) {
        Object.entries(rigMap).forEach(([id, path]) => {
          if (staged.has(path)) {
            return;
          }
          const include = assetBundle.pose?.stageNeutralFilter;
          if (include && !include(id, path)) {
            return;
          }
          setInput(path, { float: 0 });
        });
      }
    },
    [assetBundle.pose?.config?.neutralInputs, setInput],
  );

  const setRendererValue = useCallback(
    (
      id: string,
      ns: string,
      value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined),
    ) => {
      store.getState().setValue(id, ns, value);
    },
    [store],
  );

  const cancelAnimation = useCallback((path: string) => {
    if (animationTweensRef.current.has(path)) {
      const entry = animationTweensRef.current.get(path);
      animationTweensRef.current.delete(path);
      entry?.resolve();
    }
  }, []);

  const advanceAnimationTweens = useCallback(
    (dt: number) => {
      if (animationTweensRef.current.size === 0) {
        return;
      }
      const map = animationTweensRef.current;
      const toDelete: string[] = [];
      map.forEach((state, key) => {
        state.elapsed += dt;
        const progress =
          state.duration === 0
            ? 1
            : Math.min(state.elapsed / state.duration, 1);
        const eased = state.easing(progress);
        const value = state.from + (state.to - state.from) * eased;
        setInput(state.path, { float: value });
        if (progress >= 1) {
          toDelete.push(key);
          state.resolve();
        }
      });
      toDelete.forEach((key) => map.delete(key));
    },
    [setInput],
  );

  const sampleTrack = useCallback(
    (track: AnimationTrackLike, time: number): number => {
      const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (!keyframes.length) {
        return 0;
      }
      const first = keyframes[0];
      if (!first) {
        return 0;
      }
      if (time <= Number(first.time ?? 0)) {
        return Number(first.value ?? 0);
      }
      for (let i = 0; i < keyframes.length - 1; i += 1) {
        const current = keyframes[i] ?? {};
        const next = keyframes[i + 1] ?? {};
        const start = Number(current.time ?? 0);
        const end = Number(next.time ?? start);
        if (time >= start && time <= end) {
          const range = end - start || 1;
          const factor = (time - start) / range;
          const currentValue = Number(current.value ?? 0);
          const nextValue = Number(next.value ?? currentValue);
          return currentValue + (nextValue - currentValue) * factor;
        }
      }
      const last = keyframes[keyframes.length - 1];
      return Number(last?.value ?? 0);
    },
    [],
  );

  const advanceClipPlayback = useCallback(
    (dt: number) => {
      if (clipPlaybackRef.current.size === 0) {
        return;
      }
      const map = clipPlaybackRef.current;
      const toDelete: string[] = [];
      map.forEach((state, key) => {
        state.time += dt * state.speed;
        const clip = assetBundle.animations?.find(
          (anim) => anim.id === state.id,
        );
        if (!clip) {
          toDelete.push(key);
          state.resolve();
          return;
        }
        const clipData: AnimationClipLike = clip.clip;
        const duration = Number(clipData?.duration ?? state.duration);
        state.duration =
          Number.isFinite(duration) && duration > 0 ? duration : state.duration;
        if (state.time >= state.duration) {
          toDelete.push(key);
          state.time = state.duration;
        }
        const tracks = Array.isArray(clipData?.tracks)
          ? (clipData.tracks as AnimationTrackLike[])
          : [];
        tracks.forEach((track) => {
          const value = sampleTrack(track, state.time) * state.weight;
          const path = `animation/${clip.id}/${track.channel}`;
          setInput(path, { float: value });
        });
        if (toDelete.includes(key)) {
          state.resolve();
        }
      });
      toDelete.forEach((key) => {
        clipPlaybackRef.current.delete(key);
        const clip = assetBundle.animations?.find((anim) => anim.id === key);
        if (clip) {
          const clipData: AnimationClipLike = clip.clip;
          const tracks = Array.isArray(clipData?.tracks)
            ? (clipData.tracks as AnimationTrackLike[])
            : [];
          tracks.forEach((track) => {
            const path = `animation/${clip.id}/${track.channel}`;
            setInput(path, { float: 0 });
          });
        }
      });
    },
    [assetBundle.animations, sampleTrack, setInput],
  );

  const animateValue = useCallback(
    (path: string, target: ValueJSON, options?: AnimateValueOptions) => {
      const easing = resolveEasing(options?.easing);
      const duration = Math.max(0, options?.duration ?? DEFAULT_DURATION);
      cancelAnimation(path);

      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      const current = getPathSnapshot(namespacedPath);
      const fromValue = valueAsNumber(current);
      const toValue = valueAsNumber(target);

      if (fromValue == null || toValue == null || duration === 0) {
        setInput(path, target);
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        animationTweensRef.current.set(path, {
          path: namespacedPath,
          from: fromValue,
          to: toValue,
          duration,
          elapsed: 0,
          easing,
          resolve,
        });
        markActivity();
      });
    },
    [cancelAnimation, getPathSnapshot, markActivity, setInput],
  );

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const clip = assetBundle.animations?.find((anim) => anim.id === id);
      if (!clip) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      if (clipPlaybackRef.current.has(id)) {
        clipPlaybackRef.current.delete(id);
      }
      return new Promise<void>((resolve) => {
        const speed = options?.speed ?? 1;
        const weight = options?.weight ?? clip.weight ?? 1;
        const clipData: AnimationClipLike = clip.clip;
        clipPlaybackRef.current.set(id, {
          id,
          time: options?.reset ? 0 : 0,
          duration: Number(clipData?.duration ?? 0),
          speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
          weight,
          resolve,
        });
        markActivity();
      });
    },
    [assetBundle.animations, markActivity],
  );

  const stopAnimation = useCallback(
    (id: string) => {
      const clip = assetBundle.animations?.find((anim) => anim.id === id);
      const state = clipPlaybackRef.current.get(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.resolve();
      }
      if (clip) {
        const clipData: AnimationClipLike = clip.clip;
        const tracks = Array.isArray(clipData?.tracks)
          ? (clipData.tracks as AnimationTrackLike[])
          : [];
        tracks.forEach((track) => {
          const path = `animation/${clip.id}/${track.channel}`;
          setInput(path, { float: 0 });
        });
      }
    },
    [assetBundle.animations, setInput],
  );

  const registerInputDriver = useCallback(
    (id: string, factory: InputDriverFactory): InputDriverLifecycle => {
      const driver = factory({
        setInput,
        setRendererValue,
        namespace,
        faceId,
      });
      const wrapped: InputDriverLifecycle = {
        start: () => {
          try {
            driver.start();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to start`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          }
        },
        stop: () => {
          try {
            driver.stop();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to stop`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          }
        },
        dispose: () => {
          try {
            driver.dispose();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to dispose`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          }
        },
      };
      return wrapped;
    },
    [faceId, namespace, pushError, setInput, setRendererValue],
  );

  const advanceAnimations = useCallback(
    (dt: number) => {
      advanceAnimationTweens(dt);
      advanceClipPlayback(dt);
    },
    [advanceAnimationTweens, advanceClipPlayback],
  );

  const flushStagedInputs = useCallback(() => {
    if (stagedInputsRef.current.size === 0) {
      return;
    }
    stagedInputsRef.current.forEach(({ value, shape }, path) => {
      orchestratorSetInput(path, value, shape);
    });
    stagedInputsRef.current.clear();
  }, [orchestratorSetInput]);

  const step = useCallback(
    (dt: number, opts?: { forceRuntime?: boolean }) => {
      if (dt > 0 && Number.isFinite(dt)) {
        const prev = avgStepDtRef.current ?? dt;
        const alpha = 0.1;
        avgStepDtRef.current = prev * (1 - alpha) + dt * alpha;
      }
      advanceAnimations(dt);
      flushStagedInputs();
      if (driveOrchestratorRef.current || opts?.forceRuntime) {
        stepRuntime(dt);
      }
    },
    [advanceAnimations, flushStagedInputs, stepRuntime],
  );

  useEffect(() => {
    if (loopMode !== "active") {
      return;
    }
    let rafId: number | null = null;
    let lastTime: number | null = null;
    const tick = (timestamp: number) => {
      if (loopModeRef.current !== "active") {
        return;
      }
      if (lastTime == null) {
        lastTime = timestamp;
      }
      const dt = Math.max(0, (timestamp - lastTime) / 1000);
      lastTime = timestamp;
      step(dt || 0);
      requestLoopMode(computeDesiredLoopMode());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [loopMode, computeDesiredLoopMode, requestLoopMode, step]);

  useEffect(() => {
    if (loopMode !== "idle-visible" && loopMode !== "idle-hidden") {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const fps =
      loopMode === "idle-visible" ? VISIBLE_IDLE_FPS : HIDDEN_IDLE_FPS;
    if (fps <= 0) {
      return;
    }
    let lastTime = now();
    const interval = 1000 / fps;
    const tick = () => {
      if (
        loopModeRef.current !== "idle-visible" &&
        loopModeRef.current !== "idle-hidden"
      ) {
        return;
      }
      const current = now();
      const dt = Math.max(0, (current - lastTime) / 1000);
      lastTime = current;
      step(dt || 0);
      requestLoopMode(computeDesiredLoopMode());
    };
    const intervalId = window.setInterval(tick, interval);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loopMode, computeDesiredLoopMode, requestLoopMode, step]);

  useEffect(() => {
    return () => {
      animationTweensRef.current.clear();
      clipPlaybackRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const id = window.setInterval(() => {
      const avg = avgStepDtRef.current;
      const stepHz =
        avg && Number.isFinite(avg) && avg > 0 ? 1 / avg : undefined;
      reportStatus((prev) =>
        prev.stepHz === stepHz ? prev : { ...prev, stepHz },
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [reportStatus]);

  const setGraphBundle = useCallback(
    (bundle: RuntimeGraphBundle, options?: { tier?: RuntimeUpdateTier }) => {
      const hasRigOverride = Object.prototype.hasOwnProperty.call(
        bundle,
        "rig",
      );
      const hasPoseOverride = Object.prototype.hasOwnProperty.call(
        bundle,
        "pose",
      );
      const nextAssetBundle: VizijAssetBundle = {
        ...effectiveAssetBundle,
      };

      if (hasRigOverride) {
        if (bundle.rig) {
          nextAssetBundle.rig = bundle.rig;
        } else {
          delete nextAssetBundle.rig;
        }
      }

      if (hasPoseOverride) {
        if (bundle.pose) {
          nextAssetBundle.pose = bundle.pose;
        } else {
          delete nextAssetBundle.pose;
        }
      }

      const plan = resolveRuntimeUpdatePlan(
        previousBundleRef.current,
        nextAssetBundle,
        options?.tier ?? updateTierRef.current,
      );
      pendingPlanRef.current = plan;
      previousBundleRef.current = nextAssetBundle;
      setAssetBundleOverride(nextAssetBundle);
      if (plan.reregisterGraphs) {
        setGraphUpdateToken((prev) => prev + 1);
      }
      if (plan.reloadAssets) {
        reportStatus((prev) => ({
          ...prev,
          loading: true,
          ready: false,
        }));
      } else {
        reportStatus((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    },
    [effectiveAssetBundle, reportStatus],
  );

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      setInput,
      setGraphBundle,
      setValue: setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      stopAnimation,
      step,
      advanceAnimations,
      inputConstraints,
    }),
    [
      status,
      assetBundle,
      setInput,
      setGraphBundle,
      setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      stopAnimation,
      step,
      advanceAnimations,
      inputConstraints,
    ],
  );

  return (
    <VizijRuntimeContext.Provider value={contextValue}>
      {children}
    </VizijRuntimeContext.Provider>
  );
}

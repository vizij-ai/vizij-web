import type {
  VizijBundleAnimationEntry,
  VizijBundleExtension,
  VizijBundleGraphEntry,
} from "@vizij/render";
import type {
  GraphRegistrationConfig,
  GraphSubscriptions,
  ShapeJSON,
  ValueJSON,
} from "@vizij/orchestrator-react";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import type {
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
  PoseRigConfig,
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijGraphAsset,
  VizijInputMetadata,
  VizijProgramAsset,
} from "./types";
import { collectInputPaths, collectOutputPaths } from "./utils/graph";
import { resolveClipDurationSeconds } from "./utils/clipPlayback";

export type InputConstraint = {
  min?: number;
  max?: number;
  defaultValue?: number;
};

type GraphSubscriptionsLike = Partial<GraphSubscriptions>;

export type GraphRegistrationSupportResult = {
  config: GraphRegistrationConfig;
  spec: GraphRegistrationConfig["spec"];
  inputs: string[];
  outputs: string[];
};

type GraphNodeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["nodes"]
>[number];
type GraphEdgeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["edges"]
>[number];

export function normalisePath(path: string): string {
  if (!path) {
    return path;
  }
  return path.startsWith("debug/") ? path.slice("debug/".length) : path;
}

function normaliseBundleKind(kind: unknown): string {
  return typeof kind === "string" ? kind.toLowerCase() : "";
}

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

export function extractInputConstraints(
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

export function namespaceTypedPath(path: string, namespace: string): string {
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

export function stripNamespace(path: string, namespace: string): string {
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

export function namespaceControllerId(
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
  subs: GraphSubscriptionsLike | undefined,
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
    return subs as GraphSubscriptions;
  }

  return {
    ...subs,
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
  } as GraphSubscriptions;
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

export function resolveGraphSpec(
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
  interpolation?: unknown;
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

export function convertExtractedAnimations(
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
      const interpolationRaw =
        typeof track.interpolation === "string"
          ? track.interpolation.trim().toLowerCase()
          : "linear";
      const interpolation: AnimationTrackLike["interpolation"] =
        interpolationRaw === "step"
          ? "step"
          : interpolationRaw === "cubic" || interpolationRaw === "cubicspline"
            ? "cubic"
            : "linear";
      const isCubic = interpolation === "cubic";

      const hasTripletTangents =
        isCubic && values.length === times.length * valueSize * 3;
      const hasFlatValues = values.length === times.length * valueSize;
      if (!hasTripletTangents && !hasFlatValues) {
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
        const flatBase = index * valueSize + componentIndex;
        const valueBase = hasTripletTangents
          ? index * valueSize * 3 + valueSize + componentIndex
          : flatBase;
        const value = values[valueBase];
        if (!Number.isFinite(value)) {
          return;
        }
        const keyframe: AnimationKeyframeLike = {
          time,
          value,
        };
        if (hasTripletTangents) {
          const inBase = index * valueSize * 3 + componentIndex;
          const outBase =
            index * valueSize * 3 + valueSize * 2 + componentIndex;
          const inTangent = values[inBase];
          const outTangent = values[outBase];
          if (Number.isFinite(inTangent)) {
            keyframe.inTangent = inTangent;
          }
          if (Number.isFinite(outTangent)) {
            keyframe.outTangent = outTangent;
          }
        }
        keyframes.push(keyframe);
      });

      if (keyframes.length === 0) {
        return;
      }

      convertedTracks.push({
        channel: channelId,
        keyframes,
        interpolation,
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

export function pickExtractedAnimations(
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
  hasExplicitOverride: boolean,
  fromBundle: VizijAnimationAsset[],
): VizijAnimationAsset[] | undefined {
  if (!hasExplicitOverride) {
    return fromBundle.length > 0 ? fromBundle : undefined;
  }
  if (!Array.isArray(explicit)) {
    return undefined;
  }
  if (explicit.length === 0) {
    return [];
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

function extractProgramResetValues(
  value: unknown,
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(([, rawValue]) =>
    Number.isFinite(Number(rawValue)),
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(
    entries.map(([path, rawValue]) => [path, Number(rawValue)]),
  );
}

export function convertBundlePrograms(
  entries: VizijBundleGraphEntry[] | undefined | null,
): VizijProgramAsset[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries
    .filter((entry) => normaliseBundleKind(entry?.kind) === "motiongraph")
    .map((entry) => {
      const graph = convertBundleGraph(entry);
      if (!graph) {
        return null;
      }
      const metadata =
        entry.metadata &&
        typeof entry.metadata === "object" &&
        !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : undefined;
      return {
        id: entry.id,
        label: typeof entry.label === "string" ? entry.label : undefined,
        graph,
        metadata,
        resetValues: extractProgramResetValues(metadata?.resetValues),
      } satisfies VizijProgramAsset;
    })
    .filter(Boolean) as VizijProgramAsset[];
}

export function deriveProgramInputSeedValues(args: {
  program: VizijProgramAsset;
  namespace: string;
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
  getPathSnapshot: (path: string) => ValueJSON | undefined;
  stagedInputs: Map<string, { value: ValueJSON; shape?: ShapeJSON }>;
}): Array<{ path: string; value: ValueJSON }> {
  const resolveConstraintDefault = (path: string): number | undefined => {
    const trimmed = path.trim();
    if (!trimmed) {
      return undefined;
    }

    const stripped = stripRigFacePrefix(trimmed);
    const relativePath = stripped ? `/${stripped}` : "";
    const candidates = [
      namespaceTypedPath(trimmed, args.namespace),
      trimmed,
      stripped ? namespaceTypedPath(stripped, args.namespace) : undefined,
      stripped || undefined,
      relativePath || undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const defaultValue = args.inputConstraints[candidate]?.defaultValue;
      if (Number.isFinite(defaultValue)) {
        return Number(defaultValue);
      }
    }

    return undefined;
  };

  const graphSpec = resolveGraphSpec(
    args.program.graph,
    `${args.program.id ?? "program"} graph (seed defaults)`,
  );
  if (!graphSpec) {
    return [];
  }

  return collectInputPaths(graphSpec)
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .flatMap((path) => {
      const namespacedPath = namespaceTypedPath(path, args.namespace);
      if (args.stagedInputs.has(namespacedPath)) {
        return [];
      }
      if (args.getPathSnapshot(namespacedPath) !== undefined) {
        return [];
      }

      const defaultValue = resolveConstraintDefault(path);
      if (!Number.isFinite(defaultValue)) {
        return [];
      }

      return [{ path, value: { float: Number(defaultValue) } }];
    });
}

function mergeProgramLists(
  explicit: VizijProgramAsset[] | undefined,
  hasExplicitOverride: boolean,
  fromBundle: VizijProgramAsset[],
): VizijProgramAsset[] | undefined {
  if (!hasExplicitOverride) {
    return fromBundle.length > 0 ? fromBundle : undefined;
  }
  if (!Array.isArray(explicit)) {
    return undefined;
  }
  if (explicit.length === 0) {
    return [];
  }
  if (fromBundle.length === 0) {
    return explicit;
  }
  const seen = new Set(explicit.map((program) => program.id));
  let changed = false;
  const merged = [...explicit];
  for (const program of fromBundle) {
    if (!program.id || seen.has(program.id)) {
      continue;
    }
    merged.push(program);
    seen.add(program.id);
    changed = true;
  }
  return changed ? merged : explicit;
}

export function mergeAssetBundle(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): VizijAssetBundle {
  const resolvedBundle = base.bundle ?? extracted ?? null;
  const hasBaseRigOverride = Object.prototype.hasOwnProperty.call(base, "rig");
  const hasBasePoseOverride = Object.prototype.hasOwnProperty.call(
    base,
    "pose",
  );
  const hasBaseAnimationsOverride = Object.prototype.hasOwnProperty.call(
    base,
    "animations",
  );
  const hasBaseProgramsOverride = Object.prototype.hasOwnProperty.call(
    base,
    "programs",
  );

  const rigFromBundle = convertBundleGraph(
    pickBundleGraph(resolvedBundle, ["rig"]),
  );
  const resolvedRig = hasBaseRigOverride
    ? base.rig
    : (base.rig ?? rigFromBundle ?? undefined);

  const basePose = base.pose;
  const hasBasePoseGraphOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "graph"),
  );
  const hasBasePoseConfigOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "config"),
  );
  const poseStageFilter = basePose?.stageNeutralFilter;
  const poseGraphFromBundle =
    hasBasePoseOverride && !basePose
      ? null
      : hasBasePoseGraphOverride
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
  if (hasBasePoseOverride && !basePose) {
    resolvedPose = undefined;
  } else if (basePose) {
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
    hasBaseAnimationsOverride,
    animationsFromBundle,
  );
  const animationsFromAsset =
    extractedAnimations && extractedAnimations.length > 0
      ? extractedAnimations
      : [];
  if (animationsFromAsset.length > 0) {
    resolvedAnimations = mergeAnimationLists(
      resolvedAnimations,
      true,
      animationsFromAsset,
    );
  }
  const programsFromBundle = mergeProgramLists(
    base.programs,
    hasBaseProgramsOverride,
    convertBundlePrograms(resolvedBundle?.graphs),
  );

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
  merged.programs = programsFromBundle;
  merged.bundle = resolvedBundle;

  return merged;
}

export function prepareRuntimeAssetBundle(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): VizijAssetBundle {
  return mergeAssetBundle(base, extracted, extractedAnimations);
}

export function buildGraphRegistrationConfig(args: {
  asset: VizijGraphAsset;
  namespace: string;
  context: string;
  kind?: "graph" | "merged";
  subscriptions?: GraphSubscriptionsLike;
}): GraphRegistrationSupportResult | null {
  const graphSpec = resolveGraphSpec(args.asset, args.context);
  if (!graphSpec) {
    return null;
  }
  const outputs = collectOutputPaths(graphSpec);
  const inputs = collectInputPaths(graphSpec);
  const subs = args.subscriptions ??
    args.asset.subscriptions ?? {
      inputs,
      outputs,
    };

  return {
    spec: graphSpec,
    inputs,
    outputs,
    config: {
      id: namespaceControllerId(args.asset.id, args.namespace, args.kind),
      spec: stripNulls(namespaceGraphSpec(graphSpec, args.namespace)),
      subs: namespaceSubscriptions(subs, args.namespace),
    },
  };
}

function normalizeStoredAnimationInterpolation(
  interpolation: unknown,
): "linear" | "step" | "cubic" {
  const mode =
    typeof interpolation === "string"
      ? interpolation.trim().toLowerCase()
      : "linear";
  if (mode === "step") {
    return "step";
  }
  if (mode === "cubic" || mode === "cubicspline") {
    return "cubic";
  }
  return "linear";
}

function buildStoredAnimationTransitions(mode: "linear" | "step" | "cubic") {
  if (mode === "cubic") {
    return undefined;
  }
  if (mode === "step") {
    return {
      in: "linear",
      out: { x: 0, y: 0 },
    };
  }
  return {
    in: "linear",
    out: "linear",
  };
}

export function toStoredAnimationClip(
  fallbackId: string,
  clip: AnimationClipLike,
): Record<string, unknown> {
  const clipId =
    typeof clip.id === "string" && clip.id.trim().length > 0
      ? clip.id.trim()
      : fallbackId;
  const clipName =
    typeof clip.name === "string" && clip.name.trim().length > 0
      ? clip.name.trim()
      : clipId;
  const durationSeconds = resolveClipDurationSeconds(clip, 0);
  const durationMs = Math.max(1, Math.round(durationSeconds * 1000));

  const tracks = (Array.isArray(clip.tracks) ? clip.tracks : [])
    .map((rawTrack, trackIndex) => {
      const channel =
        typeof rawTrack.channel === "string" ? rawTrack.channel.trim() : "";
      if (!channel) {
        return null;
      }
      const keyframes = (
        Array.isArray(rawTrack.keyframes) ? rawTrack.keyframes : []
      )
        .map((keyframe) => {
          const time = Number(keyframe.time);
          const value = Number(keyframe.value);
          const keyframeId = keyframe["id"];
          const keyframeInterpolation = keyframe["interpolation"];
          if (!Number.isFinite(time) || !Number.isFinite(value)) {
            return null;
          }
          return {
            id:
              typeof keyframeId === "string" && keyframeId.trim().length > 0
                ? keyframeId.trim()
                : `${clipId}:track-${trackIndex.toString().padStart(4, "0")}:point-${time.toFixed(6)}`,
            time,
            value,
            mode: normalizeStoredAnimationInterpolation(
              keyframeInterpolation ?? rawTrack.interpolation,
            ),
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        time: number;
        value: number;
        mode: "linear" | "step" | "cubic";
      }>;

      if (keyframes.length === 0) {
        return null;
      }

      keyframes.sort((left, right) => {
        if (left.time !== right.time) {
          return left.time - right.time;
        }
        return left.id.localeCompare(right.id);
      });

      const rawTrackId = rawTrack["id"];
      const rawTrackName = rawTrack["name"];
      const trackId =
        typeof rawTrackId === "string" && rawTrackId.trim().length > 0
          ? rawTrackId.trim()
          : `${clipId}:track-${trackIndex.toString().padStart(4, "0")}`;
      const trackName =
        typeof rawTrackName === "string" && rawTrackName.trim().length > 0
          ? rawTrackName.trim()
          : channel.replace(/^\/+/, "") || trackId;
      return {
        id: trackId,
        name: trackName,
        animatableId: channel,
        points: keyframes.map((keyframe) => {
          const stamp = Math.max(0, Math.round(keyframe.time * 1000));
          const transitions = buildStoredAnimationTransitions(keyframe.mode);
          return {
            id: keyframe.id,
            stamp,
            value: keyframe.value,
            ...(transitions ? { transitions } : {}),
          };
        }),
      };
    })
    .filter(Boolean);

  return {
    id: clipId,
    name: clipName,
    formatVersion: 2,
    defaultViewportExtent: durationMs,
    groups: {},
    tracks,
  };
}

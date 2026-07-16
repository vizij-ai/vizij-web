import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import { getLookup, type AnimatableValue, type RawValue } from "@vizij/utils";
import { DeviceSlot, ensureWasmInit, isGoldenPath } from "./engine/aroraEngine";
import { composeGraphSpecs, type GraphSource } from "./utils/composeGraph";
import type {
  GraphRegistrationConfig,
  GraphSubscriptions,
  MergeStrategyOptions,
  ShapeJSON,
  AnimationRegistrationConfig,
  ControllerId,
} from "./types";
import { VizijRuntimeContext } from "./context";
import {
  clearRuntimeDebugState,
  setRuntimeDebugState,
} from "./memoryInvestigation";
import {
  applyRuntimeGraphBundle,
  resolveRuntimeUpdatePlan,
  type RuntimeGraphBundle,
  type RuntimeUpdateTier,
} from "./updatePolicy";
import type {
  AnimateValueOptions,
  AnimationPlaybackState,
  InputDriverFactory,
  InputDriverLifecycle,
  PlayAnimationOptions,
  ProgramPlaybackState,
  StopAnimationOptions,
  StopProgramOptions,
  RuntimeError,
  VizijAssetBundle,
  VizijAnimationAsset,
  VizijGraphAsset,
  VizijProgramAsset,
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
import { buildPoseWeightPathMap, buildRigInputPath } from "./utils/posePaths";
import {
  resolvePoseControlInputPath,
  shouldUseLegacyPoseWeightFallback,
} from "./utils/poseRuntime";
import {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
} from "./utils/clipPlayback";
import {
  collectAnimationClipOutputPaths,
  diffAnimationAggregateValues,
  sampleAnimationClipOutputValues,
} from "./utils/animationBridge";
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
  loop: boolean;
  playing: boolean;
  resolve: (() => void) | null;
  completion: Promise<void> | null;
};

type ProgramTransportState = {
  id: string;
  state: ProgramPlaybackState["state"];
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
let runtimeDebugInstanceSequence = 0;
const DEV_MODE = (() => {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;
  return typeof nodeEnv === "string" && nodeEnv === "development";
})();

function isRuntimeDebugEnabled(): boolean {
  if (DEV_MODE) {
    return true;
  }
  return Boolean(
    (globalThis as { __VIZIJ_RUNTIME_DEBUG__?: boolean })
      .__VIZIJ_RUNTIME_DEBUG__,
  );
}

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

function convertBundlePrograms(
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

/**
 * The default (neutral) value declared for an input path, resolved across the
 * path forms the constraint map is keyed by (namespaced, base, rig/face-
 * stripped, relative). Returns `undefined` when no finite default is declared.
 */
export function resolveConstraintDefault(
  path: string,
  namespace: string,
  inputConstraints: Record<string, { defaultValue?: number }>,
): number | undefined {
  const trimmed = path.trim();
  if (!trimmed) {
    return undefined;
  }

  const stripped = stripRigFacePrefix(trimmed);
  const relativePath = stripped ? `/${stripped}` : "";
  const candidates = [
    namespaceTypedPath(trimmed, namespace),
    trimmed,
    stripped ? namespaceTypedPath(stripped, namespace) : undefined,
    stripped || undefined,
    relativePath || undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const defaultValue = inputConstraints[candidate]?.defaultValue;
    if (Number.isFinite(defaultValue)) {
      return Number(defaultValue);
    }
  }

  return undefined;
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

      const defaultValue = resolveConstraintDefault(
        path,
        args.namespace,
        args.inputConstraints,
      );
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
      in: { x: 1, y: 1 },
      out: { x: 1, y: 0 },
    };
  }
  return {
    in: { x: 1, y: 1 },
    out: { x: 0, y: 0 },
  };
}

function toStoredAnimationClip(
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
      const denominator = durationSeconds > 0 ? durationSeconds : 1;

      return {
        id: trackId,
        name: trackName,
        animatableId: channel,
        points: keyframes.map((keyframe) => {
          const stamp = Math.max(0, Math.min(1, keyframe.time / denominator));
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
    duration: durationMs,
    groups: {},
    tracks,
  };
}

export function VizijRuntimeProvider({
  assetBundle,
  children,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier = "auto",
  autoCreate = true,
  autostart = false,
  driveRuntime = true,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  transformOutputWrite,
}: ProviderProps) {
  const storeRef = useRef<VizijStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createVizijStore();
  }

  // The engine is an Arora device owned by this provider; every provider is
  // isolated (its own device, its own store namespace).
  return (
    <VizijContext.Provider value={storeRef.current}>
      <VizijRuntimeProviderInner
        assetBundle={assetBundle}
        namespace={namespaceProp}
        faceId={faceIdProp}
        updateTier={updateTier}
        autoCreate={autoCreate}
        autostart={autostart}
        driveRuntime={driveRuntime}
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
  driveRuntime: boolean;
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
  driveRuntime,
}: VizijRuntimeProviderInnerProps) {
  const [assetBundleOverride, setAssetBundleOverride] =
    useState<VizijAssetBundle | null>(null);
  const [graphUpdateToken, setGraphUpdateToken] = useState(0);
  const effectiveAssetBundle = assetBundleOverride ?? initialAssetBundle;
  const latestEffectiveAssetBundleRef =
    useRef<VizijAssetBundle>(effectiveAssetBundle);
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
  const suppressNextBundlePlanRef = useRef(false);
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
    latestEffectiveAssetBundleRef.current = effectiveAssetBundle;
  }, [effectiveAssetBundle]);

  useEffect(() => {
    if (suppressNextBundlePlanRef.current) {
      suppressNextBundlePlanRef.current = false;
      previousBundleRef.current = effectiveAssetBundle;
      return;
    }
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

  // The engine: one Arora device per provider, its behavior the composed
  // Vizij graph. The slot dedupes creation and carries the store across
  // graph recompositions (see engine/aroraEngine.ts).
  const deviceSlotRef = useRef<DeviceSlot | null>(null);
  if (!deviceSlotRef.current) {
    deviceSlotRef.current = new DeviceSlot();
  }
  const deviceSlot = deviceSlotRef.current;
  const [ready, setReady] = useState(false);
  /**
   * Specs currently composed into the device's ONE graph, in evaluation order.
   * Every (un)registration recomposes and restarts the device. Where each
   * source comes from:
   *
   * - **rig** — the loaded asset bundle's rig graph (authored into the GLB):
   *   maps rig input paths to the face's morph/bone/material writes.
   * - **pose** — the bundle's pose-driver graph (`assetBundle.pose.graph`, or
   *   the `pose-driver`/`pose` graph picked from the bundle): turns high-level
   *   pose controls into rig-input writes. When both rig and pose are present
   *   they register as one merged source (`registerMergedGraph`).
   * - **one source per playing program** (`playProgram`): procedural graphs
   *   from the bundle's `programs`, plus the authoring motiongraph — the
   *   editor publishes its graph as a program so it evaluates on the device.
   *
   * Bundle `animations` are NOT composed here: clips still tick in the JS
   * clip pipeline (`advanceAnimations`) and only their computed values enter
   * the device as inputs — moving them into the device is VIZ-61.
   */
  const graphSourcesRef = useRef<GraphSource[]>([]);

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

  const runtimeDebugInstanceIdRef = useRef(
    `vizij-runtime:${runtimeDebugInstanceSequence++}`,
  );
  const errorsRef = useRef<RuntimeError[]>([]);
  // namespaced output paths exposed via status
  const outputPathsRef = useRef<Set<string>>(new Set());
  // base (unnamespaced) output paths used for renderer/world mapping
  const baseOutputPathsRef = useRef<Set<string>>(new Set());
  const namespacedOutputPathsRef = useRef<Set<string>>(new Set());
  const namespaceRef = useRef(namespace);
  const driveRuntimeRef = useRef(driveRuntime);
  const rigInputMapRef = useRef<Record<string, string>>({});
  const rigPoseControlInputIdsRef = useRef<Set<string>>(new Set());
  const registeredGraphsRef = useRef<string[]>([]);
  const registeredAnimationsRef = useRef<string[]>([]);
  const mergedGraphRef = useRef<string | null>(null);
  const poseControlBridgeValuesRef = useRef<Map<string, number>>(new Map());
  const poseWeightFallbackMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    const poseConfig = assetBundle.pose?.config;
    if (!poseConfig) {
      return map;
    }
    const posePaths = buildPoseWeightPathMap(
      poseConfig.poses ?? [],
      poseConfig.faceId ?? faceId ?? "face",
    );
    (poseConfig.poses ?? []).forEach((pose) => {
      const posePath = posePaths.get(pose.id);
      if (!posePath) {
        return;
      }
      const values = Object.fromEntries(
        Object.entries(pose.values ?? {}).filter(([, value]) =>
          Number.isFinite(value),
        ),
      ) as Record<string, number>;
      map.set(posePath, values);
    });
    return map;
  }, [assetBundle.pose?.config, faceId]);
  const useLegacyPoseWeightFallback = useMemo(
    () => shouldUseLegacyPoseWeightFallback(Boolean(assetBundle.pose?.graph)),
    [assetBundle.pose?.graph],
  );
  const resolvedProgramAssets = useMemo(
    () =>
      assetBundle.programs && assetBundle.programs.length > 0
        ? assetBundle.programs
        : convertBundlePrograms(assetBundle.bundle?.graphs),
    [assetBundle.bundle?.graphs, assetBundle.programs],
  );
  const [inputConstraints, setInputConstraints] = useState<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const inputConstraintsRef = useRef<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const avgStepDtRef = useRef<number | null>(null);
  const inputDriverIdsRef = useRef<Set<string>>(new Set());

  const animationTweensRef = useRef<Map<string, AnimationState>>(new Map());
  const clipPlaybackRef = useRef<Map<string, ClipPlaybackState>>(new Map());
  const programPlaybackRef = useRef<Map<string, ProgramTransportState>>(
    new Map(),
  );
  const programControllerIdsRef = useRef<Map<string, string>>(new Map());
  const clipOutputValuesRef = useRef<Map<string, Map<string, number>>>(
    new Map(),
  );
  const clipAggregateValuesRef = useRef<Map<string, number>>(new Map());
  const animationSystemActiveRef = useRef(true);
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

  const publishRuntimeDebugState = useCallback(() => {
    const storeState = store.getState();
    setRuntimeDebugState(runtimeDebugInstanceIdRef.current, {
      namespace,
      faceId: faceId ?? null,
      rootId: status.rootId,
      ready: status.ready,
      loading: status.loading,
      autostart,
      driveRuntime,
      loopMode,
      outputCount: status.outputPaths.length,
      graphControllerCount: status.controllers.graphs.length,
      animationControllerCount: status.controllers.anims.length,
      registeredGraphCount: registeredGraphsRef.current.length,
      registeredAnimationCount: registeredAnimationsRef.current.length,
      programControllerCount: programControllerIdsRef.current.size,
      animationTweenCount: animationTweensRef.current.size,
      clipPlaybackCount: clipPlaybackRef.current.size,
      programPlaybackCount: programPlaybackRef.current.size,
      stagedInputCount: stagedInputsRef.current.size,
      activeDriverCount: inputDriverIdsRef.current.size,
      worldEntryCount: Object.keys(storeState.world ?? {}).length,
      animatableCount: Object.keys(storeState.animatables ?? {}).length,
      valuesSize:
        storeState.values instanceof Map ? storeState.values.size : null,
      stepHz: status.stepHz ?? null,
    });
  }, [
    autostart,
    driveRuntime,
    faceId,
    loopMode,
    namespace,
    status.controllers.anims.length,
    status.controllers.graphs.length,
    status.loading,
    status.outputPaths.length,
    status.ready,
    status.rootId,
    status.stepHz,
    store,
  ]);

  useEffect(() => {
    publishRuntimeDebugState();
    const unsubscribe = store.subscribe(() => {
      publishRuntimeDebugState();
    });
    return () => {
      unsubscribe();
      clearRuntimeDebugState(runtimeDebugInstanceIdRef.current);
    };
  }, [publishRuntimeDebugState, store]);

  useEffect(() => {
    const rigAsset = assetBundle.rig;
    if (!rigAsset) {
      inputConstraintsRef.current = {};
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
    inputConstraintsRef.current = constraints;
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
    if (animationTweensRef.current.size > 0) {
      return true;
    }
    if (!animationSystemActiveRef.current) {
      for (const state of programPlaybackRef.current.values()) {
        if (state.state === "playing") {
          return true;
        }
      }
      return false;
    }
    for (const state of clipPlaybackRef.current.values()) {
      if (state.playing) {
        return true;
      }
    }
    for (const state of programPlaybackRef.current.values()) {
      if (state.state === "playing") {
        return true;
      }
    }
    return false;
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
      const numericValue = valueAsNumber(value);
      const basePath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const poseValues =
        useLegacyPoseWeightFallback && numericValue != null
          ? poseWeightFallbackMap.get(basePath)
          : undefined;
      if (poseValues && numericValue != null) {
        const poseFaceId = assetBundle.pose?.config?.faceId ?? faceId ?? "face";
        const rigMap = rigInputMapRef.current;
        Object.entries(poseValues).forEach(([inputId, poseValue]) => {
          if (!Number.isFinite(poseValue)) {
            return;
          }
          const controlPath =
            resolvePoseControlInputPath({
              inputId,
              basePath: buildRigInputPath(
                poseFaceId,
                `/pose/control/${inputId}`,
              ),
              rigInputPathMap: rigMap,
              hasNativePoseControlInput: true,
            }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
          setInput(controlPath, { float: Number(poseValue) * numericValue });
        });
        return;
      }
      markActivity();
      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      if (
        isRuntimeDebugEnabled() &&
        (namespacedPath.includes("animation/authoring.timeline.main") ||
          namespacedPath.endsWith("/blink"))
      ) {
        console.log("[vizij-runtime] stage input", {
          path,
          namespacedPath,
          value,
        });
      }
      stagedInputsRef.current.set(namespacedPath, { value, shape });
    },
    [
      assetBundle.pose?.config?.faceId,
      faceId,
      markActivity,
      poseWeightFallbackMap,
      useLegacyPoseWeightFallback,
    ],
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

  // ---------------------------------------------------------------------------
  // The engine surface, device-backed. The call shapes (synchronous
  // registration returning ids, snapshot getters) are implemented over the
  // single Arora device: registered
  // graphs accumulate as sources in graphSourcesRef, and every registration
  // change recomposes the one graph and restarts the device, carrying the
  // store across (engine/aroraEngine.ts). Animations register as ids only —
  // playback is the JS clip pipeline writing inputs like any other caller.
  // ---------------------------------------------------------------------------

  /** Writes made before the device is live, replayed when it boots. */
  const pendingWritesRef = useRef<Map<string, ValueJSON>>(new Map());
  /** Applies a step's drained store changes to the render store; bound below. */
  const applyEngineChangesRef = useRef<
    (changes: Record<string, ValueJSON | null>) => void
  >(() => {});

  const recomposeDevice = useCallback(() => {
    const spec = composeGraphSpecs(graphSourcesRef.current);
    deviceSlot
      .restart(spec)
      .then((handle) => {
        if (pendingWritesRef.current.size > 0) {
          handle.device.writeValues(
            Object.fromEntries(pendingWritesRef.current),
          );
          pendingWritesRef.current.clear();
        }
      })
      .catch((err: unknown) => {
        pushError({
          message: "Failed to (re)start the arora device",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
  }, [deviceSlot, pushError]);

  /** `ready` = wasm loaded; the device itself boots on first registration. */
  const initEngine = useCallback(async () => {
    await ensureWasmInit();
    setReady(true);
  }, []);

  const removeGraph = useCallback(
    (id: ControllerId) => {
      graphSourcesRef.current = graphSourcesRef.current.filter(
        (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
      );
      recomposeDevice();
    },
    [recomposeDevice],
  );

  const registerGraph = useCallback(
    (cfg: GraphRegistrationConfig): string => {
      const id = cfg.id ?? `graph-${graphSourcesRef.current.length}`;
      graphSourcesRef.current = [
        ...graphSourcesRef.current.filter((s) => s.sourceId !== id),
        { sourceId: id, spec: cfg.spec ?? {} },
      ];
      recomposeDevice();
      return id;
    },
    [recomposeDevice],
  );

  /**
   * A merged registration becomes one source per member graph under the
   * merged id (`id#member`); composition is last-writer-wins, so `strategy`
   * is accepted but unused (see utils/composeGraph.ts).
   */
  const registerMergedGraph = useCallback(
    (cfg: {
      id?: string;
      graphs: GraphRegistrationConfig[];
      strategy?: MergeStrategyOptions;
    }): string => {
      const id = cfg.id ?? `merged-${graphSourcesRef.current.length}`;
      const members = cfg.graphs.map((graph, index) => ({
        sourceId: `${id}#${graph.id ?? index}`,
        spec: graph.spec ?? {},
      }));
      graphSourcesRef.current = [
        ...graphSourcesRef.current.filter(
          (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
        ),
        ...members,
      ];
      recomposeDevice();
      return id;
    },
    [recomposeDevice],
  );

  /** Animations are ids only: the JS clip pipeline is the playback engine. */
  const registerAnimation = useCallback(
    (cfg: AnimationRegistrationConfig): string =>
      cfg.id ?? `animation-${registeredAnimationsRef.current.length}`,
    [],
  );

  const removeAnimation = useCallback((_id: ControllerId) => {}, []);

  const listControllers = useCallback(
    (): { graphs: ControllerId[]; anims: ControllerId[] } => ({
      graphs: [...registeredGraphsRef.current],
      anims: [...registeredAnimationsRef.current],
    }),
    [],
  );

  const deviceSetInput = useCallback(
    (path: string, value: ValueJSON, _shape?: ShapeJSON) => {
      const handle = deviceSlot.current;
      if (handle) {
        handle.device.setValue(path, value);
      } else {
        pendingWritesRef.current.set(path, value);
      }
    },
    [deviceSlot],
  );

  /**
   * The device store has no key removal through this surface; clearing an
   * input means writing its neutral value so the graph stops acting on it.
   * The neutral is the input's declared default from `inputConstraints`; with
   * no declared default we fall back to `{ float: 0 }`.
   */
  const removeInput = useCallback(
    (path: string) => {
      pendingWritesRef.current.delete(path);
      const neutral = resolveConstraintDefault(
        path,
        namespaceRef.current,
        inputConstraintsRef.current,
      );
      const value: ValueJSON =
        neutral !== undefined ? { float: neutral } : { float: 0 };
      deviceSlot.current?.device.setValue(path, value);
    },
    [deviceSlot],
  );

  const getPathSnapshot = useCallback(
    (path: string): ValueJSON | undefined => {
      const handle = deviceSlot.current;
      if (!handle) {
        return pendingWritesRef.current.get(path);
      }
      return handle.device.readValues([path])[path] ?? undefined;
    },
    [deviceSlot],
  );

  /** Listeners notified after each engine step's changes have been applied. */
  const stepListenersRef = useRef<Set<() => void>>(new Set());

  const subscribeToStep = useCallback((listener: () => void) => {
    const listeners = stepListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  /**
   * One tick: step the device (dt seconds → ms at exactly this boundary),
   * then pull the changed keys and apply them to the render store. The
   * push-model frame subscription this replaces re-rendered the provider
   * every step; the pull model renders only what the changes touch —
   * step-aligned consumers subscribe through `subscribeToStep` and read
   * the values they care about via `getValueSnapshot`.
   */
  const stepRuntime = useCallback(
    (dt: number) => {
      const handle = deviceSlot.current;
      if (!handle) {
        return;
      }
      handle.device.step(dt * 1000);
      applyEngineChangesRef.current(handle.device.drainChanges());
      stepListenersRef.current.forEach((listener) => {
        try {
          listener();
        } catch (err) {
          console.error("[vizij-runtime] step listener error", err);
        }
      });
    },
    [deviceSlot],
  );

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
    programControllerIdsRef.current.clear();
    mergedGraphRef.current = null;
    outputPathsRef.current = new Set();
    baseOutputPathsRef.current = new Set();
    namespacedOutputPathsRef.current = new Set();
    rigPoseControlInputIdsRef.current = new Set();
    clipOutputValuesRef.current.clear();
    clipAggregateValuesRef.current.clear();
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
    driveRuntimeRef.current = driveRuntime;
  }, [driveRuntime]);

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

        // Clear the initial reloadAssets flag so the status.rootId dep
        // change doesn't re-trigger a full reload (infinite-loop guard).
        if (pendingPlanRef.current?.reloadAssets) {
          pendingPlanRef.current = {
            ...pendingPlanRef.current,
            reloadAssets: false,
          };
        }

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
      initEngine().catch((err: unknown) => {
        pushError({
          message: "Failed to initialize the engine",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
    }
  }, [ready, autoCreate, initEngine, pushError]);

  const registerControllers = useCallback(async () => {
    clearControllers();

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registerControllers", {
        hasRig: Boolean(assetBundle.rig),
        hasPose: Boolean(assetBundle.pose?.graph),
        animationCount: assetBundle.animations?.length ?? 0,
        animationIds: (assetBundle.animations ?? []).map((anim) => anim.id),
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
    rigPoseControlInputIdsRef.current = new Set();
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
        const rigPoseControlInputIds = new Set<string>();
        rigInputs.forEach((path) => {
          const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
            path.trim(),
          );
          const inputId = (poseControlMatch?.[1] ?? "").trim();
          if (inputId.length > 0) {
            rigPoseControlInputIds.add(inputId);
          }
        });
        rigInputMapRef.current = collectInputPathMap(rigSpec);
        rigPoseControlInputIdsRef.current = rigPoseControlInputIds;
        if (isRuntimeDebugEnabled()) {
          const blinkKeys = Object.keys(rigInputMapRef.current).filter((key) =>
            key.toLowerCase().includes("blink"),
          );
          const blinkMappings = blinkKeys
            .slice(0, 20)
            .map((key) => `${key} => ${rigInputMapRef.current[key] ?? "?"}`);
          console.log("[vizij-runtime] rig input map sample", {
            blink: rigInputMapRef.current["blink"] ?? null,
            blinkKeys: blinkKeys.slice(0, 12),
            blinkMappings: blinkMappings.join(" | "),
          });
        }
        recordOutputs(rigOutputs);

        const rigSubs = rigAsset.subscriptions ?? {
          inputs: rigInputs,
          outputs: rigOutputs,
        };

        // Source "rig": the bundle's rig graph (from the GLB) — rig input
        // paths → the face's morph/bone/material writes.
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

        // Source "pose": the bundle's pose-driver graph — high-level pose
        // controls → rig-input writes (read back by the rig source above via
        // the shared store paths).
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

    for (const animation of assetBundle.animations ?? []) {
      const bridgeOutputs = collectAnimationClipOutputPaths(
        animation.clip as AnimationClipLike,
        faceId ?? undefined,
        rigInputMapRef.current,
      );
      if (isRuntimeDebugEnabled()) {
        console.log("[vizij-runtime] animation output routing", {
          animationId: animation.id,
          bridgeOutputs,
          bridgeOutputsText: bridgeOutputs.join(" | "),
        });
      }
      recordOutputs(bridgeOutputs);
    }

    for (const program of resolvedProgramAssets) {
      const programSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (outputs)`,
      );
      if (!programSpec) {
        continue;
      }
      recordOutputs(collectOutputPaths(programSpec));
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
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registered graph ids", graphIds);
    }

    const animationIds: string[] = [];
    for (const anim of assetBundle.animations ?? []) {
      try {
        const controllerId =
          namespaceControllerId(anim.id, namespace, "animation") ?? anim.id;
        const animationPayload =
          anim.setup?.animation ??
          toStoredAnimationClip(anim.id, anim.clip as AnimationClipLike);
        const config: AnimationRegistrationConfig = {
          id: controllerId,
          setup: {
            ...(anim.setup ?? {}),
            animation: animationPayload,
          } as AnimationRegistrationConfig["setup"],
        };
        const id = registerAnimation(config);
        animationIds.push(id);
      } catch (err: unknown) {
        if (isRuntimeDebugEnabled()) {
          console.warn("[vizij-runtime] failed animation registration", {
            animationId: anim.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
    if (isRuntimeDebugEnabled()) {
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
    resolvedProgramAssets,
    setInput,
  ]);

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    const plan = pendingPlanRef.current;
    const hasRegistered =
      registeredGraphsRef.current.length > 0 ||
      registeredAnimationsRef.current.length > 0 ||
      programControllerIdsRef.current.size > 0;
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
    // Bound into a ref so stepRuntime (defined above) can pull each tick's
    // drained store changes straight through without a React render per step.
    applyEngineChangesRef.current = (changes) => {
      const entries = Object.entries(changes);
      if (!entries.length) {
        return;
      }
      const setWorldValues = store.getState().setValues;
      const namespaceValue = status.namespace;
      const currentValues = store.getState().values;
      const rigInputPathMap = rigInputMapRef.current;
      const rigPoseControlInputIds = rigPoseControlInputIdsRef.current;
      const batched: Array<{ id: string; namespace: string; value: RawValue }> =
        [];
      const namespacedOutputs = namespacedOutputPathsRef.current;
      const baseOutputs = baseOutputPathsRef.current;
      entries.forEach(([changedPath, changedValue]) => {
        // Cleared keys don't render; the runtime's clock keys never do.
        if (changedValue === null || isGoldenPath(changedPath)) {
          return;
        }
        const path = normalisePath(changedPath);
        const basePath = stripNamespace(path, namespaceValue);
        const isTrackedOutput =
          namespacedOutputs.has(path) || baseOutputs.has(basePath);
        if (!isTrackedOutput) {
          return;
        }
        const raw = valueJSONToRaw(changedValue);
        if (raw === undefined) {
          return;
        }
        const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
          basePath,
        );
        if (
          poseControlMatch &&
          typeof raw === "number" &&
          Number.isFinite(raw)
        ) {
          const inputId = (poseControlMatch[1] ?? "").trim();
          const hasNativePoseControlInput =
            inputId.length > 0 && rigPoseControlInputIds.has(inputId);
          // Merged graphs do not automatically recycle pose-driver outputs into
          // sibling rig inputs, so native pose-control channels still need to be
          // restaged as runtime inputs on the next frame. Prefer explicit rig
          // input mappings first, then fall back to the native pose-control path.
          const mappedInputPath =
            inputId.length === 0
              ? undefined
              : resolvePoseControlInputPath({
                  inputId,
                  basePath,
                  rigInputPathMap,
                  hasNativePoseControlInput,
                });
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
    };
  }, [status.namespace, store, transformOutputWrite]);

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

  const resolveClipById = useCallback(
    (id: string): VizijAnimationAsset | undefined => {
      return assetBundle.animations?.find((anim) => anim.id === id);
    },
    [assetBundle.animations],
  );

  const resolveClipPromise = useCallback((state: ClipPlaybackState) => {
    state.resolve?.();
    state.resolve = null;
    state.completion = null;
  }, []);

  const ensureClipPromise = useCallback((state: ClipPlaybackState) => {
    if (state.completion) {
      return state.completion;
    }
    const completion = new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
    state.completion = completion;
    return completion;
  }, []);

  const setAnimationInput = useCallback(
    (path: string, value: number, options?: { immediate?: boolean }) => {
      setInput(path, { float: value });
      if (!options?.immediate) {
        return;
      }
      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      const staged = stagedInputsRef.current.get(namespacedPath);
      if (staged) {
        deviceSetInput(namespacedPath, staged.value, staged.shape);
        stagedInputsRef.current.delete(namespacedPath);
        return;
      }
      deviceSetInput(namespacedPath, { float: value });
    },
    [deviceSetInput, setInput],
  );

  const clearAnimationInput = useCallback(
    (path: string) => {
      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      stagedInputsRef.current.delete(namespacedPath);
      removeInput(namespacedPath);
    },
    [removeInput],
  );

  const buildClipOutputValues = useCallback(
    (
      clip: VizijAnimationAsset,
      state: ClipPlaybackState,
    ): Map<string, number> =>
      sampleAnimationClipOutputValues(
        clip.clip as AnimationClipLike,
        state.time,
        state.weight,
        faceId ?? undefined,
        rigInputMapRef.current,
      ),
    [faceId],
  );

  const computeClipAggregateValues = useCallback((): Map<string, number> => {
    const aggregate = new Map<string, number>();
    clipOutputValuesRef.current.forEach((outputValues) => {
      outputValues.forEach((value, path) => {
        aggregate.set(path, (aggregate.get(path) ?? 0) + value);
      });
    });
    return aggregate;
  }, []);

  const stageClipAggregateValues = useCallback(
    (nextAggregate: Map<string, number>, options?: { immediate?: boolean }) => {
      diffAnimationAggregateValues(
        clipAggregateValuesRef.current,
        nextAggregate,
        POSE_CONTROL_BRIDGE_EPSILON,
      ).forEach((operation) => {
        if (operation.kind === "clear") {
          clearAnimationInput(operation.path);
          return;
        }
        setAnimationInput(operation.path, operation.value, options);
      });

      clipAggregateValuesRef.current = nextAggregate;
    },
    [clearAnimationInput, setAnimationInput],
  );

  const syncClipOutputs = useCallback(
    (options?: { immediate?: boolean }) => {
      stageClipAggregateValues(computeClipAggregateValues(), options);
    },
    [computeClipAggregateValues, stageClipAggregateValues],
  );

  const writeClipOutputs = useCallback(
    (
      clip: VizijAnimationAsset,
      state: ClipPlaybackState,
      options?: { immediate?: boolean },
    ) => {
      if (!animationSystemActiveRef.current) {
        return;
      }
      clipOutputValuesRef.current.set(
        clip.id,
        buildClipOutputValues(clip, state),
      );
      syncClipOutputs(options);
    },
    [buildClipOutputValues, syncClipOutputs],
  );

  const clearClipOutputs = useCallback(
    (clipId: string, options?: { immediate?: boolean }) => {
      if (!clipOutputValuesRef.current.has(clipId)) {
        return;
      }
      clipOutputValuesRef.current.delete(clipId);
      syncClipOutputs(options);
    },
    [syncClipOutputs],
  );

  const createClipPlaybackState = useCallback(
    (clip: VizijAnimationAsset): ClipPlaybackState => {
      const duration = resolveClipDurationSeconds(
        clip.clip as AnimationClipLike,
      );
      return {
        id: clip.id,
        time: 0,
        duration,
        speed: 1,
        weight: Number.isFinite(clip.weight) ? Number(clip.weight) : 1,
        loop: false,
        playing: false,
        resolve: null,
        completion: null,
      };
    },
    [],
  );

  const ensureClipPlaybackState = useCallback(
    (
      id: string,
    ): { clip: VizijAnimationAsset; state: ClipPlaybackState } | null => {
      const clip = resolveClipById(id);
      if (!clip) {
        return null;
      }
      const existing = clipPlaybackRef.current.get(id);
      if (existing) {
        existing.duration = resolveClipDurationSeconds(
          clip.clip as AnimationClipLike,
          existing.duration,
        );
        existing.time = clampAnimationTime(existing.time, existing.duration);
        return { clip, state: existing };
      }
      const next = createClipPlaybackState(clip);
      clipPlaybackRef.current.set(id, next);
      return { clip, state: next };
    },
    [createClipPlaybackState, resolveClipById],
  );

  const advanceClipPlayback = useCallback(
    (dt: number) => {
      if (clipPlaybackRef.current.size === 0) {
        return;
      }
      const toDelete: string[] = [];
      clipPlaybackRef.current.forEach((state, key) => {
        const clip = resolveClipById(state.id);
        if (!clip) {
          toDelete.push(key);
          resolveClipPromise(state);
          return;
        }

        state.duration = resolveClipDurationSeconds(
          clip.clip as AnimationClipLike,
          state.duration,
        );

        const { time, completed } = advanceClipTime(
          {
            time: state.time,
            duration: state.duration,
            speed: state.speed,
            loop: state.loop,
            playing: state.playing,
          },
          dt,
        );
        state.time = clampAnimationTime(time, state.duration);

        if (state.playing || completed) {
          writeClipOutputs(clip, state);
        }

        if (completed) {
          toDelete.push(key);
          resolveClipPromise(state);
        }
      });

      toDelete.forEach((key) => {
        clipPlaybackRef.current.delete(key);
        if (animationSystemActiveRef.current) {
          clearClipOutputs(key);
        }
      });
    },
    [clearClipOutputs, resolveClipById, resolveClipPromise, writeClipOutputs],
  );

  const animateValue = useCallback(
    (
      path: string,
      target: ValueJSON,
      options?: AnimateValueOptions,
    ): Promise<void> => {
      const targetValue = valueAsNumber(target);
      const basePath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const poseValues =
        useLegacyPoseWeightFallback && targetValue != null
          ? poseWeightFallbackMap.get(basePath)
          : undefined;
      if (poseValues && targetValue != null) {
        const poseFaceId = assetBundle.pose?.config?.faceId ?? faceId ?? "face";
        const rigMap = rigInputMapRef.current;
        return Promise.all(
          Object.entries(poseValues).flatMap(([inputId, poseValue]) => {
            if (!Number.isFinite(poseValue)) {
              return [];
            }
            const controlPath =
              resolvePoseControlInputPath({
                inputId,
                basePath: buildRigInputPath(
                  poseFaceId,
                  `/pose/control/${inputId}`,
                ),
                rigInputPathMap: rigMap,
                hasNativePoseControlInput: true,
              }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
            return [
              animateValue(
                controlPath,
                { float: Number(poseValue) * targetValue },
                options,
              ),
            ];
          }),
        ).then(() => undefined);
      }
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
          // Keep the raw path here so tween updates go through setInput() once
          // and pick up the active namespace exactly once.
          path,
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
    [
      assetBundle.pose?.config?.faceId,
      cancelAnimation,
      faceId,
      getPathSnapshot,
      markActivity,
      poseWeightFallbackMap,
      setInput,
      useLegacyPoseWeightFallback,
    ],
  );

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      const { clip, state } = ensured;
      const shouldReset = options?.reset === true;
      if (shouldReset) {
        resolveClipPromise(state);
        state.time = 0;
      }
      const speed = options?.speed ?? state.speed ?? 1;
      const weight = options?.weight ?? state.weight ?? clip.weight ?? 1;
      state.speed = Number.isFinite(speed) && speed > 0 ? speed : 1;
      state.weight = Number.isFinite(weight) ? Number(weight) : 1;
      state.duration = resolveClipDurationSeconds(
        clip.clip as AnimationClipLike,
        state.duration,
      );
      state.time = clampAnimationTime(state.time, state.duration);
      state.playing = true;

      const completion = ensureClipPromise(state);
      clipPlaybackRef.current.set(id, state);
      writeClipOutputs(clip, state);
      markActivity();
      return completion;
    },
    [
      ensureClipPlaybackState,
      ensureClipPromise,
      markActivity,
      resolveClipPromise,
      writeClipOutputs,
    ],
  );

  const pauseAnimation = useCallback(
    (id: string) => {
      const state = clipPlaybackRef.current.get(id);
      if (!state || !state.playing) {
        return;
      }
      state.playing = false;
      updateLoopMode();
    },
    [updateLoopMode],
  );

  const seekAnimation = useCallback(
    (id: string, timeSeconds: number) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      const { clip, state } = ensured;
      state.time = clampAnimationTime(timeSeconds, state.duration);
      clipPlaybackRef.current.set(id, state);
      writeClipOutputs(clip, state, { immediate: true });
    },
    [ensureClipPlaybackState, writeClipOutputs],
  );

  const setAnimationLoop = useCallback(
    (id: string, enabled: boolean) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      ensured.state.loop = Boolean(enabled);
      clipPlaybackRef.current.set(id, ensured.state);
      updateLoopMode();
    },
    [ensureClipPlaybackState, updateLoopMode],
  );

  const getAnimationState = useCallback(
    (id: string): AnimationPlaybackState | null => {
      const state = clipPlaybackRef.current.get(id);
      if (!state) {
        return null;
      }
      return {
        time: state.time,
        duration: state.duration,
        playing: state.playing,
        loop: state.loop,
        speed: state.speed,
      };
    },
    [],
  );

  const stopAnimation = useCallback(
    (id: string, options?: StopAnimationOptions) => {
      const state = clipPlaybackRef.current.get(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.playing = false;
        resolveClipPromise(state);
      }
      if (options?.clearOutputs !== false) {
        clearClipOutputs(id);
      }
      updateLoopMode();
    },
    [clearClipOutputs, resolveClipPromise, updateLoopMode],
  );

  const refreshControllerStatus = useCallback(() => {
    const controllers = listControllers();
    reportStatus((prev) => ({
      ...prev,
      controllers,
      outputPaths: Array.from(outputPathsRef.current),
    }));
    onRegisterControllers?.(controllers);
  }, [listControllers, onRegisterControllers, reportStatus]);

  const resolveProgramById = useCallback(
    (id: string): VizijProgramAsset | undefined => {
      return resolvedProgramAssets.find((program) => program.id === id);
    },
    [resolvedProgramAssets],
  );

  const buildProgramRegistrationConfig = useCallback(
    (program: VizijProgramAsset): GraphRegistrationConfig | null => {
      const graphSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph`,
      );
      if (!graphSpec) {
        return null;
      }
      const outputs = collectOutputPaths(graphSpec);
      const inputs = collectInputPaths(graphSpec);
      const subs = program.graph.subscriptions ?? {
        inputs,
        outputs,
      };
      return {
        id: namespaceControllerId(program.id, namespace, "graph"),
        spec: stripNulls(namespaceGraphSpec(graphSpec, namespace)),
        subs: namespaceSubscriptions(subs, namespace),
      };
    },
    [namespace],
  );

  const deriveProgramResetValues = useCallback(
    (program: VizijProgramAsset): Array<{ path: string; value: number }> => {
      if (program.resetValues) {
        return Object.entries(program.resetValues)
          .filter(([, value]) => Number.isFinite(value))
          .map(([path, value]) => ({ path, value }));
      }

      const graphSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (reset)`,
      );
      if (!graphSpec) {
        return [];
      }

      return collectOutputPaths(graphSpec)
        .filter((path) => path.trim().length > 0)
        .map((path) => {
          const defaultValue =
            inputConstraintsRef.current[path]?.defaultValue ?? 0;
          return {
            path,
            value:
              Number.isFinite(defaultValue) && defaultValue != null
                ? defaultValue
                : 0,
          };
        });
    },
    [],
  );

  const syncProgramPlaybackControllers = useCallback(() => {
    if (!ready) {
      return;
    }

    const availableProgramIds = new Set(
      resolvedProgramAssets.map((program) => program.id),
    );

    Array.from(programPlaybackRef.current.keys()).forEach((id) => {
      if (availableProgramIds.has(id)) {
        return;
      }
      programPlaybackRef.current.delete(id);
      const controllerId = programControllerIdsRef.current.get(id);
      if (controllerId) {
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to remove program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
      }
    });

    programPlaybackRef.current.forEach((state, id) => {
      const program = resolveProgramById(id);
      const controllerId = programControllerIdsRef.current.get(id);

      if (!program) {
        return;
      }

      if (state.state !== "playing") {
        if (!controllerId) {
          return;
        }
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to pause program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
        return;
      }

      if (controllerId) {
        return;
      }

      // Source per playing program: bundle `programs` (procedural graphs
      // started via the transport) and the authoring motiongraph, which
      // publishes the editor's graph as a program.
      const config = buildProgramRegistrationConfig(program);
      if (!config) {
        pushError({
          message: `Program ${id} is missing a usable graph payload.`,
          phase: "registration",
          timestamp: performance.now(),
        });
        return;
      }
      try {
        const nextControllerId = registerGraph(config);
        programControllerIdsRef.current.set(id, nextControllerId);
      } catch (err: unknown) {
        pushError({
          message: `Failed to register program ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });

    refreshControllerStatus();
  }, [
    buildProgramRegistrationConfig,
    pushError,
    ready,
    refreshControllerStatus,
    registerGraph,
    removeGraph,
    resolvedProgramAssets,
    resolveProgramById,
  ]);

  const playProgram = useCallback(
    (id: string) => {
      const program = resolveProgramById(id);
      if (!program) {
        throw new Error(
          `Program ${id} is not part of the current asset bundle.`,
        );
      }
      deriveProgramInputSeedValues({
        program,
        namespace,
        inputConstraints: inputConstraintsRef.current,
        getPathSnapshot,
        stagedInputs: stagedInputsRef.current,
      }).forEach(({ path, value }) => {
        setInput(path, value);
      });
      programPlaybackRef.current.set(id, {
        id,
        state: "playing",
      });
      syncProgramPlaybackControllers();
      markActivity();
    },
    [
      getPathSnapshot,
      markActivity,
      namespace,
      resolveProgramById,
      setInput,
      syncProgramPlaybackControllers,
    ],
  );

  const pauseProgram = useCallback(
    (id: string) => {
      if (!resolveProgramById(id)) {
        return;
      }
      programPlaybackRef.current.set(id, {
        id,
        state: "paused",
      });
      syncProgramPlaybackControllers();
      updateLoopMode();
    },
    [resolveProgramById, syncProgramPlaybackControllers, updateLoopMode],
  );

  const stopProgram = useCallback(
    (id: string, options?: StopProgramOptions) => {
      const program = resolveProgramById(id);
      const controllerId = programControllerIdsRef.current.get(id);
      if (controllerId) {
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to stop program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
      }
      programPlaybackRef.current.set(id, {
        id,
        state: "stopped",
      });
      if (program && options?.resetOutputs !== false) {
        deriveProgramResetValues(program).forEach(({ path, value }) => {
          setInput(path, { float: value });
        });
      }
      refreshControllerStatus();
      updateLoopMode();
    },
    [
      deriveProgramResetValues,
      pushError,
      refreshControllerStatus,
      removeGraph,
      resolveProgramById,
      setInput,
      updateLoopMode,
    ],
  );

  const getProgramState = useCallback(
    (id: string): ProgramPlaybackState | null => {
      const state = programPlaybackRef.current.get(id);
      if (!state) {
        return null;
      }
      return { state: state.state };
    },
    [],
  );

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    syncProgramPlaybackControllers();
  }, [
    graphUpdateToken,
    ready,
    resolvedProgramAssets,
    status.loading,
    syncProgramPlaybackControllers,
  ]);

  const setAnimationActive = useCallback(
    (active: boolean) => {
      const next = Boolean(active);
      if (animationSystemActiveRef.current === next) {
        return;
      }
      animationSystemActiveRef.current = next;
      if (!next) {
        clipPlaybackRef.current.forEach((state) => {
          state.playing = false;
        });
      }
      updateLoopMode();
    },
    [updateLoopMode],
  );

  const isAnimationActive = useCallback(
    () => animationSystemActiveRef.current,
    [],
  );

  const registerInputDriver = useCallback(
    (id: string, factory: InputDriverFactory): InputDriverLifecycle => {
      inputDriverIdsRef.current.add(id);
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
          } finally {
            inputDriverIdsRef.current.delete(id);
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
      deviceSetInput(path, value, shape);
    });
    stagedInputsRef.current.clear();
  }, [deviceSetInput]);

  const step = useCallback(
    (dt: number, opts?: { forceRuntime?: boolean }) => {
      if (dt > 0 && Number.isFinite(dt)) {
        const prev = avgStepDtRef.current ?? dt;
        const alpha = 0.1;
        avgStepDtRef.current = prev * (1 - alpha) + dt * alpha;
      }
      advanceAnimations(dt);
      flushStagedInputs();
      if (driveRuntimeRef.current || opts?.forceRuntime) {
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
      programPlaybackRef.current.clear();
      programControllerIdsRef.current.clear();
      clipOutputValuesRef.current.clear();
      clipAggregateValuesRef.current.clear();
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
      const baseAssetBundle = latestEffectiveAssetBundleRef.current;
      const nextAssetBundle = applyRuntimeGraphBundle(baseAssetBundle, bundle);

      const plan = resolveRuntimeUpdatePlan(
        baseAssetBundle,
        nextAssetBundle,
        options?.tier ?? updateTierRef.current,
      );
      pendingPlanRef.current = plan;
      previousBundleRef.current = nextAssetBundle;
      latestEffectiveAssetBundleRef.current = nextAssetBundle;
      suppressNextBundlePlanRef.current = true;
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
    [reportStatus],
  );

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      setInput,
      getValueSnapshot: getPathSnapshot,
      subscribeToStep,
      setGraphBundle,
      setValue: setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      pauseAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
      step,
      advanceAnimations,
      inputConstraints,
    }),
    [
      status,
      assetBundle,
      setInput,
      getPathSnapshot,
      subscribeToStep,
      setGraphBundle,
      setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      pauseAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
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

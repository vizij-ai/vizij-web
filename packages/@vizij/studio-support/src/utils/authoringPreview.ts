import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type {
  PoseRigConfig,
  RuntimeGraphBundle,
  VizijAnimationAsset,
  VizijProgramAsset,
} from "../types";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
  type AnimationClipIR,
} from "../types/animationClipIr";
import { clipIrToBundleAnimationEntry } from "./animationClipCompiler";
import {
  buildMotionGraphProgramAsset,
  type MotionGraphEditorEdge,
  type MotionGraphEditorNode,
} from "./motionGraphSpec";
import { buildRuntimeGraphBundle } from "./runtimeBundle";

export type AuthoringPreviewCompileStatus =
  | "idle"
  | "dirty"
  | "compiling"
  | "compiled"
  | "registered"
  | "runtime-error";

export type AuthoringPreviewTarget =
  | "runtime-graph"
  | "animation"
  | "motiongraph";

export interface AuthoringCompileTargetStateLike {
  status: AuthoringPreviewCompileStatus;
  message?: string | null;
  signature?: string | null;
}

export interface AuthoringPreviewCompileState
  extends AuthoringCompileTargetStateLike {
  target: AuthoringPreviewTarget;
}

export interface AuthoringPreviewUpdateSource {
  key: AuthoringPreviewTarget;
  signature: string;
}

export interface AuthoringRuntimeErrorSourceLike {
  key?: string | null;
  signature?: string | null;
}

const AUTHORING_PREVIEW_TARGET_KEYS = new Set<AuthoringPreviewTarget>([
  "runtime-graph",
  "animation",
  "motiongraph",
]);

export function parseAuthoringPreviewTarget(
  value: string | null | undefined,
): AuthoringPreviewTarget | null {
  return AUTHORING_PREVIEW_TARGET_KEYS.has(value as AuthoringPreviewTarget)
    ? (value as AuthoringPreviewTarget)
    : null;
}

export function resolveAuthoringRuntimeErrorStates({
  sources,
  fallbackTarget = null,
  fallbackSignature = null,
  message,
}: {
  sources?: readonly AuthoringRuntimeErrorSourceLike[] | null;
  fallbackTarget?: AuthoringPreviewTarget | null;
  fallbackSignature?: string | null;
  message: string;
}): AuthoringPreviewCompileState[] {
  const states = new Map<
    AuthoringPreviewTarget,
    AuthoringPreviewCompileState
  >();
  (sources ?? []).forEach((source) => {
    const target = parseAuthoringPreviewTarget(source.key);
    if (!target) {
      return;
    }
    states.set(target, {
      target,
      status: "runtime-error",
      message,
      signature: source.signature ?? null,
    });
  });

  if (states.size === 0 && fallbackTarget) {
    states.set(fallbackTarget, {
      target: fallbackTarget,
      status: "runtime-error",
      message,
      signature: fallbackSignature,
    });
  }

  return Array.from(states.values());
}

export function resolveAuthoringCompileTargetState({
  current,
  status,
  message = null,
  signature = null,
}: {
  current?: AuthoringCompileTargetStateLike | null;
  status: AuthoringPreviewCompileStatus;
  message?: string | null;
  signature?: string | null;
}): AuthoringCompileTargetStateLike {
  if (
    status === "compiled" &&
    current?.status === "registered" &&
    current.signature === signature
  ) {
    return {
      status: "registered",
      message: null,
      signature,
    };
  }

  return {
    status,
    message,
    signature,
  };
}

export interface RuntimeGraphPreviewBundleResult {
  bundle: Pick<RuntimeGraphBundle, "rig" | "pose">;
  signature: string;
  hasPayload: boolean;
}

export interface RuntimeGraphPreviewTransactionOptions {
  preview: RuntimeGraphPreviewBundleResult;
  lastPublishedSignature?: string | null;
  managedPayload: boolean;
}

export interface RuntimeGraphPreviewTransactionPlan {
  shouldPublish: boolean;
  bundle: RuntimeGraphPreviewBundleResult["bundle"];
  source: AuthoringPreviewUpdateSource;
  compilingState: AuthoringPreviewCompileState;
  compiledState: AuthoringPreviewCompileState;
  nextPublishedSignature: string | null;
  nextManagedPayload: boolean;
}

export interface AnimationPreviewBundleOptions {
  active: boolean;
  authoredClip?: AnimationClipIR | null;
  standardInputsById?: ReadonlyMap<string, StandardRigInput>;
  currentAnimations: readonly VizijAnimationAsset[];
  fallbackInheritedAnimations?: readonly VizijAnimationAsset[];
}

export interface AnimationPreviewBundleResult {
  bundle: Pick<RuntimeGraphBundle, "animations">;
  animations: VizijAnimationAsset[];
  authoredAnimation: VizijAnimationAsset | null;
  outputPaths: string[];
  signature: string;
}

export interface AnimationPreviewTransactionOptions {
  preview: AnimationPreviewBundleResult;
  currentSignature: string;
  lastCurrentSignature?: string | null;
  appliedSignature?: string | null;
  dirtyMessage?: string | null;
}

export interface AnimationPreviewTransactionPlan {
  converged: boolean;
  shouldPublish: boolean;
  bundle: AnimationPreviewBundleResult["bundle"];
  source: AuthoringPreviewUpdateSource;
  dirtyState: AuthoringPreviewCompileState | null;
  compilingState: AuthoringPreviewCompileState;
  compiledState: AuthoringPreviewCompileState;
  nextLastCurrentSignature: string;
  nextAppliedSignature: string | null;
}

export interface MotionGraphRuntimeResetEntry {
  path: string;
  value: number;
}

export interface MotionGraphPreviewBundleOptions {
  controllerId?: string | null;
  nodes?: MotionGraphEditorNode[] | null;
  edges?: MotionGraphEditorEdge[] | null;
  resetValues?: readonly MotionGraphRuntimeResetEntry[];
  currentPrograms: readonly VizijProgramAsset[];
  previousManagedProgramId?: string | null;
}

export interface MotionGraphPreviewBundleResult {
  bundle: Pick<RuntimeGraphBundle, "programs">;
  programs: VizijProgramAsset[];
  programAsset: VizijProgramAsset | null;
  managedProgramId: string | null;
  signature: string;
}

export interface MotionGraphPreviewTransactionOptions {
  preview: MotionGraphPreviewBundleResult;
  currentSignature: string;
  lastCurrentSignature?: string | null;
  appliedSignature?: string | null;
  touchedProgramBundle: boolean;
}

export interface MotionGraphPreviewTransactionPlan {
  converged: boolean;
  shouldPublish: boolean;
  bundle: MotionGraphPreviewBundleResult["bundle"];
  source: AuthoringPreviewUpdateSource;
  compilingState: AuthoringPreviewCompileState;
  compiledState: AuthoringPreviewCompileState;
  nextLastCurrentSignature: string;
  nextAppliedSignature: string | null;
  nextTouchedProgramBundle: boolean;
  shouldClearManagedProgramId: boolean;
}

function resolveStandardInputForRuntimePath(
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>,
  rawPath: string,
): StandardRigInput | null {
  const normalizedPath = normalizeStandardRigInputPath(rawPath);
  return (
    standardInputsByPath.get(normalizedPath) ??
    standardInputsByPath.get(normalizedPath.replace(/^\/rig\/[^/]+\//, "/")) ??
    null
  );
}

export function buildMotionGraphResetValuesForOutputs(
  outputPaths: Iterable<string>,
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>,
  preservedResetValues?: Record<string, number> | null,
): Record<string, number> {
  return Object.fromEntries(
    Array.from(new Set(outputPaths))
      .sort((left, right) => left.localeCompare(right))
      .map((path) => {
        const preserved = preservedResetValues?.[path];
        if (typeof preserved === "number" && Number.isFinite(preserved)) {
          return [path, preserved];
        }
        const input = resolveStandardInputForRuntimePath(
          standardInputsByPath,
          path,
        );
        const defaultValue = input?.defaultValue;
        return [
          path,
          typeof defaultValue === "number" && Number.isFinite(defaultValue)
            ? defaultValue
            : 0,
        ];
      }),
  );
}

export function toDeterministicSignature(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, currentValue) => {
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
  });
}

function buildCompileState(
  target: AuthoringPreviewTarget,
  status: AuthoringPreviewCompileStatus,
  signature: string,
  message: string | null = null,
): AuthoringPreviewCompileState {
  return {
    target,
    status,
    message,
    signature,
  };
}

function buildUpdateSource(
  target: AuthoringPreviewTarget,
  signature: string,
): AuthoringPreviewUpdateSource {
  return { key: target, signature };
}

export function planRuntimeGraphPreviewTransaction(
  options: RuntimeGraphPreviewTransactionOptions,
): RuntimeGraphPreviewTransactionPlan {
  const signature = options.preview.signature;
  const shouldPublish =
    (options.preview.hasPayload || options.managedPayload) &&
    options.lastPublishedSignature !== signature;

  return {
    shouldPublish,
    bundle: options.preview.bundle,
    source: buildUpdateSource("runtime-graph", signature),
    compilingState: buildCompileState("runtime-graph", "compiling", signature),
    compiledState: buildCompileState("runtime-graph", "compiled", signature),
    nextPublishedSignature: shouldPublish
      ? signature
      : (options.lastPublishedSignature ?? null),
    nextManagedPayload: shouldPublish
      ? options.preview.hasPayload
      : options.managedPayload,
  };
}

export function planAnimationPreviewTransaction(
  options: AnimationPreviewTransactionOptions,
): AnimationPreviewTransactionPlan {
  const signature = options.preview.signature;
  const currentChanged =
    options.lastCurrentSignature !== options.currentSignature;
  const adjustedAppliedSignature =
    currentChanged && options.currentSignature !== signature
      ? null
      : (options.appliedSignature ?? null);
  const converged = options.currentSignature === signature;
  const shouldPublish = !converged && adjustedAppliedSignature !== signature;

  return {
    converged,
    shouldPublish,
    bundle: options.preview.bundle,
    source: buildUpdateSource("animation", signature),
    dirtyState: converged
      ? null
      : buildCompileState(
          "animation",
          "dirty",
          signature,
          options.dirtyMessage ?? "Animation preview changed",
        ),
    compilingState: buildCompileState("animation", "compiling", signature),
    compiledState: buildCompileState("animation", "compiled", signature),
    nextLastCurrentSignature: options.currentSignature,
    nextAppliedSignature:
      converged || shouldPublish ? signature : adjustedAppliedSignature,
  };
}

export function planMotionGraphPreviewTransaction(
  options: MotionGraphPreviewTransactionOptions,
): MotionGraphPreviewTransactionPlan {
  const signature = options.preview.signature;
  const currentChanged =
    options.lastCurrentSignature !== options.currentSignature;
  const adjustedAppliedSignature =
    currentChanged && options.currentSignature !== signature
      ? null
      : (options.appliedSignature ?? null);
  const hasProgramAsset = options.preview.programAsset !== null;
  const converged = options.currentSignature === signature;
  const activeOrManaged = hasProgramAsset || options.touchedProgramBundle;
  const shouldPublish =
    activeOrManaged && !converged && adjustedAppliedSignature !== signature;

  return {
    converged,
    shouldPublish,
    bundle: options.preview.bundle,
    source: buildUpdateSource("motiongraph", signature),
    compilingState: buildCompileState("motiongraph", "compiling", signature),
    compiledState: buildCompileState("motiongraph", "compiled", signature),
    nextLastCurrentSignature: options.currentSignature,
    nextAppliedSignature:
      converged || shouldPublish ? signature : adjustedAppliedSignature,
    nextTouchedProgramBundle: converged
      ? options.preview.programs.length === 0
        ? false
        : options.touchedProgramBundle
      : shouldPublish
        ? true
        : options.touchedProgramBundle,
    shouldClearManagedProgramId: converged && !hasProgramAsset,
  };
}

function isAuthoredTimelineAnimation(animation: VizijAnimationAsset): boolean {
  return (
    animation.id === AUTHORED_TIMELINE_CLIP_ID ||
    animation.id === LEGACY_AUTHORED_TIMELINE_CLIP_ID
  );
}

function normalizeAnimationInputPath(path: string | undefined): string {
  return (path ?? "").trim().replace(/^\/+/, "");
}

function hasAnimationTracks(animation: VizijAnimationAsset): boolean {
  const tracks = (animation.clip as { tracks?: unknown[] } | undefined)?.tracks;
  return Array.isArray(tracks) && tracks.length > 0;
}

function muteAnimationClip(
  animation: VizijAnimationAsset,
): VizijAnimationAsset {
  const sourceClip =
    animation.clip && typeof animation.clip === "object"
      ? (animation.clip as Record<string, unknown>)
      : {};
  const clipId =
    typeof sourceClip.id === "string" && sourceClip.id.trim().length > 0
      ? sourceClip.id
      : animation.id;
  return {
    id: animation.id,
    clip: {
      ...sourceClip,
      id: clipId,
      tracks: [],
    } as VizijAnimationAsset["clip"],
  };
}

function collectAuthoredClipOutputPaths(
  clip: AnimationClipIR | null | undefined,
): string[] {
  if (!clip) {
    return [];
  }
  const paths = new Set<string>();
  clip.tracks.forEach((track) => {
    const resolvedPath =
      normalizeAnimationInputPath(track.channel) ||
      normalizeAnimationInputPath(track.variableId);
    if (resolvedPath.length > 0) {
      paths.add(resolvedPath);
    }
  });
  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

export function buildRuntimeGraphPreviewBundle(options: {
  rigSpec?: GraphSpec | null;
  poseGraphSpec?: GraphSpec | null;
  poseConfig?: PoseRigConfig | null;
}): RuntimeGraphPreviewBundleResult {
  const bundle = buildRuntimeGraphBundle({
    rigSpec: options.rigSpec ?? null,
    poseGraphSpec: options.poseGraphSpec ?? null,
    poseConfig: options.poseConfig ?? null,
  });
  return {
    bundle,
    signature: toDeterministicSignature(bundle),
    hasPayload: Boolean(bundle.rig || bundle.pose),
  };
}

export function buildAnimationPreviewBundle(
  options: AnimationPreviewBundleOptions,
): AnimationPreviewBundleResult {
  const authoredAnimation =
    options.active && options.authoredClip
      ? (() => {
          const bundleEntry = clipIrToBundleAnimationEntry(
            options.authoredClip!,
            {
              standardInputsById: options.standardInputsById,
            },
          );
          return {
            id: bundleEntry.id,
            clip: bundleEntry.clip,
          } satisfies VizijAnimationAsset;
        })()
      : null;

  const currentAnimations = [...options.currentAnimations].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const inheritedAssetAnimations = currentAnimations.filter(
    (animation) => !isAuthoredTimelineAnimation(animation),
  );
  const playableInheritedAssetAnimations = inheritedAssetAnimations.filter(
    (animation) => hasAnimationTracks(animation),
  );
  const fallbackInheritedAnimations = [
    ...(options.fallbackInheritedAnimations ?? []),
  ].sort((left, right) => left.id.localeCompare(right.id));

  const animations = options.active
    ? [
        ...(playableInheritedAssetAnimations.length > 0
          ? playableInheritedAssetAnimations
          : fallbackInheritedAnimations),
        ...(authoredAnimation ? [authoredAnimation] : []),
      ].sort((left, right) => left.id.localeCompare(right.id))
    : [
        ...(currentAnimations.length > 0
          ? currentAnimations
          : fallbackInheritedAnimations),
      ]
        .map((animation) => muteAnimationClip(animation))
        .sort((left, right) => left.id.localeCompare(right.id));

  return {
    bundle: { animations },
    animations,
    authoredAnimation,
    outputPaths: collectAuthoredClipOutputPaths(options.authoredClip),
    signature: toDeterministicSignature(animations),
  };
}

export function mergeManagedProgramAsset(
  currentPrograms: readonly VizijProgramAsset[],
  programAsset: VizijProgramAsset | null,
  previousManagedProgramId: string | null,
): VizijProgramAsset[] {
  const managedId = programAsset?.id ?? previousManagedProgramId;
  if (!managedId) {
    return [...currentPrograms].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  let replaced = false;
  const nextPrograms = currentPrograms
    .filter((program) => program.id !== managedId || programAsset)
    .map((program) => {
      if (!programAsset || program.id !== managedId) {
        return program;
      }
      replaced = true;
      return programAsset;
    });

  if (programAsset && !replaced) {
    nextPrograms.push(programAsset);
  }

  return nextPrograms.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildMotionGraphPreviewBundle(
  options: MotionGraphPreviewBundleOptions,
): MotionGraphPreviewBundleResult {
  const resetValues = Object.fromEntries(
    (options.resetValues ?? [])
      .filter(
        (entry) => entry.path.trim().length > 0 && Number.isFinite(entry.value),
      )
      .map((entry) => [entry.path, entry.value]),
  );
  const programAsset =
    options.controllerId &&
    Array.isArray(options.nodes) &&
    Array.isArray(options.edges)
      ? buildMotionGraphProgramAsset({
          id: options.controllerId,
          nodes: options.nodes,
          edges: options.edges,
          resetValues,
        })
      : null;
  const managedProgramId =
    programAsset?.id ?? options.previousManagedProgramId ?? null;
  const programs = mergeManagedProgramAsset(
    options.currentPrograms,
    programAsset,
    options.previousManagedProgramId ?? null,
  );

  return {
    bundle: { programs },
    programs,
    programAsset,
    managedProgramId,
    signature: toDeterministicSignature(programs),
  };
}

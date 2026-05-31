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

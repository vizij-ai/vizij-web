import type { VizijBundleAnimationEntry } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import type {
  AnimationClipIR,
  AnimationInterpolation,
  AnimationKeyframeIR,
  AnimationTrackIR,
} from "../types/animationClipIr";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_METADATA_MARKERS,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  AUTHORED_TIMELINE_CLIP_ID,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
} from "../types/animationClipIr";

const DECIMAL_PRECISION = 6;
const EPSILON = 1e-6;

function quantize(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** DECIMAL_PRECISION;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeInterpolation(value: unknown): AnimationInterpolation {
  if (value === "linear" || value === "step" || value === "cubic") {
    return value;
  }
  if (value === "smooth") {
    return "cubic";
  }
  return "linear";
}

function normalizeChannel(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function keyframeIdFallback(
  keyframe: AnimationKeyframeIR,
  trackId: string,
  index: number,
): string {
  return `${trackId}:auto:${index.toString().padStart(4, "0")}:${quantize(keyframe.time).toString()}:${quantize(keyframe.value).toString()}`;
}

function resolveTrackChannel(
  track: Pick<AnimationTrackIR, "channel" | "variableId">,
  standardInputsById?: ReadonlyMap<string, StandardRigInput>,
): string {
  const direct = normalizeChannel(track.channel ?? "");
  if (direct.length > 0) {
    return direct;
  }
  const mapped = standardInputsById?.get(track.variableId)?.path;
  if (typeof mapped === "string" && mapped.trim().length > 0) {
    return normalizeChannel(mapped);
  }
  return normalizeChannel(track.variableId);
}

function normalizeKeyframes(
  keyframes: ReadonlyArray<AnimationKeyframeIR>,
  duration: number,
  trackId: string,
): AnimationKeyframeIR[] {
  const normalizedDuration = Math.max(0, quantize(duration));
  const normalized = keyframes.map((keyframe, index) => {
    const id =
      typeof keyframe.id === "string" && keyframe.id.trim().length > 0
        ? keyframe.id.trim()
        : keyframeIdFallback(keyframe, trackId, index);
    return {
      id,
      time: clamp(quantize(keyframe.time), 0, normalizedDuration),
      value: quantize(keyframe.value),
      interpolation: normalizeInterpolation(keyframe.interpolation),
      inTangent:
        typeof keyframe.inTangent === "number"
          ? quantize(keyframe.inTangent)
          : (keyframe.inTangent ?? undefined),
      outTangent:
        typeof keyframe.outTangent === "number"
          ? quantize(keyframe.outTangent)
          : (keyframe.outTangent ?? undefined),
    } satisfies AnimationKeyframeIR;
  });

  normalized.sort((left, right) => {
    if (left.time !== right.time) {
      return left.time - right.time;
    }
    return left.id.localeCompare(right.id);
  });

  const byTime = new Map<number, AnimationKeyframeIR>();
  normalized.forEach((keyframe) => {
    // Stable deterministic dedupe: for equal-time keyframes, keep the
    // lexicographically-last id after sorted insertion.
    byTime.set(keyframe.time, keyframe);
  });

  return Array.from(byTime.values()).sort((left, right) => {
    if (left.time !== right.time) {
      return left.time - right.time;
    }
    return left.id.localeCompare(right.id);
  });
}

function buildPathToInputIdMap(
  standardInputsById?: ReadonlyMap<string, StandardRigInput>,
): Map<string, string> {
  const byPath = new Map<string, string>();
  if (!standardInputsById) {
    return byPath;
  }
  standardInputsById.forEach((input, inputId) => {
    const normalizedPath = normalizeChannel(input.path ?? "");
    if (normalizedPath.length > 0 && !byPath.has(normalizedPath)) {
      byPath.set(normalizedPath, inputId);
    }
  });
  return byPath;
}

export interface CompileAnimationClipIrOptions {
  clip: AnimationClipIR;
  standardInputsById?: ReadonlyMap<string, StandardRigInput>;
}

export function compileAnimationClipIr({
  clip,
  standardInputsById,
}: CompileAnimationClipIrOptions): AnimationClipIR {
  const duration = Math.max(0, quantize(clip.duration));
  const normalizedTracks = clip.tracks
    .map((track, index) => {
      const id =
        typeof track.id === "string" && track.id.trim().length > 0
          ? track.id.trim()
          : `track-${index.toString().padStart(4, "0")}`;
      const channel = resolveTrackChannel(track, standardInputsById);
      const interpolation = normalizeInterpolation(track.interpolation);
      const keyframes = normalizeKeyframes(track.keyframes, duration, id);
      return {
        ...track,
        id,
        channel,
        interpolation,
        keyframes,
      } satisfies AnimationTrackIR;
    })
    .filter((track) => track.channel.length > 0)
    .sort((left, right) => {
      if (left.channel === right.channel) {
        return left.id.localeCompare(right.id);
      }
      return left.channel.localeCompare(right.channel);
    });

  const clipId =
    typeof clip.id === "string" && clip.id.trim().length > 0
      ? clip.id.trim()
      : "clip";

  return {
    ...clip,
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: clipId,
    duration,
    tracks: normalizedTracks,
  };
}

export function clipIrToBundleAnimationEntry(
  clip: AnimationClipIR,
  options: { standardInputsById?: ReadonlyMap<string, StandardRigInput> } = {},
): VizijBundleAnimationEntry {
  const compiled = compileAnimationClipIr({
    clip,
    standardInputsById: options.standardInputsById,
  });

  return {
    id: compiled.id,
    clip: {
      id: compiled.id,
      name: compiled.name,
      duration: compiled.duration,
      tracks: compiled.tracks
        .filter((track) => track.keyframes.length > 0)
        .map((track) => ({
          channel: track.channel,
          interpolation: track.interpolation,
          targetInputId: track.variableId,
          keyframes: track.keyframes.map((keyframe) => ({
            time: keyframe.time,
            value: keyframe.value,
            interpolation: keyframe.interpolation,
            inTangent:
              typeof keyframe.inTangent === "number"
                ? keyframe.inTangent
                : undefined,
            outTangent:
              typeof keyframe.outTangent === "number"
                ? keyframe.outTangent
                : undefined,
          })),
        })),
      metadata: {
        ...(compiled.metadata ?? {}),
        ...AUTHORED_TIMELINE_METADATA_MARKERS,
      },
    },
    metadata: {
      ...AUTHORED_TIMELINE_METADATA_MARKERS,
      clipSchemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    },
  };
}

export interface BundleAnimationToClipOptions {
  defaultDuration?: number;
  standardInputsById?: ReadonlyMap<string, StandardRigInput>;
}

function getTrackTargetInputId(track: unknown): string | null {
  const record = asRecord(track);
  const value = record?.targetInputId;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function bundleAnimationEntryToClipIr(
  entry: VizijBundleAnimationEntry,
  options: BundleAnimationToClipOptions = {},
): AnimationClipIR | null {
  if (!entry || typeof entry.id !== "string" || !entry.clip) {
    return null;
  }
  const clip = entry.clip;
  if (!Array.isArray(clip.tracks)) {
    return null;
  }

  const duration =
    typeof clip.duration === "number" && Number.isFinite(clip.duration)
      ? Math.max(0, quantize(clip.duration))
      : Math.max(0, quantize(options.defaultDuration ?? 10));
  const pathToInputId = buildPathToInputIdMap(options.standardInputsById);

  const tracks: AnimationTrackIR[] = [];
  clip.tracks.forEach((rawTrack, trackIndex) => {
    const channel = normalizeChannel(rawTrack.channel ?? "");
    if (!channel || !Array.isArray(rawTrack.keyframes)) {
      return;
    }

    const targetInputId =
      getTrackTargetInputId(rawTrack) ?? pathToInputId.get(channel) ?? channel;
    const interpolation = normalizeInterpolation(rawTrack.interpolation);
    const keyframes: AnimationKeyframeIR[] = [];

    rawTrack.keyframes.forEach((rawKeyframe, keyframeIndex) => {
      const record = asRecord(rawKeyframe);
      const timeRaw = Number(record?.time);
      const valueRaw = Number(record?.value);
      if (!Number.isFinite(timeRaw) || !Number.isFinite(valueRaw)) {
        return;
      }
      keyframes.push({
        id: `trk${trackIndex.toString().padStart(3, "0")}-kf${keyframeIndex
          .toString()
          .padStart(4, "0")}`,
        time: clamp(quantize(timeRaw), 0, duration),
        value: quantize(valueRaw),
        interpolation: normalizeInterpolation(
          record?.interpolation ?? rawTrack.interpolation,
        ),
        inTangent:
          typeof record?.inTangent === "number"
            ? quantize(record.inTangent)
            : undefined,
        outTangent:
          typeof record?.outTangent === "number"
            ? quantize(record.outTangent)
            : undefined,
      });
    });

    if (keyframes.length === 0) {
      return;
    }

    tracks.push({
      id: `track-${trackIndex.toString().padStart(3, "0")}`,
      variableId: targetInputId,
      channel,
      interpolation,
      keyframes,
      label: targetInputId,
    });
  });

  if (tracks.length === 0) {
    return null;
  }

  return compileAnimationClipIr({
    clip: {
      schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
      id: entry.id,
      name: typeof clip.name === "string" ? clip.name : entry.id,
      duration,
      tracks,
      metadata: asRecord(clip.metadata) ?? undefined,
    },
    standardInputsById: options.standardInputsById,
  });
}

export function isAuthoredTimelineOriginMetadata(metadata: unknown): boolean {
  const record = asRecord(metadata);
  return record?.origin === AUTHORED_TIMELINE_METADATA_ORIGIN;
}

export function isAuthoredTimelineBundleAnimationEntry(
  entry: VizijBundleAnimationEntry | null | undefined,
): boolean {
  if (!entry || typeof entry.id !== "string") {
    return false;
  }
  const id = entry.id.trim();
  if (id === AUTHORED_TIMELINE_CLIP_ID) {
    return true;
  }
  if (id !== LEGACY_AUTHORED_TIMELINE_CLIP_ID) {
    return false;
  }
  return (
    isAuthoredTimelineOriginMetadata(entry.metadata) ||
    isAuthoredTimelineOriginMetadata(entry.clip?.metadata)
  );
}

export function findAuthoredTimelineBundleAnimation(
  animations: VizijBundleAnimationEntry[] | null | undefined,
): VizijBundleAnimationEntry | null {
  if (!Array.isArray(animations) || animations.length === 0) {
    return null;
  }

  const canonical = animations.find(
    (entry) =>
      entry &&
      typeof entry.id === "string" &&
      entry.id.trim() === AUTHORED_TIMELINE_CLIP_ID,
  );
  if (canonical) {
    return canonical;
  }

  const legacy = animations.find((entry) =>
    isAuthoredTimelineBundleAnimationEntry(entry),
  );
  return legacy ?? null;
}

export function findCanonicalAuthoredTimelineConflict(
  animations: VizijBundleAnimationEntry[] | null | undefined,
): VizijBundleAnimationEntry | null {
  if (!Array.isArray(animations) || animations.length === 0) {
    return null;
  }
  return (
    animations.find(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        entry.id.trim() === AUTHORED_TIMELINE_CLIP_ID &&
        !isAuthoredTimelineOriginMetadata(entry.metadata) &&
        !isAuthoredTimelineOriginMetadata(entry.clip?.metadata),
    ) ?? null
  );
}

export function evaluateAnimationTrackAtTime(
  track: AnimationTrackIR,
  time: number,
): number {
  if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) {
    return 0;
  }

  const keyframes = [...track.keyframes].sort((left, right) => {
    if (left.time !== right.time) {
      return left.time - right.time;
    }
    return left.id.localeCompare(right.id);
  });

  if (time <= keyframes[0].time + EPSILON) {
    return keyframes[0].value;
  }

  const last = keyframes[keyframes.length - 1];
  if (time >= last.time - EPSILON) {
    return last.value;
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const start = keyframes[index];
    const end = keyframes[index + 1];

    if (time + EPSILON < start.time || time - EPSILON > end.time) {
      continue;
    }

    const span = end.time - start.time;
    if (span <= EPSILON) {
      return end.value;
    }

    const alpha = clamp((time - start.time) / span, 0, 1);
    const interpolation = normalizeInterpolation(
      start.interpolation ?? track.interpolation,
    );

    if (interpolation === "step") {
      return start.value;
    }

    if (interpolation === "cubic") {
      const slope = (end.value - start.value) / span;
      const startTangent =
        typeof start.outTangent === "number" ? start.outTangent : slope;
      const endTangent =
        typeof end.inTangent === "number" ? end.inTangent : slope;
      const t2 = alpha * alpha;
      const t3 = t2 * alpha;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + alpha;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      return (
        h00 * start.value +
        h10 * startTangent * span +
        h01 * end.value +
        h11 * endTangent * span
      );
    }

    return start.value + (end.value - start.value) * alpha;
  }

  return last.value;
}

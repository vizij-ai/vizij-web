// `three` is declared as an untyped ambient module in this app
// (`src/types/three.d.ts`), so we import its runtime helpers as values and model
// only the minimal shapes we consume as local interfaces.
import { Euler, Quaternion, PropertyBinding } from "three";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { World } from "@vizij/render";

/** Minimal shape of a THREE.KeyframeTrack we rely on. */
export interface KeyframeTrackLike {
  name: string;
  getValueSize?: () => number;
  createInterpolant: () => { evaluate: (time: number) => ArrayLike<number> };
  /** Keyframe times (seconds); used to bake a clip at its native keyframes. */
  times?: ArrayLike<number>;
}

/** Minimal shape of a THREE.AnimationClip we rely on. */
export interface AnimationClipLike {
  name?: string;
  duration: number;
  tracks: KeyframeTrackLike[];
}

/** Minimal shape of a THREE.Object3D we rely on. */
export interface Object3DLike {
  uuid: string;
  name?: string;
  getObjectByName: (name: string) => Object3DLike | undefined;
}

/**
 * Pure, framework-free helpers for turning arbitrary (FBX-derived) THREE
 * animation clips into pose snapshots. Nothing here touches React or a store —
 * the orchestration hook (`useFbxPoseExtraction`) wires these into the render
 * store (preview) and the pose-rig store (capture).
 *
 * The renderer imports each glTF node as a Vizij renderable keyed by the
 * THREE `Object3D.uuid` (see `@vizij/render` `import-group.ts` / `import-mesh.ts`),
 * exposing `features.translation` (vector3), `features.rotation` (euler), and
 * `features.scale` (vector3). We resolve each clip track back to that renderable
 * so a sampled frame can be written straight to the render store's animatables.
 */

export type RawChannelProperty =
  | "translation"
  | "rotation"
  | "scale"
  | "weights";

/** THREE track property name -> Vizij renderable feature key. */
const PROPERTY_TO_FEATURE: Record<string, RawChannelProperty> = {
  position: "translation",
  quaternion: "rotation",
  scale: "scale",
  morphTargetInfluences: "weights",
};

const VECTOR_AXES = ["x", "y", "z"] as const;
type VectorAxis = (typeof VECTOR_AXES)[number];

export interface RawChannelBinding {
  /** Owning clip id (matches the id assigned by `summarizeClips`). */
  clipId: string;
  /** Index of the track within the clip. */
  trackIndex: number;
  /** Original THREE track name (e.g. `Head.quaternion`). */
  trackName: string;
  /** The THREE keyframe track, kept for sampling. */
  track: KeyframeTrackLike;
  /** Node name parsed from the track, if any. */
  nodeName: string | null;
  /** Resolved THREE Object3D uuid == Vizij World key. Null when unresolved. */
  nodeUuid: string | null;
  /** Mapped renderable feature. */
  property: RawChannelProperty;
  /** Vizij animatable id owning this channel. Null for weights/bones (see morphTargets). */
  animatableId: string | null;
  /**
   * For `weights` channels: the per-morph scalar animatable ids in glTF morph
   * index order (index j corresponds to sample slot j). `null` at a slot means
   * that morph had no resolvable animatable. Undefined for non-weights channels.
   */
  morphTargets?: Array<string | null>;
  /** Animatable value type inferred from the feature. */
  animatableType: AnimatableValue["type"] | null;
  /** Numeric entries per keyframe in the source track. */
  valueSize: number;
}

export interface RawClipSummary {
  id: string;
  name: string;
  duration: number;
  index: number;
  trackCount: number;
}

/**
 * Assign each clip a stable, human-facing id/name. Mirrors the fallback logic in
 * `extract-animations.ts` `resolveClipId` so ids are consistent across surfaces.
 */
export function summarizeClips(clips: AnimationClipLike[]): RawClipSummary[] {
  return clips.map((clip, index) => ({
    id:
      clip.name && clip.name.length > 0 ? clip.name : `fbx-animation-${index}`,
    name:
      clip.name && clip.name.length > 0 ? clip.name : `Animation ${index + 1}`,
    duration: Number.isFinite(clip.duration) ? clip.duration : 0,
    index,
    trackCount: clip.tracks.length,
  }));
}

function resolveClipId(clip: AnimationClipLike, index: number): string {
  return clip.name && clip.name.length > 0
    ? clip.name
    : `fbx-animation-${index}`;
}

/** Read the animatable id for a renderable feature, tolerating the union of World types. */
function readFeatureAnimatableId(
  renderable: unknown,
  featureKey: RawChannelProperty,
): string | null {
  if (!renderable || typeof renderable !== "object") {
    return null;
  }
  const features = (renderable as { features?: Record<string, unknown> })
    .features;
  const feature = features?.[featureKey];
  if (!feature || typeof feature !== "object") {
    return null;
  }
  const { animated, value } = feature as {
    animated?: boolean;
    value?: unknown;
  };
  if (animated === true && typeof value === "string") {
    return value;
  }
  return null;
}

/**
 * Read a mesh renderable's per-morph scalar animatable ids in morph-target
 * order. The renderer stores `Shape.morphTargets` as featureKeys in
 * `morphTargetDictionary` (i.e. glTF morph index) order, and each featureKey
 * maps to an `AnimatableNumber` via `features[featureKey].value` — so slot j
 * here lines up with slot j of a flat glTF `weights` sampler track. Slots whose
 * feature can't be resolved are kept as `null` to preserve index alignment.
 */
function readMorphAnimatableIds(renderable: unknown): Array<string | null> {
  if (!renderable || typeof renderable !== "object") {
    return [];
  }
  const record = renderable as {
    morphTargets?: unknown;
    features?: Record<string, unknown>;
  };
  const keys = Array.isArray(record.morphTargets)
    ? (record.morphTargets as unknown[])
    : [];
  const features = record.features ?? {};
  return keys.map((key) => {
    if (typeof key !== "string") {
      return null;
    }
    const feature = features[key];
    if (!feature || typeof feature !== "object") {
      return null;
    }
    const { animated, value } = feature as {
      animated?: boolean;
      value?: unknown;
    };
    return animated === true && typeof value === "string" ? value : null;
  });
}

function inferAnimatableType(
  property: RawChannelProperty,
): AnimatableValue["type"] | null {
  switch (property) {
    case "rotation":
      return "euler";
    case "translation":
    case "scale":
      return "vector3";
    case "weights":
      return "number";
    default:
      return null;
  }
}

/**
 * Resolve every track of every clip to render targets. Transform channels
 * resolve to a single animatable (`animatableId`); `weights` channels resolve to
 * the target mesh's ordered per-morph animatables (`morphTargets`). Tracks whose
 * target node isn't a Vizij renderable (e.g. skeleton bones, which the importer
 * skips) resolve unmapped so callers can surface them rather than silently
 * dropping them.
 */
export function indexRawChannels(
  clips: AnimationClipLike[],
  scene: Object3DLike | null | undefined,
  world: World,
): RawChannelBinding[] {
  const bindings: RawChannelBinding[] = [];
  if (!scene) {
    return bindings;
  }
  clips.forEach((clip, clipIndex) => {
    const clipId = resolveClipId(clip, clipIndex);
    clip.tracks.forEach((track, trackIndex) => {
      const parsed = safeParseTrackName(track.name);
      const propertyName = parsed?.propertyName;
      const property = propertyName
        ? PROPERTY_TO_FEATURE[propertyName]
        : undefined;
      const nodeName = parsed?.nodeName ?? null;

      let nodeUuid: string | null = null;
      let animatableId: string | null = null;
      let morphTargets: Array<string | null> | undefined;
      if (nodeName) {
        const node = findSceneNode(scene, nodeName);
        nodeUuid = node?.uuid ?? null;
        if (nodeUuid && property === "weights") {
          morphTargets = readMorphAnimatableIds(world[nodeUuid]);
        } else if (nodeUuid && property) {
          animatableId = readFeatureAnimatableId(world[nodeUuid], property);
        }
      }

      const valueSize =
        typeof track.getValueSize === "function"
          ? track.getValueSize()
          : property === "rotation"
            ? 4
            : 3;

      bindings.push({
        clipId,
        trackIndex,
        trackName: track.name,
        track,
        nodeName,
        nodeUuid,
        property: property ?? "weights",
        animatableId,
        morphTargets,
        animatableType: property ? inferAnimatableType(property) : null,
        valueSize,
      });
    });
  });
  return bindings;
}

function safeParseTrackName(
  name: string,
): { nodeName: string; propertyName: string } | null {
  try {
    const parsed = PropertyBinding.parseTrackName(name);
    return {
      nodeName: parsed.nodeName ?? "",
      propertyName: parsed.propertyName ?? "",
    };
  } catch {
    return null;
  }
}

function findSceneNode(
  scene: Object3DLike,
  nodeName: string,
): Object3DLike | null {
  try {
    const node = PropertyBinding.findNode(scene, nodeName);
    if (node) {
      return node as Object3DLike;
    }
  } catch {
    // fall through to name lookup
  }
  return scene.getObjectByName(nodeName) ?? null;
}

/**
 * Sample one track at `timeSeconds` into a fixed-length numeric vector using
 * THREE's own interpolant, which handles LINEAR/STEP/CUBICSPLINE and quaternion
 * slerp correctly.
 */
export function sampleRawTrackAtTime(
  track: KeyframeTrackLike,
  timeSeconds: number,
): number[] {
  const interpolant = track.createInterpolant();
  const result = interpolant.evaluate(timeSeconds);
  return Array.from(result as ArrayLike<number>);
}

/**
 * Convert a sampled channel to the `RawValue` shape expected by the target
 * animatable. Rotations arrive as quaternions and are converted to Euler using
 * the same order/up-axis the renderer imports with (`XYZ`, DEFAULT_UP=(0,0,1)).
 * Returns `undefined` for unmapped channels (e.g. morph weights).
 */
export function channelSampleToRawValue(
  binding: RawChannelBinding,
  sample: number[],
): RawValue | undefined {
  switch (binding.property) {
    case "translation":
    case "scale":
      return { x: sample[0] ?? 0, y: sample[1] ?? 0, z: sample[2] ?? 0 };
    case "rotation": {
      if (sample.length >= 4) {
        const q = new Quaternion(
          sample[0] ?? 0,
          sample[1] ?? 0,
          sample[2] ?? 0,
          sample[3] ?? 1,
        );
        const euler = new Euler().setFromQuaternion(q, "XYZ");
        return { x: euler.x, y: euler.y, z: euler.z };
      }
      // Rare: an already-euler rotation track.
      return { x: sample[0] ?? 0, y: sample[1] ?? 0, z: sample[2] ?? 0 };
    }
    case "weights":
    default:
      return undefined;
  }
}

function isVectorRawValue(
  value: RawValue,
): value is { x: number; y: number; z: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    "z" in value
  );
}

/**
 * A channel is mapped when we can drive a rig target from it: a transform
 * channel with a resolved animatable, or a weights channel with at least one
 * resolved per-morph animatable.
 */
export function isChannelMapped(binding: RawChannelBinding): boolean {
  if (binding.property === "weights") {
    return Boolean(binding.morphTargets?.some((id) => id));
  }
  return Boolean(binding.animatableId);
}

/**
 * Sample every mapped channel of a clip at `timeSeconds` into render-store
 * writes (`setValues`). `namespace` is the render namespace the viewport uses.
 */
export function sampleFrameToRenderWrites(
  bindings: RawChannelBinding[],
  clipId: string,
  timeSeconds: number,
  namespace: string,
): Array<{ id: string; namespace: string; value: RawValue }> {
  const writes: Array<{ id: string; namespace: string; value: RawValue }> = [];
  bindings.forEach((binding) => {
    if (binding.clipId !== clipId) {
      return;
    }
    if (binding.property === "weights") {
      const ids = binding.morphTargets;
      if (!ids || ids.length === 0) {
        return;
      }
      const sample = sampleRawTrackAtTime(binding.track, timeSeconds);
      ids.forEach((id, index) => {
        const value = sample[index];
        if (id && typeof value === "number") {
          writes.push({ id, namespace, value });
        }
      });
      return;
    }
    if (!binding.animatableId) {
      return;
    }
    const sample = sampleRawTrackAtTime(binding.track, timeSeconds);
    const value = channelSampleToRawValue(binding, sample);
    if (value !== undefined) {
      writes.push({ id: binding.animatableId, namespace, value });
    }
  });
  return writes;
}

/**
 * Sample every mapped channel of a clip at `timeSeconds` into a StandardInput
 * value map. `resolveInputId` maps an animatable component id
 * (`<animatableId>:<axis>` for vectors/eulers, `<animatableId>` for scalars) to
 * the standard-input id captured by the pose store. Unresolved components are
 * skipped.
 */
export function sampleFrameToInputValues(
  bindings: RawChannelBinding[],
  clipId: string,
  timeSeconds: number,
  resolveInputId: (componentId: string) => string | null,
): Record<string, number> {
  const values: Record<string, number> = {};
  bindings.forEach((binding) => {
    if (binding.clipId !== clipId) {
      return;
    }
    if (binding.property === "weights") {
      const ids = binding.morphTargets;
      if (!ids || ids.length === 0) {
        return;
      }
      const sample = sampleRawTrackAtTime(binding.track, timeSeconds);
      ids.forEach((animatableId, index) => {
        const value = sample[index];
        if (!animatableId || typeof value !== "number") {
          return;
        }
        // A morph is a scalar animatable: its componentId is the animatable id.
        const inputId = resolveInputId(animatableId);
        if (inputId) {
          values[inputId] = value;
        }
      });
      return;
    }
    if (!binding.animatableId) {
      return;
    }
    const sample = sampleRawTrackAtTime(binding.track, timeSeconds);
    const raw = channelSampleToRawValue(binding, sample);
    if (raw === undefined) {
      return;
    }
    if (isVectorRawValue(raw)) {
      VECTOR_AXES.forEach((axis: VectorAxis) => {
        const componentId = `${binding.animatableId}:${axis}`;
        const inputId = resolveInputId(componentId);
        if (inputId) {
          values[inputId] = raw[axis];
        }
      });
    } else if (typeof raw === "number") {
      const inputId = resolveInputId(binding.animatableId);
      if (inputId) {
        values[inputId] = raw;
      }
    }
  });
  return values;
}

/**
 * Collect the sorted, de-duplicated union of keyframe times across a clip's
 * tracks — the native sample points for baking the clip into a timeline. Falls
 * back to `[0]` when no track exposes times.
 */
export function collectClipFrameTimes(
  bindings: RawChannelBinding[],
  clipId: string,
): number[] {
  const times = new Set<number>();
  bindings.forEach((binding) => {
    if (binding.clipId !== clipId || !binding.track.times) {
      return;
    }
    for (let i = 0; i < binding.track.times.length; i += 1) {
      const t = binding.track.times[i];
      if (typeof t === "number" && Number.isFinite(t)) {
        times.add(t);
      }
    }
  });
  if (times.size === 0) {
    return [0];
  }
  return Array.from(times).sort((a, b) => a - b);
}

import { deriveMorphFeatureKeys } from "@vizij/render";

/**
 * Minimal read-only view of the glTF JSON we need to enumerate animation
 * channels. Declared locally rather than pulling a full glTF schema: only
 * these fields participate in channel resolution.
 */
export interface GltfJsonLike {
  nodes?: ReadonlyArray<{ name?: unknown; mesh?: unknown } | null>;
  meshes?: ReadonlyArray<{ extras?: { targetNames?: unknown } | null } | null>;
  animations?: ReadonlyArray<{
    name?: unknown;
    channels?: ReadonlyArray<{
      sampler?: unknown;
      target?: { node?: unknown; path?: unknown } | null;
    } | null>;
    samplers?: ReadonlyArray<{ interpolation?: unknown } | null>;
  } | null>;
}

/** glTF animation channel target paths we can map onto Vizij channels. */
export const SUPPORTED_GLTF_CHANNEL_PATHS = [
  "translation",
  "rotation",
  "scale",
  "weights",
] as const;

export type GltfChannelPath = (typeof SUPPORTED_GLTF_CHANNEL_PATHS)[number];

export type GltfSamplerInterpolation = "LINEAR" | "STEP" | "CUBICSPLINE";

export interface GltfAnimationChannel {
  animationIndex: number;
  animationName: string;
  channelIndex: number;
  nodeIndex: number;
  /** glTF node name; empty when the node is unnamed. */
  nodeName: string;
  path: GltfChannelPath;
  samplerIndex: number;
  interpolation: GltfSamplerInterpolation;
  /**
   * Morph target names for the owning mesh, in target order. Only populated
   * for `weights` channels, which animate every target at once.
   */
  morphNames?: string[];
}

/**
 * A single scalar curve. Vizij animation tracks are scalar-per-track, so a
 * vector or `weights` channel expands into several of these.
 */
export interface GltfScalarChannelTarget {
  channel: GltfAnimationChannel;
  /** Component for vector/euler channels; absent for morphs. */
  component?: "x" | "y" | "z";
  /** Raw morph name for `weights` channels; absent otherwise. */
  morphName?: string;
  /** Feature key the morph name resolves to; absent for non-morph channels. */
  morphFeatureKey?: string;
  /**
   * Index of this scalar within the sampler's per-keyframe output stride.
   * Vector channels use 0..2; morph channels use their target index.
   */
  valueIndex: number;
}

const VECTOR_COMPONENTS = ["x", "y", "z"] as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isSupportedPath(value: unknown): value is GltfChannelPath {
  return (
    typeof value === "string" &&
    (SUPPORTED_GLTF_CHANNEL_PATHS as ReadonlyArray<string>).includes(value)
  );
}

function normalizeInterpolation(value: unknown): GltfSamplerInterpolation {
  if (value === "STEP" || value === "CUBICSPLINE") {
    return value;
  }
  return "LINEAR";
}

function readTargetNames(
  json: GltfJsonLike,
  nodeIndex: number,
): string[] | undefined {
  const node = json.nodes?.[nodeIndex];
  const meshIndex = node?.mesh;
  if (typeof meshIndex !== "number") {
    return undefined;
  }
  const targetNames = json.meshes?.[meshIndex]?.extras?.targetNames;
  if (!Array.isArray(targetNames)) {
    return undefined;
  }
  const names = targetNames.map((entry) => asString(entry));
  return names.length > 0 ? names : undefined;
}

/**
 * Enumerates every animation channel in a glTF document that targets a
 * property Vizij can drive. Channels with unsupported target paths, missing
 * nodes, or malformed targets are skipped; callers that need to report them
 * should diff against the raw channel count.
 */
export function extractGltfAnimationChannels(
  json: GltfJsonLike,
): GltfAnimationChannel[] {
  const channels: GltfAnimationChannel[] = [];
  const animations = json.animations ?? [];

  animations.forEach((animation, animationIndex) => {
    if (!animation) {
      return;
    }
    const animationName =
      asString(animation.name) || `animation-${animationIndex}`;

    (animation.channels ?? []).forEach((channel, channelIndex) => {
      const target = channel?.target;
      const nodeIndex = target?.node;
      if (typeof nodeIndex !== "number" || !isSupportedPath(target?.path)) {
        return;
      }
      if (!json.nodes?.[nodeIndex]) {
        return;
      }

      const samplerIndex =
        typeof channel?.sampler === "number" ? channel.sampler : -1;
      const interpolation = normalizeInterpolation(
        animation.samplers?.[samplerIndex]?.interpolation,
      );

      channels.push({
        animationIndex,
        animationName,
        channelIndex,
        nodeIndex,
        nodeName: asString(json.nodes[nodeIndex]?.name),
        path: target.path,
        samplerIndex,
        interpolation,
        ...(target.path === "weights"
          ? { morphNames: readTargetNames(json, nodeIndex) ?? [] }
          : {}),
      });
    });
  });

  return channels;
}

/**
 * Expands one channel into the scalar curves it carries.
 *
 * `translation`/`rotation`/`scale` yield x/y/z. `weights` yields one entry per
 * morph target, keyed by the same feature key import derived for that mesh.
 */
export function expandChannelToScalarTargets(
  channel: GltfAnimationChannel,
): GltfScalarChannelTarget[] {
  if (channel.path === "weights") {
    const morphNames = channel.morphNames ?? [];
    const featureKeys = deriveMorphFeatureKeys(morphNames);
    return morphNames.map((morphName, index) => ({
      channel,
      morphName,
      morphFeatureKey: featureKeys[index],
      valueIndex: index,
    }));
  }

  return VECTOR_COMPONENTS.map((component, index) => ({
    channel,
    component,
    valueIndex: index,
  }));
}

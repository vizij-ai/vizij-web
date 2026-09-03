import {
  expandChannelToScalarTargets,
  extractGltfAnimationChannels,
  type GltfChannelPath,
  type GltfJsonLike,
  type GltfSamplerInterpolation,
} from "./gltfAnimationChannels";
import {
  readAccessorAsFloats,
  readGlbChunks,
  type GltfAccessorSource,
} from "./gltfAccessors";

/**
 * A glTF document's animation content, decoded and detached from the file.
 *
 * This is the boundary between reading bytes and converting types. Everything
 * downstream operates on this structure, so the conversion to Vizij clips is a
 * pure function of plain data and can be tested from literals instead of
 * requiring a real GLB.
 */

export interface GltfAnimationCurve {
  /** Source glTF node name; empty when the node is unnamed. */
  nodeName: string;
  path: GltfChannelPath;
  interpolation: GltfSamplerInterpolation;
  /** Key times in seconds, ascending. */
  times: number[];
  /**
   * Flattened sampler output. Length is `times.length * stride`, except for
   * `CUBICSPLINE`, where it is `times.length * stride * 3` — the
   * (inTangent, value, outTangent) triplets glTF stores.
   */
  values: number[];
  /** Values per key: 3 for vectors, 4 for rotation, morph count for weights. */
  stride: number;
  /**
   * Morph feature keys in target order, for `weights` curves. These are the
   * keys geometry import derived, so they line up with propsrig feature keys.
   */
  morphFeatureKeys?: string[];
}

export interface GltfAnimationEntry {
  /** Animation name as authored (Blender's action name, typically). */
  name: string;
  index: number;
  curves: GltfAnimationCurve[];
}

export interface GltfAnimationDocument {
  animations: GltfAnimationEntry[];
  /** Problems encountered while decoding, e.g. an unreadable sampler. */
  readErrors: string[];
}

interface RawSampler {
  input?: unknown;
  output?: unknown;
}

function samplerOf(
  json: GltfAccessorSource["json"],
  animationIndex: number,
  samplerIndex: number,
): RawSampler | undefined {
  const animations = (
    json as unknown as {
      animations?: ReadonlyArray<{ samplers?: ReadonlyArray<RawSampler> }>;
    }
  ).animations;
  return animations?.[animationIndex]?.samplers?.[samplerIndex];
}

/**
 * Decodes every animation curve in a GLB into a {@link GltfAnimationDocument}.
 *
 * Accessors are read directly rather than via Three.js, so decoding is
 * deterministic and free of `GLTFLoader`'s node-name sanitizing and per-mesh
 * track splitting.
 */
export function readGltfAnimationDocument(
  glb: ArrayBuffer,
): GltfAnimationDocument {
  const { json, binary } = readGlbChunks(glb);
  const source: GltfAccessorSource = {
    json: json as GltfAccessorSource["json"],
    binary,
  };
  const gltf = json as GltfJsonLike;

  const readErrors: string[] = [];
  const byAnimation = new Map<number, GltfAnimationEntry>();

  for (const channel of extractGltfAnimationChannels(gltf)) {
    const sampler = samplerOf(
      source.json,
      channel.animationIndex,
      channel.samplerIndex,
    );
    if (
      typeof sampler?.input !== "number" ||
      typeof sampler?.output !== "number"
    ) {
      readErrors.push(
        `"${channel.animationName}": channel ${channel.channelIndex} has no usable sampler.`,
      );
      continue;
    }

    let times: number[];
    let values: number[];
    try {
      times = readAccessorAsFloats(source, sampler.input);
      values = readAccessorAsFloats(source, sampler.output);
    } catch (error) {
      readErrors.push(
        `"${channel.animationName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (times.length === 0 || values.length === 0) {
      readErrors.push(`"${channel.animationName}": empty sampler data.`);
      continue;
    }

    // For `weights` the stride is the mesh's morph count; scalar expansion
    // already knows those, so reuse it rather than re-deriving the keys.
    const scalarTargets = expandChannelToScalarTargets(channel);
    const stride =
      channel.path === "weights"
        ? Math.max(1, scalarTargets.length)
        : channel.path === "rotation"
          ? 4
          : 3;

    const entry = byAnimation.get(channel.animationIndex) ?? {
      name: channel.animationName,
      index: channel.animationIndex,
      curves: [],
    };
    entry.curves.push({
      nodeName: channel.nodeName,
      path: channel.path,
      interpolation: channel.interpolation,
      times,
      values,
      stride,
      ...(channel.path === "weights"
        ? {
            morphFeatureKeys: scalarTargets.map(
              (target) => target.morphFeatureKey ?? "",
            ),
          }
        : {}),
    });
    byAnimation.set(channel.animationIndex, entry);
  }

  return {
    animations: [...byAnimation.values()].sort(
      (left, right) => left.index - right.index,
    ),
    readErrors,
  };
}

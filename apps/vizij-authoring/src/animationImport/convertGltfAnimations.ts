import { deriveStandardRigInputIdFromPath } from "@vizij/utils";
import { buildPropsRigInputPath } from "../rig/autoInputs";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
  type AnimationInterpolation,
  type AnimationKeyframeIR,
  type AnimationTrackIR,
} from "../types/animationClipIr";
import { compileAnimationClipIr } from "../utils/animationClipCompiler";
import type {
  GltfAnimationCurve,
  GltfAnimationDocument,
} from "./gltfAnimationDocument";
import type { PropsRigTargetCatalog } from "./propsRigTargetCatalog";
import { quaternionCurveToEulerZYX } from "./quaternionToEuler";

/**
 * Converts a decoded glTF animation document into Vizij animation clips.
 *
 * Pure: no file access, no `ArrayBuffer`, no Three.js. Given the same document
 * and catalog it always produces the same clips, so it can be tested from
 * literal inputs rather than through real GLB bytes.
 */

/** How the source grouped its animations, inferred from the document's shape. */
export type GltfAnimationGrouping =
  | "per-action"
  | "per-animation"
  | "single-scene";

export type GltfImportDiagnosticSeverity = "info" | "warning" | "error";

export interface GltfImportDiagnostic {
  severity: GltfImportDiagnosticSeverity;
  code: string;
  message: string;
  /** A concrete next step, when the author has one. */
  remediation?: string;
}

export interface GltfConversionStats {
  sourceAnimations: number;
  /** Scalar curves the document carries, after expanding vectors and morphs. */
  scalarChannels: number;
  resolvedChannels: number;
  unresolvedChannels: number;
  keyframes: number;
}

export interface GltfConversionResult {
  clips: AnimationClipIR[];
  grouping: GltfAnimationGrouping;
  diagnostics: GltfImportDiagnostic[];
  stats: GltfConversionStats;
}

export interface ConvertGltfAnimationsOptions {
  document: GltfAnimationDocument;
  catalog: PropsRigTargetCatalog;
  clipId?: string;
  clipName?: string;
}

const BLENDER_ACTION_NAME = /Action(\.\d+)?$/;

const VECTOR_COMPONENTS = ["x", "y", "z"] as const;
type VectorComponent = (typeof VECTOR_COMPONENTS)[number];

const FEATURE_KEY_BY_PATH = {
  translation: "translation",
  rotation: "rotation",
  scale: "scale",
} as const;

function toClipInterpolation(
  curve: GltfAnimationCurve,
): AnimationInterpolation {
  if (curve.interpolation === "STEP") {
    return "step";
  }
  if (curve.interpolation === "CUBICSPLINE") {
    return "cubic";
  }
  return "linear";
}

/** True when the curve's output carries CUBICSPLINE tangent triplets. */
function hasTangentTriplets(curve: GltfAnimationCurve): boolean {
  return (
    curve.interpolation === "CUBICSPLINE" &&
    curve.values.length === curve.times.length * curve.stride * 3
  );
}

/**
 * Scalar count a curve contributes: one per vector component, or one per morph
 * target.
 */
function scalarCountOf(curve: GltfAnimationCurve): number {
  return curve.path === "weights"
    ? (curve.morphFeatureKeys?.length ?? 0)
    : VECTOR_COMPONENTS.length;
}

/**
 * Infers how the exporter grouped animations.
 *
 * Blender's default per-Action mode emits one animation per action per object,
 * so its animations are fragments of a single timeline rather than separate
 * clips. Detecting that is what lets conversion reassemble them instead of
 * producing a dozen one-channel clips.
 */
export function inferGltfAnimationGrouping(
  document: GltfAnimationDocument,
): GltfAnimationGrouping {
  const { animations } = document;
  if (animations.length <= 1) {
    return "single-scene";
  }
  const actionNamed = animations.filter((entry) =>
    BLENDER_ACTION_NAME.test(entry.name),
  );
  const maxCurves = Math.max(...animations.map((entry) => entry.curves.length));
  if (
    actionNamed.length >= Math.ceil(animations.length / 2) &&
    maxCurves <= 3
  ) {
    return "per-action";
  }
  return "per-animation";
}

/** One scalar column of a curve, already resolved to a Vizij channel. */
interface ResolvedColumn {
  curve: GltfAnimationCurve;
  animationName: string;
  propsRigPath: string;
  /** Column within a key's stride. */
  valueIndex: number;
  component?: VectorComponent;
  morphFeatureKey?: string;
}

function readColumn(
  curve: GltfAnimationCurve,
  valueIndex: number,
): number[] | null {
  const cubic = hasTangentTriplets(curve);
  const expected = curve.times.length * curve.stride * (cubic ? 3 : 1);
  if (curve.values.length !== expected) {
    return null;
  }
  const out: number[] = [];
  for (let index = 0; index < curve.times.length; index += 1) {
    const base = index * curve.stride * (cubic ? 3 : 1);
    const at = cubic ? base + curve.stride + valueIndex : base + valueIndex;
    out.push(curve.values[at] ?? 0);
  }
  return out;
}

function tangentsFor(
  curve: GltfAnimationCurve,
  valueIndex: number,
): { inTangent: number[]; outTangent: number[] } | null {
  if (!hasTangentTriplets(curve)) {
    return null;
  }
  const inTangent: number[] = [];
  const outTangent: number[] = [];
  for (let index = 0; index < curve.times.length; index += 1) {
    const base = index * curve.stride * 3;
    inTangent.push(curve.values[base + valueIndex] ?? 0);
    outTangent.push(curve.values[base + curve.stride * 2 + valueIndex] ?? 0);
  }
  return { inTangent, outTangent };
}

export function convertGltfAnimations(
  options: ConvertGltfAnimationsOptions,
): GltfConversionResult {
  const { document, catalog } = options;
  const diagnostics: GltfImportDiagnostic[] = [];
  const grouping = inferGltfAnimationGrouping(document);
  const sourceAnimations = document.animations.length;

  for (const message of document.readErrors) {
    diagnostics.push({
      severity: "error",
      code: "sampler-read-failed",
      message: `Could not read sampler data for ${message}`,
    });
  }

  if (sourceAnimations === 0) {
    diagnostics.push({
      severity: "info",
      code: "no-native-animations",
      message: "This GLB has no native glTF animations.",
    });
  }

  if (grouping === "per-action" && sourceAnimations > 1) {
    diagnostics.push({
      severity: "info",
      code: "per-action-grouping",
      message:
        `This GLB was exported with Blender's default per-Action mode, so its ` +
        `${sourceAnimations} animations are fragments of one timeline rather ` +
        `than ${sourceAnimations} clips. Importing them as a single clip.`,
      remediation:
        "To preserve your own grouping, re-export from Blender with Animation Mode = NLA Tracks.",
    });
  }

  // --- resolve every scalar column onto a Vizij channel --------------------
  const resolved: ResolvedColumn[] = [];
  const unresolvedByReason = new Map<string, number>();
  let scalarChannels = 0;

  const reject = (reason: string) => {
    unresolvedByReason.set(reason, (unresolvedByReason.get(reason) ?? 0) + 1);
  };

  for (const animation of document.animations) {
    for (const curve of animation.curves) {
      const scalarCount = scalarCountOf(curve);
      scalarChannels += scalarCount;

      if (!curve.nodeName) {
        for (let i = 0; i < scalarCount; i += 1) {
          reject("unnamed-node");
        }
        continue;
      }
      if (curve.path === "weights" && scalarCount === 0) {
        reject("no-morph-targets");
        continue;
      }

      if (curve.path === "weights") {
        (curve.morphFeatureKeys ?? []).forEach((featureKey, valueIndex) => {
          if (!featureKey) {
            reject("no-morph-targets");
            return;
          }
          const propsRigPath = buildPropsRigInputPath({
            elementName: curve.nodeName,
            featureKey,
          });
          if (!catalog.hasInputPath(propsRigPath)) {
            reject("no-matching-input");
            return;
          }
          resolved.push({
            curve,
            animationName: animation.name,
            propsRigPath,
            valueIndex,
            morphFeatureKey: featureKey,
          });
        });
        continue;
      }

      const featureKey = FEATURE_KEY_BY_PATH[curve.path];
      VECTOR_COMPONENTS.forEach((component, valueIndex) => {
        const propsRigPath = buildPropsRigInputPath({
          elementName: curve.nodeName,
          featureKey,
          component,
        });
        if (!catalog.hasInputPath(propsRigPath)) {
          reject("no-matching-input");
          return;
        }
        resolved.push({
          curve,
          animationName: animation.name,
          propsRigPath,
          valueIndex,
          component,
        });
      });
    }
  }

  for (const [reason, count] of unresolvedByReason) {
    diagnostics.push({
      severity: "warning",
      code: `unresolved-${reason}`,
      message: `${count} channel(s) could not be matched to a Vizij input (${reason}).`,
      remediation:
        reason === "no-matching-input"
          ? "Check that the object and shape-key names in Blender still match the Vizij face."
          : undefined,
    });
  }

  // --- build tracks --------------------------------------------------------
  const tracksByChannel = new Map<string, AnimationTrackIR>();
  const eulerCache = new Map<
    GltfAnimationCurve,
    ReturnType<typeof quaternionCurveToEulerZYX> | null
  >();
  let keyframes = 0;
  let gimbalKeyTotal = 0;
  let cubicRotationCurves = 0;
  let ordinal = 0;

  for (const column of resolved) {
    const { curve } = column;
    const trackId = `gltf-${(ordinal += 1).toString().padStart(4, "0")}`;
    let values: number[] | null;
    let tangents: ReturnType<typeof tangentsFor> = null;

    if (curve.path === "rotation") {
      let euler = eulerCache.get(curve);
      if (euler === undefined) {
        if (curve.interpolation === "CUBICSPLINE") {
          cubicRotationCurves += 1;
        }
        // Quaternion tangents have no euler equivalent, so cubic rotation uses
        // the value column only and degrades to linear.
        const quaternionValues = hasTangentTriplets(curve)
          ? (() => {
              const flat: number[] = [];
              for (let i = 0; i < curve.times.length; i += 1) {
                const base = i * curve.stride * 3 + curve.stride;
                for (let c = 0; c < curve.stride; c += 1) {
                  flat.push(curve.values[base + c] ?? 0);
                }
              }
              return flat;
            })()
          : curve.values;
        euler = quaternionCurveToEulerZYX(quaternionValues, curve.times.length);
        gimbalKeyTotal += euler.gimbalKeyCount;
        eulerCache.set(curve, euler);
      }
      values = euler ? euler[column.component ?? "x"] : null;
    } else {
      values = readColumn(curve, column.valueIndex);
      tangents = tangentsFor(curve, column.valueIndex);
    }

    if (!values) {
      diagnostics.push({
        severity: "error",
        code: "sampler-stride-mismatch",
        message: `"${column.animationName}": sampler output length does not match its key count; channel ${column.propsRigPath} was skipped.`,
      });
      continue;
    }

    const built: AnimationKeyframeIR[] = [];
    curve.times.forEach((time, index) => {
      const value = values![index];
      if (!Number.isFinite(time) || !Number.isFinite(value)) {
        return;
      }
      const keyframe: AnimationKeyframeIR = {
        id: `${trackId}:kf${index.toString().padStart(4, "0")}`,
        time,
        value: value as number,
      };
      if (tangents) {
        keyframe.inTangent = tangents.inTangent[index];
        keyframe.outTangent = tangents.outTangent[index];
      }
      built.push(keyframe);
    });
    if (built.length === 0) {
      continue;
    }
    keyframes += built.length;

    const existing = tracksByChannel.get(column.propsRigPath);
    if (existing) {
      // Two source animations drive the same channel; concatenate and let the
      // compiler's equal-time dedupe settle overlaps deterministically.
      existing.keyframes = [...existing.keyframes, ...built];
      continue;
    }

    tracksByChannel.set(column.propsRigPath, {
      id: trackId,
      variableId: deriveStandardRigInputIdFromPath(column.propsRigPath),
      channel: column.propsRigPath,
      label: column.morphFeatureKey
        ? `${curve.nodeName} ${column.morphFeatureKey}`
        : `${curve.nodeName} ${curve.path}${
            column.component ? ` ${column.component}` : ""
          }`,
      // Euler conversion discards quaternion tangents, so rotation is linear.
      interpolation:
        curve.path === "rotation" ? "linear" : toClipInterpolation(curve),
      keyframes: built,
      metadata: {
        source: "gltf-native-animation",
        sourceAnimation: column.animationName,
        sourceNode: curve.nodeName,
        sourcePath: curve.path,
        ...(column.morphFeatureKey
          ? { sourceMorphName: column.morphFeatureKey }
          : {}),
      },
    });
  }

  if (cubicRotationCurves > 0) {
    diagnostics.push({
      severity: "info",
      code: "rotation-cubic-to-linear",
      message:
        `${cubicRotationCurves} rotation channel(s) used CUBICSPLINE ` +
        "interpolation. Quaternion tangents have no euler equivalent, so those " +
        "curves were imported as linear through the same keyframes.",
    });
  }

  if (gimbalKeyTotal > 0) {
    diagnostics.push({
      severity: "warning",
      code: "rotation-gimbal-keys",
      message:
        `${gimbalKeyTotal} rotation keyframe(s) sit at the euler singularity ` +
        "(pitch near ±90°), where one axis becomes indeterminate. Those keys " +
        "may read differently than in the source.",
      remediation:
        "Check rotation on the affected elements, and prefer keeping pitch away from ±90° in the source rig.",
    });
  }

  const tracks = [...tracksByChannel.values()];

  // Blender emits a `weights` channel covering every morph target on a mesh,
  // even when only one target is keyed, so an import legitimately produces
  // tracks that never change. Report them: a timeline full of flat tracks
  // otherwise looks like the import read zeroes by mistake.
  const constantTracks = tracks.filter((track) => {
    if (track.keyframes.length === 0) {
      return false;
    }
    const first = track.keyframes[0]!.value;
    return track.keyframes.every(
      (keyframe) => Math.abs(keyframe.value - first) < 1e-9,
    );
  });
  if (constantTracks.length > 0) {
    const names = constantTracks
      .map((track) => `${track.channel} (=${track.keyframes[0]!.value})`)
      .sort();
    diagnostics.push({
      severity: "info",
      code: "constant-tracks",
      message:
        `${constantTracks.length} of ${tracks.length} imported track(s) hold a ` +
        `single value for the whole clip and will not produce motion: ${names.join(", ")}.`,
      remediation:
        "This usually means the source only keyed some of a mesh's morph targets; glTF stores all of them in one channel.",
    });
  }

  const clips: AnimationClipIR[] = [];
  if (tracks.length > 0) {
    // Per-action fragments share one timeline, so duration is the latest key
    // across all of them and NO per-animation time shift is applied — shifting
    // each fragment to zero would collapse the choreography.
    const duration = tracks.reduce((max, track) => {
      const last = track.keyframes[track.keyframes.length - 1];
      return last && last.time > max ? last.time : max;
    }, 0);

    clips.push(
      compileAnimationClipIr({
        clip: {
          schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
          id: options.clipId ?? "gltf-import",
          name: options.clipName ?? "Imported GLB Animation",
          duration,
          tracks,
          metadata: {
            source: "gltf-native-animation",
            grouping,
            sourceAnimationCount: sourceAnimations,
          },
        },
      }),
    );
  }

  const unresolvedChannels = [...unresolvedByReason.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    clips,
    grouping,
    diagnostics,
    stats: {
      sourceAnimations,
      scalarChannels,
      resolvedChannels: resolved.length,
      unresolvedChannels,
      keyframes,
    },
  };
}

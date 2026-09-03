import type { StandardRigInput } from "@vizij/utils";
import type { AnimationClipIR } from "../types/animationClipIr";

/**
 * Reconciling imported curve extents with the target inputs' declared ranges.
 *
 * A propsrig input's range is inferred from a single rest value (see
 * `computeScaleBounds` / `computeTranslationBounds` in `@vizij/utils`, and the
 * hard `±π` bound on euler). One static sample cannot bound a curve, and the
 * rig graph clamps each channel to its input range — so an imported animation
 * that leaves the range is silently flattened.
 *
 * Real animation data is better evidence of a channel's true extent than a
 * rest sample, so the range is widened to admit the curve. That is lossless:
 * clamping would destroy motion and normalizing would change it.
 */

export interface InputRangeAdjustment {
  inputId: string;
  channel: string;
  current: { min: number; max: number };
  next: { min: number; max: number };
  /** Extent the imported curve actually spans. */
  curve: { min: number; max: number };
}

export interface InputRangeFitResult {
  adjustments: InputRangeAdjustment[];
  /** Channels with no resolvable target input; reported, not silently ignored. */
  unresolvedChannels: string[];
}

function normalizeChannel(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

/**
 * Computes the range widenings needed for a set of clips to play unclamped.
 *
 * Pure: takes the clips and the current inputs, returns what would have to
 * change. Applying it is the caller's decision, because input ranges are
 * authored state that ends up in the exported rig.
 */
export function computeInputRangeFit(options: {
  clips: ReadonlyArray<AnimationClipIR>;
  inputsById: ReadonlyMap<string, StandardRigInput>;
  /**
   * Fractional headroom added beyond the curve's extent, so a value sitting
   * exactly on the boundary is not at the mercy of float rounding in the
   * clamp. Defaults to 1%.
   */
  headroom?: number;
}): InputRangeFitResult {
  const { clips, inputsById } = options;
  const headroom = options.headroom ?? 0.01;

  // Widen once per input, across every clip that drives it.
  const extents = new Map<
    string,
    { channel: string; min: number; max: number }
  >();
  const unresolved = new Set<string>();

  const byPath = new Map<string, StandardRigInput>();
  inputsById.forEach((input) => {
    const path = normalizeChannel(input.path ?? "");
    if (path && !byPath.has(path)) {
      byPath.set(path, input);
    }
  });

  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (track.detached || track.keyframes.length === 0) {
        continue;
      }
      const input =
        inputsById.get(track.variableId) ??
        byPath.get(normalizeChannel(track.channel)) ??
        null;
      if (!input) {
        unresolved.add(track.channel);
        continue;
      }

      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const keyframe of track.keyframes) {
        if (!Number.isFinite(keyframe.value)) {
          continue;
        }
        min = Math.min(min, keyframe.value);
        max = Math.max(max, keyframe.value);
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        continue;
      }

      const existing = extents.get(input.id);
      extents.set(input.id, {
        channel: existing?.channel ?? track.channel,
        min: Math.min(existing?.min ?? min, min),
        max: Math.max(existing?.max ?? max, max),
      });
    }
  }

  const adjustments: InputRangeAdjustment[] = [];
  extents.forEach((extent, inputId) => {
    const input = inputsById.get(inputId);
    if (!input) {
      return;
    }
    const current = { min: input.range.min, max: input.range.max };
    const needsLower = extent.min < current.min;
    const needsUpper = extent.max > current.max;
    if (!needsLower && !needsUpper) {
      return;
    }

    // Pad by a fraction of the span so a boundary value survives clamping.
    const span = Math.max(Math.abs(extent.max - extent.min), 1e-6);
    const pad = span * headroom;
    adjustments.push({
      inputId,
      channel: extent.channel,
      current,
      next: {
        min: needsLower ? extent.min - pad : current.min,
        max: needsUpper ? extent.max + pad : current.max,
      },
      curve: { min: extent.min, max: extent.max },
    });
  });

  adjustments.sort((left, right) => left.channel.localeCompare(right.channel));

  return {
    adjustments,
    unresolvedChannels: [...unresolved].sort(),
  };
}

/** One-line summary of a widening, for diagnostics. */
export function describeRangeAdjustment(
  adjustment: InputRangeAdjustment,
): string {
  const fmt = (value: number) => Number(value.toFixed(4)).toString();
  return `${adjustment.channel}: [${fmt(adjustment.current.min)}, ${fmt(
    adjustment.current.max,
  )}] -> [${fmt(adjustment.next.min)}, ${fmt(adjustment.next.max)}] (curve spans ${fmt(
    adjustment.curve.min,
  )}..${fmt(adjustment.curve.max)})`;
}

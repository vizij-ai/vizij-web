import { describe, expect, it } from "vitest";
import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import { computeInputRangeFit, describeRangeAdjustment } from "..";
import type {
  AnimationClipIR,
  AnimationTrackIR,
} from "../../types/animationClipIr";

function input(
  path: string,
  range: { min: number; max: number },
  defaultValue = 0,
): StandardRigInput {
  return createStandardRigInput({
    path,
    label: path,
    group: "test",
    defaultValue,
    range,
  });
}

function inputsById(...inputs: StandardRigInput[]) {
  return new Map(inputs.map((entry) => [entry.id, entry]));
}

function track(
  channel: string,
  values: number[],
  overrides: Partial<AnimationTrackIR> = {},
): AnimationTrackIR {
  return {
    id: channel,
    // Matches deriveStandardRigInputIdFromPath.
    variableId: channel.replace(/^\/+/, "").replace(/\//g, "_"),
    channel,
    interpolation: "linear",
    keyframes: values.map((value, index) => ({
      id: `${channel}:${index}`,
      time: index,
      value,
    })),
    ...overrides,
  };
}

function clip(tracks: AnimationTrackIR[]): AnimationClipIR {
  return { schemaVersion: 1, id: "c", duration: tracks.length, tracks };
}

describe("computeInputRangeFit", () => {
  it("leaves an in-range curve alone", () => {
    const scale = input("/propsrig/l_eye/scale/x", { min: 0, max: 25.424 }, 25);
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/l_eye/scale/x", [21.1, 25.4])])],
      inputsById: inputsById(scale),
    });
    expect(result.adjustments).toEqual([]);
    expect(result.unresolvedChannels).toEqual([]);
  });

  it("widens the minimum for a curve below its range", () => {
    // The real case: mirrored geometry has negative rest scale, so the derived
    // range starts at rest and the animation dips below it.
    const highlight = input(
      "/propsrig/l_eyehighlight/scale/x",
      { min: -0.022, max: 2 },
      -0.022,
    );
    const result = computeInputRangeFit({
      clips: [
        clip([track("propsrig/l_eyehighlight/scale/x", [-0.022, -0.038])]),
      ],
      inputsById: inputsById(highlight),
    });
    expect(result.adjustments).toHaveLength(1);
    const adjustment = result.adjustments[0]!;
    expect(adjustment.next.min).toBeLessThan(-0.038);
    // The upper bound is untouched: only what is needed moves.
    expect(adjustment.next.max).toBe(2);
    expect(adjustment.curve).toEqual({ min: -0.038, max: -0.022 });
  });

  it("widens the maximum for a curve above its range", () => {
    const eye = input("/propsrig/r_eye/scale/x", { min: 0, max: 6.567 }, 6.567);
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/r_eye/scale/x", [5.471, 6.584])])],
      inputsById: inputsById(eye),
    });
    const adjustment = result.adjustments[0]!;
    expect(adjustment.next.min).toBe(0);
    expect(adjustment.next.max).toBeGreaterThan(6.584);
  });

  it("widens both ends when the curve exceeds both", () => {
    const rotation = input(
      "/propsrig/ltlid/rotation/x",
      { min: -Math.PI, max: Math.PI },
      0,
    );
    const result = computeInputRangeFit({
      clips: [
        // Unwrapped rotation intentionally leaves ±π to stay continuous.
        clip([track("propsrig/ltlid/rotation/x", [-4, 4])]),
      ],
      inputsById: inputsById(rotation),
    });
    const adjustment = result.adjustments[0]!;
    expect(adjustment.next.min).toBeLessThan(-4);
    expect(adjustment.next.max).toBeGreaterThan(4);
  });

  it("adds headroom so a boundary value is not left on the clamp edge", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/a/scale/x", [0, 2])])],
      inputsById: inputsById(scale),
      headroom: 0.5,
    });
    // Curve spans 2, so half of that is added beyond the top.
    expect(result.adjustments[0]!.next.max).toBeCloseTo(3, 6);
  });

  it("honours a zero headroom request", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/a/scale/x", [0, 2])])],
      inputsById: inputsById(scale),
      headroom: 0,
    });
    expect(result.adjustments[0]!.next.max).toBe(2);
  });

  it("widens once per input across several clips", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [
        clip([track("propsrig/a/scale/x", [0, 5])]),
        clip([track("propsrig/a/scale/x", [-3, 0])]),
      ],
      inputsById: inputsById(scale),
      headroom: 0,
    });
    expect(result.adjustments).toHaveLength(1);
    // The union of both clips' extents, not just the last one seen.
    expect(result.adjustments[0]!.curve).toEqual({ min: -3, max: 5 });
  });

  it("resolves a target by channel path when the variableId does not match", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [
        clip([track("propsrig/a/scale/x", [0, 5], { variableId: "stale-id" })]),
      ],
      inputsById: inputsById(scale),
    });
    expect(result.adjustments).toHaveLength(1);
    expect(result.unresolvedChannels).toEqual([]);
  });

  it("reports channels with no target input", () => {
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/missing/scale/x", [0, 5])])],
      inputsById: inputsById(),
    });
    expect(result.adjustments).toEqual([]);
    expect(result.unresolvedChannels).toEqual(["propsrig/missing/scale/x"]);
  });

  it("ignores detached and empty tracks", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [
        clip([
          track("propsrig/a/scale/x", [0, 99], { detached: true }),
          track("propsrig/a/scale/x", []),
        ]),
      ],
      inputsById: inputsById(scale),
    });
    expect(result.adjustments).toEqual([]);
  });

  it("skips non-finite keyframe values without poisoning the extent", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const result = computeInputRangeFit({
      clips: [clip([track("propsrig/a/scale/x", [0, Number.NaN, 2])])],
      inputsById: inputsById(scale),
      headroom: 0,
    });
    expect(result.adjustments[0]!.curve).toEqual({ min: 0, max: 2 });
  });

  it("describes an adjustment readably", () => {
    const scale = input("/propsrig/a/scale/x", { min: 0, max: 1 }, 1);
    const { adjustments } = computeInputRangeFit({
      clips: [clip([track("propsrig/a/scale/x", [0, 2])])],
      inputsById: inputsById(scale),
      headroom: 0,
    });
    expect(describeRangeAdjustment(adjustments[0]!)).toBe(
      "propsrig/a/scale/x: [0, 1] -> [0, 2] (curve spans 0..2)",
    );
  });
});

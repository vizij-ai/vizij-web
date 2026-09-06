import { describe, expect, it } from "vitest";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
  type AnimationTrackIR,
} from "../types/animationClipIr";
import { poseFromClipAtTime } from "./poseFromClip";

function track(
  variableId: string,
  keyframes: Array<[number, number]>,
  overrides: Partial<AnimationTrackIR> = {},
): AnimationTrackIR {
  return {
    id: `t-${variableId}`,
    variableId,
    channel: `/propsrig/${variableId}`,
    interpolation: "linear",
    keyframes: keyframes.map(([time, value], index) => ({
      id: `k${index}`,
      time,
      value,
    })),
    ...overrides,
  };
}

function clip(...tracks: AnimationTrackIR[]): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: "clip.1",
    name: "Clip",
    duration: 2,
    tracks,
  };
}

const KNOWN = new Set(["lids_blink", "gaze_left_right", "mouth_open"]);

describe("poseFromClipAtTime", () => {
  it("samples each animated input at the requested time", () => {
    const result = poseFromClipAtTime({
      clip: clip(
        track("lids_blink", [
          [0, 0],
          [2, 1],
        ]),
        track("gaze_left_right", [
          [0, -1],
          [2, 1],
        ]),
      ),
      time: 1,
      knownInputIds: KNOWN,
    });

    expect(result.values).toEqual({ lids_blink: 0.5, gaze_left_right: 0 });
    expect(result.unresolvedChannels).toEqual([]);
  });

  it("takes the pose at a frame without needing playback", () => {
    // The point of sampling rather than reading the runtime: a pose can be
    // taken from a frame the transport has never visited.
    const result = poseFromClipAtTime({
      clip: clip(
        track("lids_blink", [
          [0, 0],
          [1, 1],
          [2, 0],
        ]),
      ),
      time: 1,
      knownInputIds: KNOWN,
    });
    expect(result.values.lids_blink).toBe(1);
  });

  it("holds flat outside the clip's key range", () => {
    const source = clip(
      track("lids_blink", [
        [0.5, 0.25],
        [1.5, 0.75],
      ]),
    );
    expect(
      poseFromClipAtTime({ clip: source, time: 0, knownInputIds: KNOWN }).values
        .lids_blink,
    ).toBe(0.25);
    expect(
      poseFromClipAtTime({ clip: source, time: 99, knownInputIds: KNOWN })
        .values.lids_blink,
    ).toBe(0.75);
  });

  it("captures only the animated inputs by default, so the pose composes", () => {
    // A pose that pinned every input would override things the clip never
    // touched.
    const result = poseFromClipAtTime({
      clip: clip(track("lids_blink", [[0, 1]])),
      time: 0,
      knownInputIds: KNOWN,
      baseValues: { mouth_open: 0.8, gaze_left_right: -0.2 },
    });

    expect(result.values).toEqual({ lids_blink: 1 });
  });

  it('overlays onto the current values when scope is "all"', () => {
    const result = poseFromClipAtTime({
      clip: clip(track("lids_blink", [[0, 1]])),
      time: 0,
      knownInputIds: KNOWN,
      baseValues: { mouth_open: 0.8, lids_blink: 0 },
      scope: "all",
    });

    expect(result.values).toEqual({ mouth_open: 0.8, lids_blink: 1 });
  });

  it("reports channels with no matching input instead of inventing one", () => {
    // A clip authored against another rig, or a renamed input.
    const result = poseFromClipAtTime({
      clip: clip(
        track("lids_blink", [[0, 1]]),
        track("not_a_real_input", [[0, 0.5]]),
      ),
      time: 0,
      knownInputIds: KNOWN,
    });

    expect(result.values).toEqual({ lids_blink: 1 });
    expect(result.unresolvedChannels).toEqual(["/propsrig/not_a_real_input"]);
  });

  it("skips detached tracks without reporting them as unresolved", () => {
    // Detached tracks are deliberately retained for re-attachment; they are
    // not an error, they just cannot contribute a value.
    const result = poseFromClipAtTime({
      clip: clip(
        track("lids_blink", [[0, 1]]),
        track("gaze_left_right", [[0, 0.5]], { detached: true }),
      ),
      time: 0,
      knownInputIds: KNOWN,
    });

    expect(result.values).toEqual({ lids_blink: 1 });
    expect(result.unresolvedChannels).toEqual([]);
  });

  it("skips tracks with no keyframes", () => {
    const result = poseFromClipAtTime({
      clip: clip(track("lids_blink", []), track("mouth_open", [[0, 0.3]])),
      time: 0,
      knownInputIds: KNOWN,
    });
    expect(result.values).toEqual({ mouth_open: 0.3 });
  });

  it("honours step interpolation", () => {
    const result = poseFromClipAtTime({
      clip: clip(
        track(
          "lids_blink",
          [
            [0, 0],
            [2, 1],
          ],
          { interpolation: "step" },
        ),
      ),
      time: 1.9,
      knownInputIds: KNOWN,
    });
    expect(result.values.lids_blink).toBe(0);
  });

  it("returns an empty pose for an empty clip rather than failing", () => {
    const result = poseFromClipAtTime({
      clip: clip(),
      time: 0,
      knownInputIds: KNOWN,
    });
    expect(result.values).toEqual({});
    expect(result.unresolvedChannels).toEqual([]);
  });
});

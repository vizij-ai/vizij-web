import { describe, expect, it } from "vitest";
import { Euler, Quaternion } from "three";
import {
  bakeClipToTrackSpecs,
  createBakeTargetIndex,
  type BakeTargetElement,
} from "..";
import type {
  AnimationClipIR,
  AnimationTrackIR,
} from "../../types/animationClipIr";

type Quat = InstanceType<typeof Quaternion>;

function element(
  overrides: Partial<BakeTargetElement> = {},
): BakeTargetElement {
  return {
    elementName: "L_Eye",
    translation: [1, 2, 3],
    rotationEuler: [0, 0, 0],
    scale: [5, 6, 7],
    morphFeatureKeys: ["lid_updn", "curveup"],
    ...overrides,
  };
}

function track(
  channel: string,
  keyframes: Array<[number, number]>,
  overrides: Partial<AnimationTrackIR> = {},
): AnimationTrackIR {
  return {
    id: channel,
    variableId: channel.replace(/\//g, "_"),
    channel,
    interpolation: "linear",
    keyframes: keyframes.map(([time, value], index) => ({
      id: `${channel}:${index}`,
      time,
      value,
    })),
    ...overrides,
  };
}

function clipOf(tracks: AnimationTrackIR[], duration = 2): AnimationClipIR {
  return { schemaVersion: 1, id: "c", name: "c", duration, tracks };
}

const targets = createBakeTargetIndex([element()]);

describe("bakeClipToTrackSpecs", () => {
  it("recombines per-component tracks into a stride-3 vector track", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/scale/x", [
          [0, 10],
          [1, 20],
        ]),
        track("propsrig/l_eye/scale/y", [
          [0, 30],
          [1, 40],
        ]),
        track("propsrig/l_eye/scale/z", [
          [0, 50],
          [1, 60],
        ]),
      ]),
      targets,
    });

    expect(result.tracks).toHaveLength(1);
    const spec = result.tracks[0]!;
    expect(spec.name).toBe("L_Eye.scale");
    expect(spec.stride).toBe(3);
    expect(spec.times).toEqual([0, 1]);
    expect(spec.values).toEqual([10, 30, 50, 20, 40, 60]);
  });

  it("holds un-animated components at the element's current value", () => {
    // glTF carries a whole vector per key, so a partially animated channel
    // must fill the rest — leaving them at 0 would collapse the element.
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/scale/x", [
          [0, 10],
          [1, 20],
        ]),
      ]),
      targets,
    });
    const spec = result.tracks[0]!;
    // y and z come from the element's scale [_, 6, 7].
    expect(spec.values).toEqual([10, 6, 7, 20, 6, 7]);
  });

  it("unions key times across components and samples the gaps", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/scale/x", [
          [0, 0],
          [2, 20],
        ]),
        track("propsrig/l_eye/scale/y", [
          [1, 100],
          [2, 200],
        ]),
      ]),
      targets,
    });
    const spec = result.tracks[0]!;
    expect(spec.times).toEqual([0, 1, 2]);
    // x interpolates to 10 at t=1; y holds its first key before t=1.
    expect(spec.values).toEqual([0, 100, 7, 10, 100, 7, 20, 200, 7]);
  });

  it("converts euler rotation to a stride-4 quaternion track", () => {
    const angle = Math.PI / 5;
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/rotation/z", [
          [0, 0],
          [1, angle],
        ]),
      ]),
      targets,
    });
    const spec = result.tracks[0]!;
    expect(spec.name).toBe("L_Eye.quaternion");
    expect(spec.stride).toBe(4);
    expect(result.report.lossy).toContain("euler-to-quaternion");

    const expected: Quat = new Quaternion().setFromEuler(
      new Euler(0, 0, angle, "ZYX"),
    );
    expect(spec.values.slice(4)).toEqual([
      expect.closeTo(expected.x, 10),
      expect.closeTo(expected.y, 10),
      expect.closeTo(expected.z, 10),
      expect.closeTo(expected.w, 10),
    ]);
  });

  it("names morph tracks by feature key, which is how the dictionary is keyed", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/lid_updn/value", [
          [0, 0],
          [1, 1],
        ]),
      ]),
      targets,
    });
    const spec = result.tracks[0]!;
    expect(spec.name).toBe("L_Eye.morphTargetInfluences[lid_updn]");
    expect(spec.stride).toBe(1);
    expect(spec.values).toEqual([0, 1]);
  });

  it("marks cubic morph tracks as resampled to linear", () => {
    // GLTFExporter throws on CUBICSPLINE morph tracks, so they must not
    // survive as cubic.
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track(
          "propsrig/l_eye/lid_updn/value",
          [
            [0, 0],
            [1, 1],
          ],
          { interpolation: "cubic" },
        ),
      ]),
      targets,
    });
    expect(result.report.lossy).toContain("morph-cubic-to-linear");
    expect(result.tracks[0]!.stride).toBe(1);
  });

  it("reports material channels as unbakeable rather than dropping them", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/opacity/value", [
          [0, 0],
          [1, 1],
        ]),
        track("propsrig/l_eye/color/x", [
          [0, 0],
          [1, 1],
        ]),
      ]),
      targets,
    });
    expect(result.tracks).toEqual([]);
    expect(result.report.skipped).toEqual([
      { channel: "propsrig/l_eye/color/x", reason: "material-channel" },
      { channel: "propsrig/l_eye/opacity/value", reason: "material-channel" },
    ]);
  });

  it("reports semantic channels as needing graph sampling", () => {
    // These are what real authored clips contain; they only become node
    // motion once the rig and pose graphs run.
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("lids_blink", [
          [0, 0],
          [1, 1],
        ]),
        track("poses/pose_d_happy_d.weight", [
          [0, 0],
          [1, 1],
        ]),
        track("gaze/left_right", [
          [0, 0],
          [1, 1],
        ]),
      ]),
      targets,
    });
    expect(result.tracks).toEqual([]);
    expect(result.report.skipped.map((entry) => entry.reason)).toEqual([
      "needs-graph-sampling",
      "needs-graph-sampling",
      "needs-graph-sampling",
    ]);
  });

  it("reports unknown elements and features", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/not_here/scale/x", [[0, 1]]),
        track("propsrig/l_eye/mystery/value", [[0, 1]]),
      ]),
      targets,
    });
    expect(result.report.skipped).toEqual([
      { channel: "propsrig/l_eye/mystery/value", reason: "unknown-feature" },
      { channel: "propsrig/not_here/scale/x", reason: "unknown-element" },
    ]);
  });

  it("excludes detached and empty tracks, with a reason", () => {
    const result = bakeClipToTrackSpecs({
      clip: clipOf([
        track("propsrig/l_eye/scale/x", [[0, 1]], { detached: true }),
        track("propsrig/l_eye/scale/y", []),
      ]),
      targets,
    });
    expect(result.tracks).toEqual([]);
    expect(result.report.skipped).toEqual([
      { channel: "propsrig/l_eye/scale/x", reason: "detached" },
      { channel: "propsrig/l_eye/scale/y", reason: "no-keyframes" },
    ]);
  });

  it("lists baked channels so the report accounts for every track", () => {
    const clip = clipOf([
      track("propsrig/l_eye/scale/x", [[0, 1]]),
      track("propsrig/l_eye/lid_updn/value", [[0, 1]]),
      track("propsrig/l_eye/opacity/value", [[0, 1]]),
      track("lids_blink", [[0, 1]]),
    ]);
    const result = bakeClipToTrackSpecs({ clip, targets });
    const accounted =
      result.report.bakedChannels.length + result.report.skipped.length;
    expect(accounted).toBe(clip.tracks.length);
  });
});

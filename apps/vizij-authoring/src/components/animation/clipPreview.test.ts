// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AnimationTrack } from "../../state/animationStore";
import {
  clipInputValuesAtTime,
  latestScrubPreview,
  scrubPreviewValues,
} from "./clipPreview";

function track(
  variableId: string,
  keyframes: Array<[number, number]>,
  overrides: Partial<AnimationTrack> = {},
): AnimationTrack {
  return {
    id: `t-${variableId}`,
    label: variableId,
    variableId,
    channel: `propsrig/${variableId}`,
    color: "#fff",
    interpolation: "linear",
    keyframes: keyframes.map(([time, value], index) => ({
      id: `k${index}`,
      time,
      value,
    })),
    ...overrides,
  } as AnimationTrack;
}

describe("clipInputValuesAtTime", () => {
  it("evaluates every attached track at the given time", async () => {
    const values = await clipInputValuesAtTime(
      [
        track("lids_blink", [
          [0, 0],
          [2, 1],
        ]),
        track("gaze_left_right", [
          [0, -1],
          [2, 1],
        ]),
      ],
      1,
    );
    expect(values).toEqual({
      lids_blink: expect.closeTo(0.5, 12),
      gaze_left_right: expect.closeTo(0, 12),
    });
  });

  it("holds flat outside the key range, matching playback", async () => {
    const only = [track("lids_blink", [[1, 0.4]])];
    expect((await clipInputValuesAtTime(only, 0)).lids_blink).toBe(0.4);
    expect((await clipInputValuesAtTime(only, 99)).lids_blink).toBe(0.4);
  });

  it("skips a detached track, which has no input on this face", async () => {
    const values = await clipInputValuesAtTime(
      [
        track("lids_blink", [[0, 1]]),
        track("gone", [[0, 1]], { detached: true }),
      ],
      0,
    );
    expect(values).toEqual({ lids_blink: 1 });
  });

  it("skips a track with no keyframes rather than writing zero", async () => {
    // Writing 0 would yank an input the clip never animates.
    expect(await clipInputValuesAtTime([track("lids_blink", [])], 0)).toEqual(
      {},
    );
  });

  it("ignores a track with no input id", async () => {
    expect(await clipInputValuesAtTime([track("  ", [[0, 1]])], 0)).toEqual({});
  });

  it("returns nothing for an empty clip", async () => {
    expect(await clipInputValuesAtTime([], 1)).toEqual({});
  });
});

describe("scrubPreviewValues", () => {
  const tracks = [
    track("lids_blink", [
      [0, 0],
      [2, 1],
    ]),
  ];

  it("writes the sampled values while stopped or paused", async () => {
    for (const playbackState of ["stopped", "paused"] as const) {
      expect(
        await scrubPreviewValues({ tracks, time: 1, playbackState }),
        playbackState,
      ).toEqual({ lids_blink: 0.5 });
    }
  });

  it("writes nothing while playing, so it does not race the runtime", async () => {
    expect(
      await scrubPreviewValues({ tracks, time: 1, playbackState: "playing" }),
    ).toBeNull();
  });

  it("writes nothing when the clip contributes no values", async () => {
    // Otherwise every pointer move over an empty timeline issues an empty
    // batch.
    expect(
      await scrubPreviewValues({
        tracks: [],
        time: 1,
        playbackState: "stopped",
      }),
    ).toBeNull();
    expect(
      await scrubPreviewValues({
        tracks: [track("lids_blink", [])],
        time: 1,
        playbackState: "stopped",
      }),
    ).toBeNull();
  });
});

describe("latestScrubPreview", () => {
  /** A sampling whose answer the test releases. */
  function deferred() {
    let resolve!: (values: Record<string, number> | null) => void;
    const promise = new Promise<Record<string, number> | null>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("applies only the latest scrub's values when an earlier one answers last", async () => {
    const answers = [deferred(), deferred()];
    const applied: Record<string, number>[] = [];
    const preview = latestScrubPreview({
      sample: (time) => answers[time]!.promise,
      apply: (values) => applied.push(values),
      isPlaying: () => false,
      onError: (error) => {
        throw error;
      },
    });

    const first = preview(0);
    const second = preview(1);
    answers[1]!.resolve({ lids_blink: 1 });
    await second;
    answers[0]!.resolve({ lids_blink: 0 });
    await first;

    expect(applied).toEqual([{ lids_blink: 1 }]);
  });

  it("applies nothing once playback has started meanwhile", async () => {
    const answer = deferred();
    let playing = false;
    const applied: Record<string, number>[] = [];
    const preview = latestScrubPreview({
      sample: () => answer.promise,
      apply: (values) => applied.push(values),
      isPlaying: () => playing,
      onError: (error) => {
        throw error;
      },
    });

    const scrub = preview(0);
    playing = true;
    answer.resolve({ lids_blink: 1 });
    await scrub;

    expect(applied).toEqual([]);
  });

  it("reports a sampling that fails", async () => {
    const errors: unknown[] = [];
    const preview = latestScrubPreview({
      sample: () => Promise.reject(new Error("refused")),
      apply: () => {},
      isPlaying: () => false,
      onError: (error) => errors.push(error),
    });

    await preview(0);

    expect(errors).toEqual([new Error("refused")]);
  });
});

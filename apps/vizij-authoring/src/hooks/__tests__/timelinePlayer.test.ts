import { describe, expect, it, vi } from "vitest";
import type { PlayerState, Runtime } from "@vizij/runtime";
import { pauseTimeline, playTimeline, shownTimeline } from "../timelinePlayer";

// The fake device reports its players already decoded.
vi.mock("@vizij/runtime", () => ({
  ANIMATION_PLAYERS_PATH: "vizij/animations/players",
  decodePlayerStates: (value: unknown) => (Array.isArray(value) ? value : []),
}));

function report(state: string, time: number): PlayerState {
  return {
    player: 7,
    name: "authoring.timeline.main",
    state,
    time,
    duration: 5,
    speed: 1,
    loopMode: "loop",
    ended: false,
    window: { start: 0, end: null },
    reversed: false,
    waiting: false,
    instances: [{ instance: 1, anim: 3, weight: 1, startOffset: 0, rate: 1 }],
  };
}

/** A device whose commands resolve when `apply` is called. */
function device(reported: PlayerState) {
  const applied: Array<() => void> = [];
  const runtime = {
    readValues: (paths: string[]) =>
      Object.fromEntries(paths.map((path) => [path, [reported]])),
    invoke: vi.fn(
      () => new Promise<unknown>((resolve) => applied.push(() => resolve({}))),
    ),
  } as unknown as Runtime;
  const apply = async () => {
    applied.splice(0).forEach((resolve) => resolve());
    await Promise.resolve();
    await Promise.resolve();
  };
  return { runtime, apply };
}

describe("shownTimeline", () => {
  it("shows the report when no command is on its way", () => {
    const { runtime } = device(report("playing", 1));
    expect(shownTimeline(runtime, report("playing", 1.5))).toEqual({
      state: "playing",
      time: 1.5,
    });
  });

  it("shows a pause on its way over reports that predate it, then the reports", async () => {
    const { runtime, apply } = device(report("playing", 1));
    void pauseTimeline(runtime);

    expect(shownTimeline(runtime, report("playing", 1.2))).toEqual({
      state: "paused",
      time: 1.2,
    });
    await apply();
    // The report the applying step wrote may still predate the pause.
    expect(shownTimeline(runtime, report("playing", 1.3)).state).toBe("paused");
    expect(shownTimeline(runtime, report("paused", 1.3))).toEqual({
      state: "paused",
      time: 1.3,
    });
    expect(shownTimeline(runtime, report("playing", 2))).toEqual({
      state: "playing",
      time: 2,
    });
  });

  it("shows a resume issued before the pause landed until the resume lands", async () => {
    const { runtime, apply } = device(report("playing", 1));
    void pauseTimeline(runtime);
    void playTimeline(runtime, { time: 1, loop: true, speed: 1 });

    expect(shownTimeline(runtime, report("playing", 1.2))).toEqual({
      state: "playing",
      time: 1,
    });
    await apply();
    shownTimeline(runtime, report("paused", 1));
    expect(shownTimeline(runtime, report("playing", 1.1))).toEqual({
      state: "playing",
      time: 1.1,
    });
  });

  it("shows a play from a seek at the seek's time until it lands", () => {
    const { runtime } = device(report("paused", 0));
    void playTimeline(runtime, { time: 2, loop: true, speed: 1 });

    expect(shownTimeline(runtime, report("paused", 0))).toEqual({
      state: "playing",
      time: 2,
    });
  });
});

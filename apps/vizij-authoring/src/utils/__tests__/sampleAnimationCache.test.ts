// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AnimationTrackIR } from "../../types/animationClipIr";
import { sampleAnimationTracks } from "../sampleAnimation";

/**
 * What the sampler loads: the callers sample different sets of tracks — the
 * scrub every track, a key insert one, a pose its compiled clip's, a bake its
 * own — and loading a long animation costs far more than moving the player
 * between loaded ones, so alternating between sets loads each once.
 */

const device = {
  calls: [] as Array<{ method: string; args: Record<string, unknown> }>,
  refusePlayer: false,
};

vi.mock("@vizij/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("@vizij/runtime")>("@vizij/runtime");
  return {
    ...actual,
    startRuntime: async (...args: Parameters<typeof actual.startRuntime>) => {
      const real = await actual.startRuntime(...args);
      const invoke = (method: string, args: Record<string, unknown> = {}) => {
        device.calls.push({ method, args });
        if (method === "create_player" && device.refusePlayer) {
          device.refusePlayer = false;
          return Promise.resolve({ u32: 0xffff_ffff });
        }
        return real.invoke(method, args as never);
      };
      return new Proxy(real, {
        get(target, property) {
          if (property === "invoke") return invoke;
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
});

function ramp(id: string, to = 1): AnimationTrackIR {
  return {
    id,
    variableId: id,
    channel: id,
    interpolation: "linear",
    keyframes: [
      { id: `${id}0`, time: 0, value: 0 },
      { id: `${id}1`, time: 1, value: to },
    ],
  };
}

/** The calls of `method` since `since` calls were recorded. */
const called = (method: string, since = 0) =>
  device.calls.slice(since).filter((call) => call.method === method);

describe("sampleAnimationTracks' loaded animations", () => {
  it("loads each of two alternating track sets once", async () => {
    const all = [ramp("a", 1), ramp("b", 2)];
    const one = [all[1]!];
    const since = device.calls.length;
    for (let round = 0; round < 3; round += 1) {
      expect(await sampleAnimationTracks(all, [0.5])).toEqual([
        [expect.closeTo(0.5, 10)],
        [expect.closeTo(1, 10)],
      ]);
      expect(await sampleAnimationTracks(one, [0.25])).toEqual([
        [expect.closeTo(0.5, 10)],
      ]);
    }
    expect(called("load_clip", since)).toHaveLength(2);
    expect(called("unload_animation", since)).toHaveLength(0);
  });

  it("loads nothing for tracks of other identities and the same curves", async () => {
    const tracks = [ramp("c", 3)];
    await sampleAnimationTracks(tracks, [0.5]);
    const since = device.calls.length;
    const copy = tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
    }));
    expect(await sampleAnimationTracks(copy, [0.5])).toEqual([
      [expect.closeTo(1.5, 10)],
    ]);
    expect(called("load_clip", since)).toHaveLength(0);
  });

  it("loads an edited track's new curve", async () => {
    const tracks = [ramp("d", 1)];
    await sampleAnimationTracks(tracks, [0.5]);
    const since = device.calls.length;
    tracks[0] = { ...tracks[0]!, keyframes: ramp("d", 4).keyframes };
    expect(await sampleAnimationTracks(tracks, [0.5])).toEqual([
      [expect.closeTo(2, 10)],
    ]);
    expect(called("load_clip", since)).toHaveLength(1);
  });

  it("keeps four animations, unloading the longest unused", async () => {
    const sets = [1, 2, 3, 4, 5].map((to) => [ramp(`e${to}`, to)]);
    await sampleAnimationTracks(sets[0]!, [0.5]);
    const since = device.calls.length;
    for (const set of sets.slice(1)) {
      await sampleAnimationTracks(set, [0.5]);
    }
    expect(called("unload_animation", since)).toHaveLength(1);
    // The four most recent are still loaded; the first loads again.
    const kept = device.calls.length;
    for (const set of sets.slice(1)) {
      await sampleAnimationTracks(set, [0.5]);
    }
    expect(called("load_clip", kept)).toHaveLength(0);
    expect(await sampleAnimationTracks(sets[0]!, [0.5])).toEqual([
      [expect.closeTo(0.5, 10)],
    ]);
    expect(called("load_clip", kept)).toHaveLength(1);
  });

  it("unloads every animation after a failure, and samples again", async () => {
    const first = [ramp("f", 1)];
    await sampleAnimationTracks(first, [0.5]);
    device.refusePlayer = true;
    const since = device.calls.length;
    await expect(sampleAnimationTracks([ramp("g", 7)], [0.5])).rejects.toThrow(
      "refused a player",
    );
    expect(called("unload_animation", since).length).toBeGreaterThanOrEqual(2);
    expect(called("create_player", since)).toHaveLength(1);
    expect(await sampleAnimationTracks(first, [0.5])).toEqual([
      [expect.closeTo(0.5, 10)],
    ]);
    expect(called("load_clip", since)).toHaveLength(2);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Runtime } from "@vizij/runtime";
import type { AnimationTrackIR } from "../../types/animationClipIr";
import { sampleAnimationTracks } from "../sampleAnimation";

/**
 * How the sampler fails: each case below makes the device or the animation
 * module answer as it would on a fault, and the sampling must reject, name
 * what went wrong, leave nothing loaded behind, and sample again afterwards.
 */

/** One-shot faults the device below plays out, and the calls it saw. */
const device = {
  startFails: false,
  refusePlayer: false,
  rejectStep: false,
  stepWithoutNumber: false,
  stepRevision: false,
  keysWithoutTrack: false,
  /** Set when `moduleAnimation` is handed an animation this long. */
  stopLoadingAbove: Number.POSITIVE_INFINITY,
  calls: [] as Array<{ method: string; args: Record<string, unknown> }>,
  /** What each `load_clip` answered: the animation's id. */
  loadedAnims: [] as unknown[],
};

type Struct = { struct: { fields: Array<{ id: string; value: unknown }> } };
const fieldsOf = (value: unknown) => (value as Struct).struct.fields;

vi.mock("@vizij/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("@vizij/runtime")>("@vizij/runtime");
  return {
    ...actual,
    startRuntime: async (...args: Parameters<typeof actual.startRuntime>) => {
      if (device.startFails) {
        device.startFails = false;
        throw new Error("the device did not start");
      }
      const real = await actual.startRuntime(...args);
      const invoke = (method: string, args: Record<string, unknown> = {}) => {
        device.calls.push({ method, args });
        if (method === "create_player" && device.refusePlayer) {
          device.refusePlayer = false;
          return Promise.resolve({ u32: 0xffff_ffff });
        }
        // Queued now, as the real call is, so the order of calls holds.
        const answer = real.invoke(method, args as never);
        if (method === "load_clip") {
          void answer.then((anim) => device.loadedAnims.push(anim));
        }
        if (method === "step_values" && device.rejectStep) {
          device.rejectStep = false;
          return answer.then(() => {
            throw new Error("the step was refused");
          });
        }
        if (method === "step_values" && device.stepWithoutNumber) {
          device.stepWithoutNumber = false;
          return answer.then((step) => {
            const values = fieldsOf(step)[1]!.value as { values: unknown[] };
            values.values = values.values.map(() => ({ unit: null }));
            return step;
          });
        }
        if (method === "step_values" && device.stepRevision) {
          device.stepRevision = false;
          return answer.then((step) => {
            fieldsOf(step)[0]!.value = { u32: 999 };
            return step;
          });
        }
        if (method === "output_keys" && device.keysWithoutTrack) {
          device.keysWithoutTrack = false;
          return answer.then((table) => {
            fieldsOf(table)[1]!.value = { strs: [] };
            return table;
          });
        }
        return answer;
      };
      const moduleAnimation = (
        animation: Parameters<Runtime["moduleAnimation"]>[0],
      ) => {
        const keys = animation.tracks.reduce(
          (count, track) => count + track.keyframes.length,
          0,
        );
        if (keys > device.stopLoadingAbove) {
          throw new Error(`stopped before loading ${keys} keyframes`);
        }
        return real.moduleAnimation(animation);
      };
      return new Proxy(real, {
        get(target, property) {
          if (property === "invoke") return invoke;
          if (property === "moduleAnimation") return moduleAnimation;
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

/** A sampling that works, after a fault. */
async function samplesAgain() {
  expect(await sampleAnimationTracks([ramp("after", 2)], [0.5])).toEqual([
    [expect.closeTo(1, 10)],
  ]);
}

const called = (method: string) =>
  device.calls.filter((call) => call.method === method);

describe("sampleAnimationTracks, when something fails", () => {
  // First: the device is started once, on the first sampling.
  it("starts the device again after a start that failed", async () => {
    device.startFails = true;
    await expect(sampleAnimationTracks([ramp("a")], [0.5])).rejects.toThrow(
      "the device did not start",
    );
    await samplesAgain();
  });

  it("unloads the animation when the module refuses its player", async () => {
    device.calls = [];
    device.refusePlayer = true;
    await expect(sampleAnimationTracks([ramp("b")], [0.5])).rejects.toThrow(
      "refused a player",
    );
    expect(called("load_clip")).toHaveLength(1);
    expect(called("unload_animation").at(-1)?.args.anim).toEqual(
      device.loadedAnims.at(-1),
    );
    await samplesAgain();
  });

  it("rejects, observing every answer, when one step is refused", async () => {
    device.rejectStep = true;
    await expect(
      sampleAnimationTracks([ramp("c")], [0.25, 0.5, 0.75]),
    ).rejects.toThrow("the step was refused");
    await samplesAgain();
  });

  it("rejects a step whose values are not numbers, rather than reading zeros", async () => {
    device.stepWithoutNumber = true;
    await expect(sampleAnimationTracks([ramp("d")], [0.5])).rejects.toThrow(
      "gave track 0 no number",
    );
    await samplesAgain();
  });

  it("rejects a step of another output table", async () => {
    device.stepRevision = true;
    await expect(sampleAnimationTracks([ramp("e")], [0.5])).rejects.toThrow(
      "output table is not the one the animation loaded with",
    );
    await samplesAgain();
  });

  it("rejects an output table that gives a track no output", async () => {
    device.keysWithoutTrack = true;
    await expect(sampleAnimationTracks([ramp("f")], [0.5])).rejects.toThrow(
      "gave track 0 no output",
    );
    await samplesAgain();
  });

  it("rejects a time that is not a finite number", async () => {
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(sampleAnimationTracks([ramp("g")], [time])).rejects.toThrow(
        RangeError,
      );
    }
    await samplesAgain();
  });

  it("rejects a keyframe that is not a finite number, naming its track", async () => {
    const broken = ramp("h");
    broken.keyframes = [
      ...broken.keyframes,
      { id: "h2", time: 2, value: Number.NaN },
    ];
    await expect(sampleAnimationTracks([broken], [0.5])).rejects.toThrow(
      "track h has a keyframe (h2)",
    );
    await samplesAgain();
  });

  it("reads the length of an animation too long to spread into Math.max", async () => {
    // Past ~125k arguments, `Math.max(...times)` overflows the stack.
    const keys = 200_000;
    const long: AnimationTrackIR = {
      ...ramp("long"),
      keyframes: Array.from({ length: keys }, (_, index) => ({
        id: `k${index}`,
        time: index / 60,
        value: index % 2,
      })),
    };
    device.stopLoadingAbove = keys - 1;
    await expect(sampleAnimationTracks([long], [0])).rejects.toThrow(
      `stopped before loading ${keys} keyframes`,
    );
    device.stopLoadingAbove = Number.POSITIVE_INFINITY;
    await samplesAgain();
  });
});

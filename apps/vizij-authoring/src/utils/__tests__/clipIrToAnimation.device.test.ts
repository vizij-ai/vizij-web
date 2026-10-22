// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  composeVizij,
  startRuntime,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";
import { valueAsNumber } from "@vizij/value-json";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../../types/animationClipIr";
import { clipIrToAnimation } from "../animationClipCompiler";
import { sampleTrackAt } from "../sampleAnimationTrack";

/**
 * The timeline's animation, played by a device's animation module, lands
 * where the timeline draws it (`sampleTrackAt`): cubic segments on the
 * keyframes' tangents, a per-key interpolation override, a step.
 */

function authoredClip(): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: "authoring.timeline.main",
    name: "Tangents",
    duration: 2,
    tracks: [
      {
        id: "eased",
        variableId: "eased",
        channel: "eased",
        interpolation: "cubic",
        keyframes: [
          { id: "e0", time: 0, value: 0, outTangent: 4 },
          { id: "e1", time: 0.5, value: 1, inTangent: -2, outTangent: 0 },
          // One tangent: the other side takes the chord slope.
          { id: "e2", time: 1.25, value: 0.25, inTangent: 3 },
          { id: "e3", time: 2, value: 0.75 },
        ],
      },
      {
        id: "mixed",
        variableId: "mixed",
        channel: "mixed",
        interpolation: "linear",
        keyframes: [
          { id: "m0", time: 0, value: 0 },
          {
            id: "m1",
            time: 0.4,
            value: 1,
            interpolation: "cubic",
            outTangent: -6,
          },
          {
            id: "m2",
            time: 1,
            value: 0.5,
            inTangent: 1,
            interpolation: "step",
          },
          { id: "m3", time: 1.6, value: -1 },
          { id: "m4", time: 2, value: 0 },
        ],
      },
    ],
  };
}

const SAMPLE_TIMES = [
  0, 0.1, 0.25, 0.33, 0.45, 0.5, 0.6, 0.8, 0.95, 1.1, 1.3, 1.55, 1.7, 1.9, 2,
];

describe("clipIrToAnimation on a device", () => {
  let runtime: Runtime;
  let player: ValueInput;

  beforeAll(async () => {
    // A device whose graph is the animation source alone: it steps the
    // module and writes each track's key, here the channel itself.
    runtime = await startRuntime(
      await composeVizij(
        { asset: { version: "2.0" }, extensions: { VIZIJ_bundle: {} } },
        { graphs: [], program: "none", animations: true },
      ),
    );
    const { moduleAnimation } = runtime.moduleAnimation(
      clipIrToAnimation(authoredClip()),
    );
    // The ids the module hands out, as it hands them out (`{ u32 }`).
    const anim = (await runtime.invoke("load_clip", {
      clip: moduleAnimation as ValueInput,
    })) as ValueInput;
    player = (await runtime.invoke("create_player", {
      name: "tangents",
    })) as ValueInput;
    await runtime.invoke("add_instance_with_weight", {
      player,
      anim,
      weight: { f32: 1 },
    });
    await runtime.invoke("pause", { player });
  });

  afterAll(() => runtime?.dispose());

  it("plays each track where the timeline samples it", async () => {
    const clip = authoredClip();
    for (const time of SAMPLE_TIMES) {
      await runtime.invoke("seek", {
        player,
        time_ns: { u64: Math.round(time * 1e9) },
      });
      const values = runtime.readValues(clip.tracks.map((t) => t.channel));
      for (const track of clip.tracks) {
        expect(
          valueAsNumber(values[track.channel] as never),
          `${track.channel} at ${time}s`,
        ).toBeCloseTo(sampleTrackAt(track, time), 5);
      }
    }
  });
});

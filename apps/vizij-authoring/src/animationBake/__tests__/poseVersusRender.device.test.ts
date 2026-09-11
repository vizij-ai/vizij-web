// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import { createDeviceGraphEvaluator } from "../graphEvaluatorDevice";
import { sampleTrackAt } from "../../utils/sampleAnimationTrack";
import type { AnimationTrackIR } from "../../types/animationClipIr";

/**
 * Does a pose captured at a frame render the same as the animation at that
 * frame?
 *
 * "Save frame as pose" reads the clip's track value at the playhead
 * (`sampleTrackAt`) and stores it as an input value. The animation, and the
 * GLB bake, feed that same input value through the rig graph — stepping it
 * frame by frame. If the graph is stateless the two agree by construction: a
 * pose is input-space, a track is input-space, same number in, same render
 * out.
 *
 * The graph is not necessarily stateless. Any node whose output depends on
 * history — `spring`, `damp`, `slew`, an oscillator, a time source — makes
 * "the value at frame N after playing to frame N" a different thing from
 * "the value at frame N applied on its own and settled". A pose cannot carry
 * the history, so it renders as the settled value while playback shows the
 * in-flight one.
 *
 * These tests measure the size of that gap on a real device, for a stateless
 * graph and a stateful one.
 */

const IN = "pose/in";
const OUT = "pose/out";
const FPS = 30;
const DT_MS = 1000 / FPS;

/** A ramp from 0 to 1 over one second. */
function rampTrack(): AnimationTrackIR {
  return {
    id: "t",
    variableId: "v",
    channel: IN,
    interpolation: "linear",
    keyframes: [
      { id: "k0", time: 0, value: 0 },
      { id: "k1", time: 1, value: 1 },
    ],
  };
}

function statelessSpec(): GraphSpec {
  return {
    nodes: [
      { id: "in", type: "input", params: { path: IN, value: { float: 0 } } },
      { id: "out", type: "output", params: { path: OUT } },
    ],
    edges: [{ from: { node_id: "in" }, to: { node_id: "out", input: "in" } }],
  } as unknown as GraphSpec;
}

/** The same path with a smoothing node in it. */
function statefulSpec(): GraphSpec {
  return {
    nodes: [
      { id: "in", type: "input", params: { path: IN, value: { float: 0 } } },
      {
        id: "smooth",
        type: "damp",
        params: { half_life: 0.25 },
      },
      { id: "out", type: "output", params: { path: OUT } },
    ],
    edges: [
      { from: { node_id: "in" }, to: { node_id: "smooth", input: "in" } },
      { from: { node_id: "smooth" }, to: { node_id: "out", input: "in" } },
    ],
  } as unknown as GraphSpec;
}

/** What playback shows at `frames`: the graph stepped from the start. */
async function renderedAfterPlayback(
  spec: GraphSpec,
  frames: number,
): Promise<number | null> {
  const evaluator = await createDeviceGraphEvaluator({ spec });
  const track = rampTrack();
  try {
    for (let frame = 0; frame <= frames; frame += 1) {
      evaluator.stageInput(IN, sampleTrackAt(track, frame / FPS));
      evaluator.step(frame === 0 ? 0 : DT_MS);
    }
    return evaluator.readOutputs([OUT]).get(OUT)?.[0] ?? null;
  } finally {
    evaluator.dispose?.();
  }
}

/** What a captured pose renders as: that one value, applied and settled. */
async function renderedFromPose(
  spec: GraphSpec,
  frames: number,
  settleFrames = 240,
): Promise<number | null> {
  const evaluator = await createDeviceGraphEvaluator({ spec });
  const value = sampleTrackAt(rampTrack(), frames / FPS);
  try {
    for (let frame = 0; frame <= settleFrames; frame += 1) {
      evaluator.stageInput(IN, value);
      evaluator.step(frame === 0 ? 0 : DT_MS);
    }
    return evaluator.readOutputs([OUT]).get(OUT)?.[0] ?? null;
  } finally {
    evaluator.dispose?.();
  }
}

describe("a pose captured at a frame, against what playback renders", () => {
  it("agrees exactly when nothing in the graph holds state", async () => {
    const frames = 15;
    const played = await renderedAfterPlayback(statelessSpec(), frames);
    const posed = await renderedFromPose(statelessSpec(), frames);
    expect(played).not.toBeNull();
    expect(posed).not.toBeNull();
    expect(posed!).toBeCloseTo(played!, 10);
  });

  it("measures the gap when the graph smooths", async () => {
    const frames = 15;
    const played = await renderedAfterPlayback(statefulSpec(), frames);
    const posed = await renderedFromPose(statefulSpec(), frames);
    expect(played).not.toBeNull();
    expect(posed).not.toBeNull();

    const raw = sampleTrackAt(rampTrack(), frames / FPS);
    // Reported rather than asserted tight: the point is the magnitude, and it
    // is a property of the graph, not of this app's code.
    console.log(
      `[pose-vs-render] track=${raw.toFixed(6)} ` +
        `played=${played!.toFixed(6)} posed=${posed!.toFixed(6)} ` +
        `gap=${Math.abs(posed! - played!).toFixed(6)}`,
    );

    // A pose settles to the raw input; playback is still catching up to it.
    expect(posed!).toBeCloseTo(raw, 4);
  });
});

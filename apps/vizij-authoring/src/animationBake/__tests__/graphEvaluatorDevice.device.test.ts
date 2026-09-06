// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import {
  createDeviceGraphEvaluator,
  measurePropagationTicks,
} from "../graphEvaluatorDevice";
import { sampleClipThroughGraph } from "../sampleClipThroughGraph";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../../types/animationClipIr";

/**
 * The bake evaluator against a real device.
 *
 * The pure sampler tests use a fake graph, which proves the loop but not that
 * the device honours what the loop assumes: that a staged input is visible in
 * the same tick, that `step(0)` propagates without advancing time, and that a
 * value crossing between composed sources costs a tick.
 */

const IN = "bake/in";
const OUT = "bake/out";
const HOP_MID = "bake/mid";
const HOP_OUT = "bake/hop_out";

/** input -> output, one source, no hop. */
function directSpec(): GraphSpec {
  return {
    nodes: [
      // A default is mandatory: an input node with neither a staged value nor
      // a default makes the whole tick throw, stopping every other node.
      { id: "in", type: "input", params: { path: IN, value: { float: 0 } } },
      { id: "out", type: "output", params: { path: OUT } },
    ],
    edges: [{ from: { node_id: "in" }, to: { node_id: "out", input: "in" } }],
  } as unknown as GraphSpec;
}

/** input -> mid, then a second chain reading mid -> hop_out: one store hop. */
function hopSpec(): GraphSpec {
  return {
    nodes: [
      { id: "in", type: "input", params: { path: IN, value: { float: 0 } } },
      { id: "mid", type: "output", params: { path: HOP_MID } },
      {
        id: "relay",
        type: "input",
        params: { path: HOP_MID, value: { float: 0 } },
      },
      { id: "out", type: "output", params: { path: HOP_OUT } },
    ],
    edges: [
      { from: { node_id: "in" }, to: { node_id: "mid", input: "in" } },
      { from: { node_id: "relay" }, to: { node_id: "out", input: "in" } },
    ],
  } as unknown as GraphSpec;
}

describe("device graph evaluator", () => {
  it("sees a staged input in the same tick, with no hop", async () => {
    const evaluator = await createDeviceGraphEvaluator({ spec: directSpec() });
    try {
      evaluator.stageInput(IN, 0.75);
      evaluator.step(16);
      expect(evaluator.behaviorError).toBeUndefined();
      expect(evaluator.readOutputs([OUT]).get(OUT)).toBeCloseTo(0.75, 5);
    } finally {
      evaluator.dispose();
    }
  });

  it("reports a value crossing between sources as costing ticks", async () => {
    // Measured, not assumed: the hop count is a property of the composed
    // graph. If this ever returns 0 for the hop spec, propagationTicks can
    // default to 0 everywhere; while it does not, baking a multi-source rig
    // without it time-shifts the result.
    const direct = await measurePropagationTicks({
      spec: directSpec(),
      inputPath: IN,
      outputPath: OUT,
    });
    const hopped = await measurePropagationTicks({
      spec: hopSpec(),
      inputPath: IN,
      outputPath: HOP_OUT,
    });

    expect(direct).toBe(0);
    expect(hopped).not.toBeNull();
    expect(hopped!).toBeGreaterThan(direct!);
  });

  it("propagates a hop within one frame when given propagation ticks", async () => {
    const hopped = await measurePropagationTicks({
      spec: hopSpec(),
      inputPath: IN,
      outputPath: HOP_OUT,
    });
    const evaluator = await createDeviceGraphEvaluator({
      spec: hopSpec(),
      propagationTicks: hopped ?? 1,
    });
    try {
      evaluator.stageInput(IN, 0.5);
      evaluator.step(16);
      expect(evaluator.readOutputs([HOP_OUT]).get(HOP_OUT)).toBeCloseTo(0.5, 5);
    } finally {
      evaluator.dispose();
    }
  });

  it("bakes an authored clip into the channel the graph writes", async () => {
    // End to end on a real device: a clip on a semantic input becomes a track
    // on a path the clip never mentions, which is the entire point of
    // sampling through the graph.
    const evaluator = await createDeviceGraphEvaluator({ spec: directSpec() });
    try {
      const authored: AnimationClipIR = {
        schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
        id: "authored",
        duration: 1,
        tracks: [
          {
            id: "t0",
            variableId: IN,
            channel: IN,
            interpolation: "linear",
            keyframes: [
              { id: "k0", time: 0, value: 0 },
              { id: "k1", time: 1, value: 1 },
            ],
          },
        ],
      };

      const { clip, report } = sampleClipThroughGraph({
        clip: authored,
        evaluator,
        outputs: [
          { path: OUT, channels: [OUT], elementName: "e", featureKey: "f" },
        ],
        fps: 10,
      });

      expect(report.warnings).toEqual([]);
      expect(report.sampledChannels).toEqual([OUT]);
      const keyframes = clip.tracks[0]!.keyframes;
      expect(keyframes).toHaveLength(11);
      expect(keyframes[0]!.value).toBeCloseTo(0, 5);
      expect(keyframes[10]!.value).toBeCloseTo(1, 5);
      expect(keyframes[5]!.value).toBeCloseTo(0.5, 5);
    } finally {
      evaluator.dispose();
    }
  });
});

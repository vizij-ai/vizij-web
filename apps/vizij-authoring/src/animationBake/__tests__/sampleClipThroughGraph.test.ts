import { describe, expect, it } from "vitest";
import {
  sampleClipThroughGraph,
  type GraphEvaluator,
} from "../sampleClipThroughGraph";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../../types/animationClipIr";

const IN = "lids_blink";
const OUT_A = "/propsrig/l_lid/translation/y";
const OUT_B = "/propsrig/r_lid/translation/y";

function clip(overrides: Partial<AnimationClipIR> = {}): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: "authored",
    name: "Authored",
    // Seconds. A one-second clip at 10fps is 11 frames, not 11000.
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
    ...overrides,
  };
}

/**
 * A stand-in rig graph. `transform` turns the staged input into the two
 * outputs, so a test can model a pure graph or a stateful one.
 */
function fakeGraph(options?: {
  transform?: (input: number, state: { sum: number }) => [number, number];
  failAtFrame?: number;
  neverWrite?: string[];
}): GraphEvaluator & { steps: number[]; staged: number[] } {
  const transform =
    options?.transform ?? ((input: number) => [input * 2, input * 3]);
  const neverWrite = new Set(options?.neverWrite ?? []);
  const state = { sum: 0 };
  let pending = 0;
  let outputs: [number, number] = [0, 0];
  let frame = 0;
  const self = {
    steps: [] as number[],
    staged: [] as number[],
    behaviorError: undefined as string | undefined,
    stageInput(_path: string, value: number) {
      pending = value;
      self.staged.push(value);
    },
    step(dtMs: number) {
      self.steps.push(dtMs);
      if (options?.failAtFrame === frame) {
        self.behaviorError = "input node missing staged value";
        frame += 1;
        return;
      }
      state.sum += pending;
      outputs = transform(pending, state);
      frame += 1;
    },
    readOutputs(paths: ReadonlyArray<string>) {
      const map = new Map<string, number | null>();
      paths.forEach((path) => {
        if (neverWrite.has(path)) {
          map.set(path, null);
          return;
        }
        map.set(path, path === OUT_A ? outputs[0] : outputs[1]);
      });
      return map;
    },
  };
  return self;
}

describe("sampleClipThroughGraph", () => {
  it("bakes semantic inputs into the node channels the graph writes", () => {
    const evaluator = fakeGraph();
    const { clip: sampled, report } = sampleClipThroughGraph({
      clip: clip(),
      evaluator,
      outputPaths: [OUT_A, OUT_B],
      fps: 10,
    });

    // The whole point of graph sampling: one input track becomes N node
    // channels, none of which the authored clip mentions.
    expect(report.drivenInputs).toEqual([IN]);
    expect(sampled.tracks.map((track) => track.channel).sort()).toEqual(
      [OUT_A, OUT_B].sort(),
    );

    // 1 second at 10fps, inclusive of the final frame.
    expect(report.frameCount).toBe(11);
    const trackA = sampled.tracks.find((track) => track.channel === OUT_A)!;
    expect(trackA.keyframes).toHaveLength(11);

    // Key times are seconds, matching the IR the rest of the bake consumes.
    expect(trackA.keyframes[0]!.time).toBe(0);
    expect(trackA.keyframes[10]!.time).toBeCloseTo(1, 6);
    expect(sampled.duration).toBe(1);

    // input ramps 0..1, OUT_A is 2x.
    expect(trackA.keyframes[10]!.value).toBeCloseTo(2, 6);
    expect(trackA.keyframes[5]!.value).toBeCloseTo(1, 6);
  });

  it("advances by a fixed frame step instead of seeking", () => {
    // A graph node with memory integrates the values it is stepped through,
    // so the recorded curve is only right if the sampler walks every frame.
    // Seeking (or skipping steps) would produce a different, wrong curve.
    const evaluator = fakeGraph({
      transform: (_input, state) => [state.sum, state.sum],
    });
    const { clip: sampled } = sampleClipThroughGraph({
      clip: clip(),
      evaluator,
      outputPaths: [OUT_A],
      fps: 10,
    });

    // 11 frames, and every step after the first is exactly 1/fps in ms.
    expect(evaluator.steps).toHaveLength(11);
    expect(evaluator.steps.slice(1)).toEqual(Array(10).fill(100));

    const values = sampled.tracks[0]!.keyframes.map((key) => key.value);
    // Monotonically accumulating, i.e. the state was carried across frames.
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThan(values[index - 1]!);
    }
    // Sum of 0, 0.1, ... 1.0 — proves each frame's input was staged, in order.
    expect(values[values.length - 1]!).toBeCloseTo(5.5, 6);
  });

  it("drops channels the graph writes but never varies", () => {
    // A constant channel is what the rest pose already says. Emitting it
    // would pin the node and override any other clip that does animate it.
    const evaluator = fakeGraph({ transform: (input) => [input * 2, 0.5] });
    const { clip: sampled, report } = sampleClipThroughGraph({
      clip: clip(),
      evaluator,
      outputPaths: [OUT_A, OUT_B],
      fps: 10,
    });

    expect(report.sampledChannels).toEqual([OUT_A]);
    expect(report.constantChannels).toEqual([OUT_B]);
    expect(sampled.tracks.map((track) => track.channel)).toEqual([OUT_A]);
  });

  it("stops and reports when a graph tick fails", () => {
    // A failing tick stops every node, so continuing would record a whole
    // clip of stale values that looks like a successful bake.
    const evaluator = fakeGraph({ failAtFrame: 4 });
    const { report } = sampleClipThroughGraph({
      clip: clip(),
      evaluator,
      outputPaths: [OUT_A],
      fps: 10,
    });

    const failure = report.warnings.find(
      (warning) => warning.kind === "graph-tick-failed",
    );
    expect(failure).toMatchObject({ frame: 4 });
    expect(evaluator.steps).toHaveLength(5);
  });

  it("reports outputs the graph never wrote instead of baking zeros", () => {
    const evaluator = fakeGraph({ neverWrite: [OUT_B] });
    const { clip: sampled, report } = sampleClipThroughGraph({
      clip: clip(),
      evaluator,
      outputPaths: [OUT_A, OUT_B],
      fps: 10,
    });

    expect(sampled.tracks.map((track) => track.channel)).toEqual([OUT_A]);
    expect(
      report.warnings.find(
        (warning) => warning.kind === "output-never-written",
      ),
    ).toMatchObject({ paths: [OUT_B] });
  });

  it("skips detached tracks and says so when nothing is left to drive", () => {
    const evaluator = fakeGraph();
    const { report } = sampleClipThroughGraph({
      clip: clip({
        tracks: [
          {
            id: "t0",
            variableId: IN,
            channel: IN,
            interpolation: "linear",
            detached: true,
            keyframes: [{ id: "k0", time: 0, value: 1 }],
          },
        ],
      }),
      evaluator,
      outputPaths: [OUT_A],
      fps: 10,
    });

    expect(report.drivenInputs).toEqual([]);
    expect(report.warnings).toContainEqual({ kind: "no-input-tracks" });
    expect(evaluator.staged).toEqual([]);
  });

  it("rejects a non-positive fps rather than emitting an empty bake", () => {
    expect(() =>
      sampleClipThroughGraph({
        clip: clip(),
        evaluator: fakeGraph(),
        outputPaths: [OUT_A],
        fps: 0,
      }),
    ).toThrow(/fps must be positive/);
  });
});

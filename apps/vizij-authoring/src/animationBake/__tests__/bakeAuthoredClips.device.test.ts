// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import { bakeAuthoredClips, summarizeBakeReport } from "../bakeAuthoredClips";
import { createBakeTargetIndex } from "../bakeTargets";
import type { ThreeObject3DLike } from "../toThreeAnimationClip";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../../types/animationClipIr";

/**
 * The whole phase-3 chain on a real device: an authored clip on a *semantic*
 * input becomes a `THREE.AnimationClip` on node channels the clip never
 * mentions.
 *
 * This is the property that the earlier draft of the plan got wrong by
 * assuming baking was track reformatting. If the graph is not evaluated, a
 * clip like this bakes to nothing at all.
 */

const INPUT = "lids_blink";
const ELEMENT = "L_Lid";
/** `propsrig/<element segment>/<feature>/<component>` */
const OUT_Y = "propsrig/l_lid/translation/y";
const OUT_X = "propsrig/l_lid/translation/x";

/** blink input -> lid translation y (scaled), x held constant. */
function rigSpec(): GraphSpec {
  return {
    nodes: [
      {
        id: "blink",
        type: "input",
        params: { path: INPUT, value: { float: 0 } },
      },
      { id: "gain", type: "constant", params: { value: { float: 0.02 } } },
      { id: "scaled", type: "multiply" },
      { id: "out_y", type: "output", params: { path: OUT_Y } },
      { id: "hold", type: "constant", params: { value: { float: 0 } } },
      { id: "out_x", type: "output", params: { path: OUT_X } },
    ],
    edges: [
      { from: { node_id: "blink" }, to: { node_id: "scaled", input: "a" } },
      { from: { node_id: "gain" }, to: { node_id: "scaled", input: "b" } },
      { from: { node_id: "scaled" }, to: { node_id: "out_y", input: "in" } },
      { from: { node_id: "hold" }, to: { node_id: "out_x", input: "in" } },
    ],
  } as unknown as GraphSpec;
}

function fakeRoot(): ThreeObject3DLike {
  const child: ThreeObject3DLike = {
    name: ELEMENT,
    traverse: (callback) => callback(child),
  };
  const root: ThreeObject3DLike = {
    name: "Scene",
    traverse: (callback) => {
      callback(root);
      callback(child);
    },
  };
  return root;
}

function authoredClip(): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: "authoring.timeline.main",
    name: "Blink",
    duration: 1,
    tracks: [
      {
        id: "t0",
        variableId: INPUT,
        channel: INPUT,
        interpolation: "linear",
        keyframes: [
          { id: "k0", time: 0, value: 0 },
          { id: "k1", time: 0.5, value: 1 },
          { id: "k2", time: 1, value: 0 },
        ],
      },
    ],
  };
}

const targets = createBakeTargetIndex([
  {
    elementName: ELEMENT,
    translation: [0, 0, 0],
    rotationEuler: [0, 0, 0],
    scale: [1, 1, 1],
    morphFeatureKeys: [],
  },
]);

describe("bakeAuthoredClips", () => {
  it("turns a semantic clip into a node-channel three clip", async () => {
    const { animations, report } = await bakeAuthoredClips({
      clips: [authoredClip()],
      spec: rigSpec(),
      outputs: [
        {
          path: OUT_Y,
          channels: [OUT_Y],
          elementName: ELEMENT,
          featureKey: "translation",
        },
        {
          path: OUT_X,
          channels: [OUT_X],
          elementName: ELEMENT,
          featureKey: "translation",
        },
      ],
      inputPathMap: { [INPUT]: INPUT },
      targets,
      root: fakeRoot(),
      fps: 30,
    });

    expect(animations).toHaveLength(1);
    const outcome = report.outcomes[0]!;

    // The authored clip mentions only `lids_blink`; the bake found the node
    // channel the graph drives from it.
    expect(outcome.sample.drivenInputs).toEqual([INPUT]);
    expect(outcome.sample.sampledChannels).toEqual([OUT_Y]);
    // x is written but never varies, so it is dropped rather than pinning
    // the node against every other clip.
    expect(outcome.sample.constantChannels).toEqual([OUT_X]);
    expect(outcome.bindingIssues).toEqual([]);
    expect(outcome.bake.bakedChannels).toEqual([OUT_Y]);

    // Decimation ran and kept the triangle's shape: far fewer keys than the
    // 31 sampled, but more than the two endpoints, since the peak must stay.
    expect(outcome.decimate.keyframesBefore).toBe(31);
    expect(outcome.decimate.keyframesAfter).toBeLessThan(31);
    expect(outcome.decimate.keyframesAfter).toBeGreaterThanOrEqual(3);

    const clip = animations[0] as {
      name: string;
      duration: number;
      tracks: Array<{
        name: string;
        times: Float32Array;
        values: Float32Array;
      }>;
    };
    expect(clip.name).toBe("Blink");
    expect(clip.tracks).toHaveLength(1);
    expect(clip.tracks[0]!.name).toBe(`${ELEMENT}.position`);

    // The peak: blink 1 * gain 0.02 on y, and the un-animated components
    // filled from the element's current translation rather than left at zero.
    const values = [...clip.tracks[0]!.values];
    const ys = values.filter((_, index) => index % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(0.02, 4);
    expect(Math.min(...ys)).toBeCloseTo(0, 4);
  });

  it("names what could not be baked instead of only counting it", async () => {
    // Decision 3 of the roundtrip plan: material channels are accepted as a
    // gap, but the preflight has to name them.
    const clip = authoredClip();
    const withMaterial: AnimationClipIR = {
      ...clip,
      tracks: [
        ...clip.tracks,
        {
          id: "t1",
          variableId: "propsrig/l_lid/color/r",
          channel: "propsrig/l_lid/color/r",
          interpolation: "linear",
          keyframes: [
            { id: "m0", time: 0, value: 0 },
            { id: "m1", time: 1, value: 1 },
          ],
        },
      ],
    };

    const { report } = await bakeAuthoredClips({
      clips: [withMaterial],
      spec: rigSpec(),
      outputs: [
        {
          path: OUT_Y,
          channels: [OUT_Y],
          elementName: ELEMENT,
          featureKey: "translation",
        },
        {
          path: OUT_X,
          channels: [OUT_X],
          elementName: ELEMENT,
          featureKey: "translation",
        },
      ],
      inputPathMap: { [INPUT]: INPUT },
      targets,
      root: fakeRoot(),
      fps: 30,
    });

    const summary = summarizeBakeReport(report).join("\n");
    expect(summary).toContain("Blink");
    expect(summary).toMatch(/channels, \d+ keyframes/);
  });

  it("exports nothing rather than an empty clip when no track has keys", async () => {
    const { animations, report } = await bakeAuthoredClips({
      clips: [
        {
          schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
          id: "empty",
          duration: 0,
          tracks: [],
        },
      ],
      spec: rigSpec(),
      outputs: [
        {
          path: OUT_Y,
          channels: [OUT_Y],
          elementName: ELEMENT,
          featureKey: "translation",
        },
      ],
      inputPathMap: { [INPUT]: INPUT },
      targets,
      root: fakeRoot(),
    });

    expect(animations).toEqual([]);
    expect(report.outcomes).toEqual([]);
  });
});

/**
 * A `time` node's output is the accumulated graph clock, so it is state that
 * survives across clips. Baking used to build one evaluator for the whole
 * batch, which left the second clip starting at the first clip's end time
 * rather than at zero — so the output depended on the order clips happened to
 * be in, and baking [A, B] gave a different B than baking [B].
 *
 * `slew` would express this more directly but is inert in this runtime's
 * vocabulary (verified: it passes its input straight through), so the clock is
 * the honest way to hold state here.
 */
function clockRigSpec(): GraphSpec {
  return {
    nodes: [
      { id: "clock", type: "time" },
      { id: "out_y", type: "output", params: { path: OUT_Y } },
    ],
    edges: [
      { from: { node_id: "clock" }, to: { node_id: "out_y", input: "in" } },
    ],
  } as unknown as GraphSpec;
}

function namedClip(id: string, name: string): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id,
    name,
    duration: 1,
    tracks: [
      {
        id: `${id}-t0`,
        variableId: INPUT,
        channel: INPUT,
        interpolation: "linear",
        keyframes: [
          { id: "k0", time: 0, value: 0 },
          { id: "k1", time: 1, value: 1 },
        ],
      },
    ],
  };
}

async function bakeWithClock(clips: AnimationClipIR[]) {
  return bakeAuthoredClips({
    clips,
    spec: clockRigSpec(),
    outputs: [
      {
        path: OUT_Y,
        channels: [OUT_Y],
        elementName: ELEMENT,
        featureKey: "translation",
      },
    ],
    inputPathMap: { [INPUT]: INPUT },
    targets,
    root: fakeRoot(),
    fps: 30,
    // Pinned so the two batches cannot differ merely by probing the graph.
    propagationTicks: 1,
  });
}

describe("bakeAuthoredClips graph state", () => {
  it("bakes a clip the same whether or not another clip preceded it", async () => {
    const solo = await bakeWithClock([namedClip("c2", "Second")]);
    const batched = await bakeWithClock([
      namedClip("c1", "First"),
      namedClip("c2", "Second"),
    ]);

    const soloClip = solo.animations[0] as {
      tracks: Array<{ values: Float32Array }>;
    };
    const batchedSecond = batched.animations[1] as {
      tracks: Array<{ values: Float32Array }>;
    };

    expect(batched.animations).toHaveLength(2);
    expect([...batchedSecond.tracks[0]!.values]).toEqual([
      ...soloClip.tracks[0]!.values,
    ]);
  });
});

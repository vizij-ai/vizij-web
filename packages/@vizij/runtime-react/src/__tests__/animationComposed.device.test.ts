import { describe, expect, it } from "vitest";
import { loadAnimationModule } from "@vizij/animation-module";
import { startRuntime, type Runtime } from "@vizij/runtime";
import { AnimationModuleHost } from "../engine/animationModuleHost";
import { animationsGraphSource } from "../engine/animationModule";
import { composeGraphSpecs } from "../utils/composeGraph";

/**
 * The app's real topology: the animations source composed with a rig graph,
 * where the module's output must be read back by the rig graph as an *input*.
 *
 * `animationPipeline.device.test.ts` runs the animations source alone and
 * proves the module writes values. This adds the half the app depends on —
 * a second source consuming those writes in the same composed graph — which
 * is where an evaluation-order or composition fault would show up.
 */

const RIG_INPUT = "rig/testface/propsrig/l_eye/scale/x";
const RIG_OUTPUT = "anim/observed/scale_x";

function rampClip(target: string) {
  return {
    id: "ramp",
    name: "ramp",
    duration: 1000,
    groups: {},
    tracks: [
      {
        id: "t0",
        name: "ramp",
        animatableId: target,
        points: [
          { id: "k0", stamp: 0, value: 0 },
          { id: "k1", stamp: 1, value: 1 },
        ],
      },
    ],
  } as never;
}

/** A stand-in rig graph: reads the animated channel, republishes it. */
function rigSource() {
  return {
    sourceId: "rig",
    spec: {
      nodes: [
        {
          id: "in",
          type: "input",
          // A default is mandatory: an input node with neither a staged value
          // nor a default makes the whole graph tick throw, which silently
          // stops every other node — including the animation module's step.
          params: { path: RIG_INPUT, value: { float: 0 } },
        },
        { id: "out", type: "output", params: { path: RIG_OUTPUT } },
      ],
      edges: [{ from: { node_id: "in" }, to: { node_id: "out", input: "in" } }],
    },
  };
}

async function stepMany(runtime: Runtime, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    runtime.step(16);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function readFloat(runtime: Runtime, path: string): number | null {
  const raw = runtime.readValues([path])[path];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  for (const key of ["float", "f32", "f64"]) {
    if (key in raw) {
      return Number((raw as Record<string, unknown>)[key]);
    }
  }
  return null;
}

describe("animations composed with a rig graph", () => {
  it("composes both sources without dropping the path-less output node", () => {
    const composed = composeGraphSpecs([animationsGraphSource(), rigSource()]);
    const nodes = composed.nodes as Array<{ id: string; type: string }>;
    // Node ids are namespaced by source, so both survive composition.
    expect(nodes.map((node) => node.id)).toContain("animations::apply");
    expect(nodes.map((node) => node.id)).toContain("rig::in");
    expect(
      nodes.filter((node) => node.type === "externalfunction"),
    ).toHaveLength(2);
    expect(composed.edges as unknown[]).toHaveLength(4);
  });

  it("lets the rig graph consume what the animation module writes", async () => {
    const moduleArtifact = await loadAnimationModule();
    const composed = composeGraphSpecs([animationsGraphSource(), rigSource()]);
    const runtime = await startRuntime(composed, undefined, [moduleArtifact]);
    try {
      const host = new AnimationModuleHost(
        () => runtime,
        // Mirrors the provider: the clip's channel resolves to the rig's
        // face-prefixed input path.
        () => [RIG_INPUT],
      );
      host.setClips([{ id: "ramp", stored: rampClip(RIG_INPUT) }]);
      const playing = host.play("ramp");
      await stepMany(runtime, 20);
      await playing;
      await stepMany(runtime, 20);

      expect(
        runtime.behaviorError,
        "the composed graph tick failed, so no node ran",
      ).toBeUndefined();

      const written = readFloat(runtime, RIG_INPUT);
      expect(
        written,
        `the module never wrote to "${RIG_INPUT}"`,
      ).not.toBeNull();

      const observed = readFloat(runtime, RIG_OUTPUT);
      expect(
        observed,
        `the rig graph never republished the animated value to "${RIG_OUTPUT}"`,
      ).not.toBeNull();
      // The consumer trails the module by exactly one tick: the input node
      // reads the value the previous tick wrote. Asserted loosely on purpose —
      // equality here would be asserting a scheduling detail, but a large gap
      // would mean the value is stale rather than merely lagged.
      expect(Math.abs(observed! - written!)).toBeLessThan(0.05);
      expect(observed!).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  it("requires the clip's target keys to match the graph's namespaced paths", async () => {
    // Registration rewrites every graph node's `params.path` to the namespaced
    // form, and `setInput` namespaces staged writes to match. A clip whose
    // resolved target keys are NOT namespaced therefore writes real sampled
    // values to a key nothing reads: correct at every observable stage, with a
    // face that never moves — while the Inputs surface still works.
    const NS = "default";
    const moduleArtifact = await loadAnimationModule();
    const namespacedRig = {
      sourceId: "rig",
      spec: {
        nodes: [
          {
            id: "in",
            type: "input",
            params: { path: `${NS}/${RIG_INPUT}`, value: { float: 0 } },
          },
          {
            id: "out",
            type: "output",
            params: { path: `${NS}/${RIG_OUTPUT}` },
          },
        ],
        edges: [
          { from: { node_id: "in" }, to: { node_id: "out", input: "in" } },
        ],
      },
    };
    const composed = composeGraphSpecs([
      animationsGraphSource(),
      namespacedRig,
    ]);

    // Bare target keys: the pre-fix behaviour.
    const bare = await startRuntime(composed, undefined, [moduleArtifact]);
    try {
      const host = new AnimationModuleHost(
        () => bare,
        () => [RIG_INPUT],
      );
      host.setClips([{ id: "ramp", stored: rampClip(RIG_INPUT) }]);
      const playing = host.play("ramp");
      await stepMany(bare, 20);
      await playing;
      await stepMany(bare, 20);

      expect(readFloat(bare, RIG_INPUT)).not.toBeNull();
      expect(
        readFloat(bare, `${NS}/${RIG_OUTPUT}`),
        "a bare target key must not reach a namespaced graph — if this passes, the namespacing fix is unnecessary",
      ).toBe(0);
    } finally {
      bare.dispose();
    }

    // Namespaced target keys: the fix.
    const namespaced = await startRuntime(composed, undefined, [
      moduleArtifact,
    ]);
    try {
      const host = new AnimationModuleHost(
        () => namespaced,
        () => [`${NS}/${RIG_INPUT}`],
      );
      host.setClips([{ id: "ramp", stored: rampClip(`${NS}/${RIG_INPUT}`) }]);
      const playing = host.play("ramp");
      await stepMany(namespaced, 20);
      await playing;
      await stepMany(namespaced, 20);

      const observed = readFloat(namespaced, `${NS}/${RIG_OUTPUT}`);
      expect(
        observed,
        "with namespaced target keys the graph must consume the animation",
      ).not.toBeNull();
      expect(observed!).toBeGreaterThan(0);
    } finally {
      namespaced.dispose();
    }
  });

  it("keeps the consumed value advancing over time", async () => {
    const moduleArtifact = await loadAnimationModule();
    const composed = composeGraphSpecs([animationsGraphSource(), rigSource()]);
    const runtime = await startRuntime(composed, undefined, [moduleArtifact]);
    try {
      const host = new AnimationModuleHost(
        () => runtime,
        () => [RIG_INPUT],
      );
      host.setClips([{ id: "ramp", stored: rampClip(RIG_INPUT) }]);
      const playing = host.play("ramp");
      await stepMany(runtime, 20);
      await playing;

      await stepMany(runtime, 10);
      const early = readFloat(runtime, RIG_OUTPUT);
      await stepMany(runtime, 20);
      const later = readFloat(runtime, RIG_OUTPUT);

      expect(early).not.toBeNull();
      expect(later).not.toBeNull();
      expect(later).not.toBe(early);
    } finally {
      runtime.dispose();
    }
  });
});

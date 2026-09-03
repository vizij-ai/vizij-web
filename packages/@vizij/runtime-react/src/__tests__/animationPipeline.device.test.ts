import { describe, expect, it } from "vitest";
import { loadAnimationModule } from "@vizij/animation-module";
import { startRuntime, type Runtime } from "@vizij/runtime";
import { AnimationModuleHost } from "../engine/animationModuleHost";
import {
  ANIMATION_PLAYERS_PATH,
  animationsGraphSource,
  decodePlayerStates,
  type StoredAnimationClipLike,
} from "../engine/animationModule";

/**
 * End-to-end proof that a clip actually produces values on a real device.
 *
 * Every other animation test in this package asserts call payloads against a
 * fake device, so the whole pipeline could be — and was — broken while they all
 * passed. This boots the real Arora runtime with the real animation module,
 * loads a clip through the real host, steps, and reads the value back out of
 * the store.
 *
 * `Runtime.call` resolves only after the runtime's next step, so every await
 * here has to be pumped.
 */

const TARGET = "node/x";

function rampClip(): StoredAnimationClipLike {
  return {
    id: "ramp",
    name: "ramp",
    duration: 1000,
    groups: {},
    tracks: [
      {
        id: "t0",
        name: "ramp",
        animatableId: TARGET,
        points: [
          { id: "k0", stamp: 0, value: 0 },
          { id: "k1", stamp: 1, value: 1 },
        ],
      },
    ],
  } as StoredAnimationClipLike;
}

/** Steps the device while waiting, since calls land on the next step. */
async function pump<T>(runtime: Runtime, promise: Promise<T>): Promise<T> {
  let settled = false;
  const tracked = promise.then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  for (let i = 0; i < 50 && !settled; i += 1) {
    runtime.step(16);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return tracked;
}

/**
 * Steps the device, yielding between steps so queued `Runtime.call` promise
 * chains can advance. A plain synchronous loop never lets them progress.
 */
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

async function bootWithAnimations() {
  const moduleArtifact = await loadAnimationModule();
  const runtime = await startRuntime(animationsGraphSource().spec, undefined, [
    moduleArtifact,
  ]);
  const host = new AnimationModuleHost(
    () => runtime,
    (key) => [key],
  );
  return { runtime, host };
}

describe("animation pipeline on a real device", () => {
  it("boots the runtime with the animation module and the animations source", async () => {
    const { runtime } = await bootWithAnimations();
    try {
      runtime.step(16);
      // `arora/dt` is what feeds the module's step; it must be populated, in
      // nanoseconds, or the module never advances.
      const dt = runtime.readValues(["arora/dt"])["arora/dt"];
      expect(dt).not.toBeNull();
      expect(Number((dt as { u64: number }).u64)).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  it("writes sampled values to the track's target path while playing", async () => {
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));

      // A player and instance must exist, or there is nothing to sample.
      expect(host.playerIdOf("ramp")).not.toBeNull();

      // Advance well into the clip.
      for (let i = 0; i < 20; i += 1) {
        runtime.step(16);
      }
      const midway = readFloat(runtime, TARGET);

      expect(
        midway,
        `expected the module to write a sampled value to "${TARGET}"`,
      ).not.toBeNull();
      expect(midway!).toBeGreaterThan(0);
      expect(midway!).toBeLessThanOrEqual(1);

      // And it must keep advancing, not latch on one value.
      for (let i = 0; i < 20; i += 1) {
        runtime.step(16);
      }
      const later = readFloat(runtime, TARGET);
      expect(later).not.toBeNull();
      expect(later).not.toBe(midway);
    } finally {
      runtime.dispose();
    }
  });

  it("reports player state feedback in a shape the decoder accepts", async () => {
    // The transport clock reads this. A decoder that cannot parse it pins the
    // clock at 0 while playback looks fine.
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));
      for (let i = 0; i < 10; i += 1) {
        runtime.step(16);
      }

      const raw = runtime.readValues([ANIMATION_PLAYERS_PATH])[
        ANIMATION_PLAYERS_PATH
      ];
      expect(
        raw,
        `nothing was written to ${ANIMATION_PLAYERS_PATH}`,
      ).not.toBeNull();

      const states = decodePlayerStates(raw);
      expect(
        states.length,
        `decodePlayerStates could not parse ${JSON.stringify(raw).slice(0, 200)}`,
      ).toBeGreaterThan(0);

      const playerId = host.playerIdOf("ramp");
      const feedback = states.find((entry) => entry.player === playerId);
      expect(feedback).toBeDefined();
      expect(feedback!.duration).toBeGreaterThan(0);
      expect(feedback!.time).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  it("keeps writing after a device rebuild replay", async () => {
    // A device rebuild is the normal path in an app whose bundle gains
    // animations after boot (the module set changes, forcing a rebuild), so
    // `replayInto` has to leave the clip actually producing values again.
    const moduleArtifact = await loadAnimationModule();
    const first = await startRuntime(animationsGraphSource().spec, undefined, [
      moduleArtifact,
    ]);
    let current: Runtime = first;
    const host = new AnimationModuleHost(
      () => current,
      (key) => [key],
    );
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(current, host.play("ramp"));
      for (let i = 0; i < 10; i += 1) {
        current.step(16);
      }
      expect(readFloat(current, TARGET)).not.toBeNull();

      // Rebuild: a brand new device, with no module guest state.
      const rebuilt = await startRuntime(
        animationsGraphSource().spec,
        undefined,
        [moduleArtifact],
      );
      current = rebuilt;
      expect(readFloat(current, TARGET)).toBeNull();

      host.replayInto(current);
      await stepMany(current, 30);

      expect(
        readFloat(current, TARGET),
        "replayInto restored the clip but the rebuilt device never produced a value",
      ).not.toBeNull();
    } finally {
      if (current !== first) {
        current.dispose();
      }
      first.dispose();
    }
  });

  it("does not write anything when the animations source is absent", async () => {
    // The control: without the source composed, the module never steps. This is
    // the failure mode the app was in, so it must be reproducible.
    const moduleArtifact = await loadAnimationModule();
    const runtime = await startRuntime(
      {
        nodes: [
          { id: "in", type: "input", params: { path: "unused/in" } },
          { id: "out", type: "output", params: { path: "unused/out" } },
        ],
        edges: [
          { from: { node_id: "in" }, to: { node_id: "out", input: "in" } },
        ],
      },
      undefined,
      [moduleArtifact],
    );
    try {
      const host = new AnimationModuleHost(
        () => runtime,
        (key) => [key],
      );
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));
      for (let i = 0; i < 20; i += 1) {
        runtime.step(16);
      }
      // Player exists, clip is "playing", nothing is written.
      expect(host.playerIdOf("ramp")).not.toBeNull();
      expect(readFloat(runtime, TARGET)).toBeNull();
    } finally {
      runtime.dispose();
    }
  });
});

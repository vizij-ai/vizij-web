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
 * Pause has to reach the device, and it has to be observable in the feedback.
 *
 * The transport UI trusts `player_states` over its own commanded flag, so a
 * pause that never lands does not merely fail quietly — the next frame of
 * feedback reports "playing" and puts the UI back, which reads as the pause
 * button doing nothing. `AnimationModuleHost.dispatch` swallows every
 * transport-call rejection, so nothing anywhere says why.
 *
 * These assert against the real module's own feedback rather than call
 * payloads: the fake-device tests in this package pass whether or not the
 * call ever reaches a module.
 */

const TARGET = "node/x";

function rampClip(): StoredAnimationClipLike {
  return {
    id: "ramp",
    name: "ramp",
    duration: 4000,
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

/** The module's own view of a player, which is what the UI believes. */
function playerState(runtime: Runtime, playerId: number) {
  const raw = runtime.readValues([ANIMATION_PLAYERS_PATH])[
    ANIMATION_PLAYERS_PATH
  ];
  return decodePlayerStates(raw ?? null).find(
    (entry) => entry.player === playerId,
  );
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

describe("transport issued before the player exists", () => {
  it("plays from a seek made before play created the player", async () => {
    // App's play path is setAnimationLoop -> seekAnimation -> playAnimation,
    // and the first two land while `playerId` is still null. `ensureLoaded`
    // re-applies speed, loop and weight once the player exists, but nothing
    // replays the seek, so pressing Play at 3s started the module at 0.
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);

      // Before any player exists.
      expect(host.playerIdOf("ramp")).toBeNull();
      host.seek("ramp", 3);

      await pump(runtime, host.play("ramp"));
      await stepMany(runtime, 4);

      // The clip ramps 0..1 over 4s, so t=3s is ~0.75. Starting from zero
      // instead reads as ~0.
      const value = readFloat(runtime, TARGET);
      expect(value).not.toBeNull();
      expect(
        value!,
        "the clip started from 0, so the seek issued before play was dropped",
      ).toBeGreaterThan(0.5);
    } finally {
      runtime.dispose();
    }
  });
});

describe("pause on a real device", () => {
  it("reports paused in the module's feedback, not just in the host", async () => {
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));
      const playerId = host.playerIdOf("ramp");
      expect(playerId).not.toBeNull();

      // Get far enough in that feedback exists and is authoritative. Pausing
      // before the first fed tick passes for the wrong reason: the transport
      // falls back to the commanded flag when there is no feedback yet, so
      // the bug is invisible in exactly that window.
      await stepMany(runtime, 20);
      expect(playerState(runtime, playerId!)?.state).toBe("playing");

      host.pause("ramp");
      await stepMany(runtime, 10);

      expect(
        playerState(runtime, playerId!)?.state,
        "the module still reports playing, so the transport UI will revert to playing",
      ).not.toBe("playing");
    } finally {
      runtime.dispose();
    }
  });

  it("holds the sampled value while paused", async () => {
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));
      await stepMany(runtime, 20);

      host.pause("ramp");
      await stepMany(runtime, 5);
      const held = readFloat(runtime, TARGET);
      expect(held).not.toBeNull();

      await stepMany(runtime, 20);
      expect(
        readFloat(runtime, TARGET),
        "the clip kept advancing while paused",
      ).toBeCloseTo(held!, 6);
    } finally {
      runtime.dispose();
    }
  });

  it("resumes from where it paused rather than restarting", async () => {
    const { runtime, host } = await bootWithAnimations();
    try {
      host.setClips([{ id: "ramp", stored: rampClip() }]);
      await pump(runtime, host.play("ramp"));
      await stepMany(runtime, 20);

      host.pause("ramp");
      await stepMany(runtime, 5);
      const atPause = readFloat(runtime, TARGET);
      expect(atPause).not.toBeNull();
      expect(atPause!).toBeGreaterThan(0);

      await pump(runtime, host.play("ramp"));
      await stepMany(runtime, 10);

      const afterResume = readFloat(runtime, TARGET);
      expect(afterResume).not.toBeNull();
      expect(
        afterResume!,
        `resume rewound from ${atPause} to ${afterResume}`,
      ).toBeGreaterThan(atPause! - 1e-6);
    } finally {
      runtime.dispose();
    }
  });
});

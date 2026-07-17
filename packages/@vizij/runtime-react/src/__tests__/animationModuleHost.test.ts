import { describe, expect, it } from "vitest";
import { AnimationModuleHost } from "../engine/animationModuleHost";
import {
  ANIMATION_MODULE_FN,
  type AnimationModuleCall,
} from "../engine/animationModule";

/** Flush the microtask queue so awaited call chains settle. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

const clip = (id: string) => ({
  id,
  stored: {
    id,
    name: id,
    duration: 1000,
    tracks: [
      {
        id: "t0",
        name: "t0",
        animatableId: "node/x",
        points: [
          { id: "k0", stamp: 0, value: 0 },
          { id: "k1", stamp: 1, value: 1 },
        ],
      },
    ],
  },
});

/**
 * A fake device that records calls and answers setup calls with incrementing
 * u32 ids, so the host's load/player/instance bookkeeping can be asserted
 * without wasm.
 */
class FakeDevice {
  readonly calls: AnimationModuleCall[] = [];
  private next = 1;
  call(call: AnimationModuleCall): Promise<{ ret: unknown }> {
    this.calls.push(call);
    return Promise.resolve({ ret: { u32: this.next++ } });
  }
  countOf(fnId: string): number {
    return this.calls.filter((c) => c.id === fnId).length;
  }
}

describe("AnimationModuleHost", () => {
  it("lazily loads a clip with a player + instance on first play", async () => {
    const device = new FakeDevice();
    const host = new AnimationModuleHost(() => device as never);
    host.setClips([clip("a"), clip("b")]);

    // Declaring clips must not touch the device (muted/unused clips never load).
    expect(device.calls).toHaveLength(0);
    expect(host.hasPlaying()).toBe(false);

    await host.play("a");
    expect(host.hasPlaying()).toBe(true);
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);
    expect(device.countOf(ANIMATION_MODULE_FN.createPlayer)).toBe(1);
    expect(device.countOf(ANIMATION_MODULE_FN.addInstance)).toBe(1);

    // Re-playing an already-loaded clip does not reload it.
    await host.play("a");
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);

    // Clip "b" stayed untouched.
    expect(host.has("b")).toBe(true);
  });

  it("play before a device exists defers loading to replayInto", async () => {
    let device: FakeDevice | null = null;
    const host = new AnimationModuleHost(() => device as never);
    host.setClips([clip("a")]);

    await host.play("a");
    expect(host.hasPlaying()).toBe(true);

    // Device boots later (source registration): replay loads the playing clip.
    device = new FakeDevice();
    host.replayInto(device as never);
    await flush();
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);
    expect(device.countOf(ANIMATION_MODULE_FN.addInstance)).toBe(1);
  });

  it("stop voids ids so the next play reloads (module reload = reset)", async () => {
    const device = new FakeDevice();
    const host = new AnimationModuleHost(() => device as never);
    host.setClips([clip("a")]);

    await host.play("a");
    host.stop("a");
    expect(host.hasPlaying()).toBe(false);

    await host.play("a");
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(2);
    expect(device.countOf(ANIMATION_MODULE_FN.createPlayer)).toBe(2);
  });

  it("pause keeps the clip loaded for a cheap resume", async () => {
    const device = new FakeDevice();
    const host = new AnimationModuleHost(() => device as never);
    host.setClips([clip("a")]);

    await host.play("a");
    host.pause("a");
    expect(host.hasPlaying()).toBe(false);

    await host.play("a");
    // Still loaded: no reload on resume.
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);
    expect(host.hasPlaying()).toBe(true);
  });

  it("replayInto re-issues setup only for playing clips after a restart", async () => {
    const first = new FakeDevice();
    const host = new AnimationModuleHost(() => first as never);
    host.setClips([clip("a"), clip("b")]);
    await host.play("a"); // a playing, b idle

    const second = new FakeDevice();
    host.replayInto(second as never);
    await flush();
    expect(second.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);
    expect(second.countOf(ANIMATION_MODULE_FN.addInstance)).toBe(1);
  });

  it("setClips drops clips no longer present and reloads changed ones", async () => {
    const device = new FakeDevice();
    const host = new AnimationModuleHost(() => device as never);
    host.setClips([clip("a")]);
    await host.play("a");
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(1);

    // Re-declare "a" (content refresh) — ids void, so play reloads.
    host.setClips([clip("a")]);
    await host.play("a");
    expect(device.countOf(ANIMATION_MODULE_FN.loadAnimation)).toBe(2);

    // Drop "a".
    host.setClips([]);
    expect(host.has("a")).toBe(false);
  });
});

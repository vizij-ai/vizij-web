import { describe, expect, it, vi } from "vitest";
import {
  createHostAnimationFallbackPlayback,
  type HostAnimationFallbackClipState,
} from "../host/hostAnimationFallback";

describe("host animation fallback playback", () => {
  function makeState(
    overrides: Partial<HostAnimationFallbackClipState> = {},
  ): HostAnimationFallbackClipState {
    return {
      id: "blink",
      time: 0,
      duration: 1,
      speed: 1,
      weight: 1,
      loop: false,
      playing: true,
      resolve: null,
      completion: null,
      ...overrides,
    };
  }

  it("advances host-owned clip playback and writes sampled clip outputs", () => {
    const clip = {
      id: "blink",
      duration: 1,
      tracks: [
        {
          path: "rig/face/lids/blink",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
          interpolation: "linear",
        },
      ],
    };
    const state = makeState();
    const writeClipOutputs = vi.fn();
    const clearClipOutputs = vi.fn();

    const result = createHostAnimationFallbackPlayback({
      resolveClipById: () => clip,
      writeClipOutputs,
      clearClipOutputs,
    }).advance({
      states: new Map([["blink", state]]),
      dt: 0.5,
      hostOwnsClipOutputs: true,
      animationSystemActive: true,
    });

    expect(result.activeCount).toBe(1);
    expect(writeClipOutputs).toHaveBeenCalledWith(
      clip,
      expect.objectContaining({ time: 0.5 }),
    );
    expect(clearClipOutputs).not.toHaveBeenCalled();
  });

  it("advances non-host transport clip state without writing outputs", () => {
    const state = makeState();
    const writeClipOutputs = vi.fn();

    createHostAnimationFallbackPlayback({
      resolveClipById: () => ({ clip: { duration: 1, tracks: [] } }),
      writeClipOutputs,
      clearClipOutputs: vi.fn(),
    }).advance({
      states: new Map([["blink", state]]),
      dt: 0.25,
      hostOwnsClipOutputs: false,
      animationSystemActive: true,
    });

    expect(state.time).toBe(0.25);
    expect(writeClipOutputs).not.toHaveBeenCalled();
  });

  it("deletes missing clips and resolves their completion", () => {
    const resolve = vi.fn();
    const state = makeState({ resolve, completion: Promise.resolve() });
    const states = new Map([["missing", state]]);

    const result = createHostAnimationFallbackPlayback({
      resolveClipById: () => null,
      writeClipOutputs: vi.fn(),
      clearClipOutputs: vi.fn(),
    }).advance({
      states,
      dt: 0.1,
      hostOwnsClipOutputs: true,
      animationSystemActive: true,
    });

    expect(states.has("missing")).toBe(false);
    expect(result).toEqual({
      activeCount: 0,
      completedIds: [],
      removedIds: ["missing"],
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(state.resolve).toBeNull();
    expect(state.completion).toBeNull();
  });

  it("clears completed host-owned clip outputs only while animation is active", () => {
    const activeStates = new Map([["blink", makeState({ time: 0.9 })]]);
    const inactiveStates = new Map([["blink", makeState({ time: 0.9 })]]);
    const activeClear = vi.fn();
    const inactiveClear = vi.fn();
    const playback = createHostAnimationFallbackPlayback({
      resolveClipById: () => ({ clip: { duration: 1, tracks: [] } }),
      writeClipOutputs: vi.fn(),
      clearClipOutputs: activeClear,
    });

    expect(
      playback.advance({
        states: activeStates,
        dt: 0.2,
        hostOwnsClipOutputs: true,
        animationSystemActive: true,
      }).completedIds,
    ).toEqual(["blink"]);
    expect(activeStates.size).toBe(0);
    expect(activeClear).toHaveBeenCalledWith("blink");

    createHostAnimationFallbackPlayback({
      resolveClipById: () => ({ clip: { duration: 1, tracks: [] } }),
      writeClipOutputs: vi.fn(),
      clearClipOutputs: inactiveClear,
    }).advance({
      states: inactiveStates,
      dt: 0.2,
      hostOwnsClipOutputs: true,
      animationSystemActive: false,
    });

    expect(inactiveStates.size).toBe(0);
    expect(inactiveClear).not.toHaveBeenCalled();
  });
});

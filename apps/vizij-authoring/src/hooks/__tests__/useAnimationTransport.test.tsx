import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimationStore } from "../../state/animationStore";
import { useAnimationTransport } from "../useAnimationTransport";

/** The face the hook sees: `null` outside a provider. */
let mockFace: { runtime: unknown } | null = null;

vi.mock("@vizij/runtime-react", () => ({
  useOptionalVizijRuntime: () => mockFace,
}));

// The fake device reports its players already decoded.
vi.mock("@vizij/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vizij/runtime")>()),
  decodePlayerStates: (value: unknown) => (Array.isArray(value) ? value : []),
}));

const PLAYER = 7;

/** A device whose animation module has the timeline's player, stopped at 0
 * on a 2 s clip, and which records what it is invoked with. */
function faceWithTimeline() {
  const invoke = vi.fn().mockResolvedValue({ u32: PLAYER });
  const runtime = {
    invoke,
    readValues: (paths: string[]) =>
      Object.fromEntries(
        paths.map((path) => [
          path,
          [
            {
              player: PLAYER,
              name: "authoring.timeline.main",
              state: "stopped",
              time: 0,
              duration: 2,
              speed: 1,
              loopMode: "loop",
              instances: [{ instance: 1, anim: 3, weight: 1 }],
            },
          ],
        ]),
      ),
  };
  mockFace = { runtime };
  return invoke;
}

function renderTransportHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  let current: ReturnType<typeof useAnimationTransport> | null = null;

  function HookHarness() {
    current = useAnimationTransport();
    return null;
  }

  flushSync(() => {
    root = createRoot(container);
    root.render(React.createElement(HookHarness));
  });

  return {
    get result() {
      if (!current) {
        throw new Error("Transport hook not initialized");
      }
      return current;
    },
    unmount: () => {
      flushSync(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

describe("useAnimationTransport", () => {
  beforeEach(() => {
    mockFace = null;
    useAnimationStore.getState().reset();
  });

  it("remains safe when rendered outside VizijRuntimeProvider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    expect(hook.result.active).toBe(false);
    expect(() => hook.result.play()).not.toThrow();
    expect(() => hook.result.pause()).not.toThrow();
    expect(() => hook.result.stop()).not.toThrow();
    expect(() => hook.result.step()).not.toThrow();
    hook.unmount();
  });

  it("updates timeline position without enabling runtime transport outside provider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    hook.result.seek(1.25);

    const state = useAnimationStore.getState();
    expect(state.currentTime).toBe(1.25);
    expect(state.transportActive).toBe(false);
    expect(state.transportPlaybackState).toBe("stopped");
    hook.unmount();
  });

  it("drives the timeline's player on the face's device", () => {
    const invoke = faceWithTimeline();
    useAnimationStore.getState().addTrack("input_a", "Input A", "controls/a");
    useAnimationStore.getState().setLoop(false);
    useAnimationStore.getState().seek(0.4);

    const hook = renderTransportHook();
    expect(hook.result.active).toBe(true);

    const player = { u32: PLAYER };
    hook.result.play();
    expect(invoke.mock.calls).toEqual([
      ["set_loop", { player, mode: "once" }],
      ["set_speed", { player, speed: { f32: 1 } }],
      ["seek", { player, time_ns: { u64: 400_000_000 } }],
      ["play", { player }],
    ]);

    invoke.mockClear();
    hook.result.pause();
    expect(invoke.mock.calls).toEqual([["pause", { player }]]);
    expect(useAnimationStore.getState().transportActive).toBe(true);
    expect(useAnimationStore.getState().transportPlaybackState).toBe("paused");
    expect(useAnimationStore.getState().isPlaying).toBe(false);

    invoke.mockClear();
    hook.result.stop();
    expect(invoke.mock.calls).toEqual([["stop", { player }]]);
    hook.unmount();
  });

  it("seeks a stopped timeline to a paused playhead", () => {
    const invoke = faceWithTimeline();
    useAnimationStore.getState().addTrack("input_a", "Input A", "controls/a");

    const hook = renderTransportHook();
    hook.result.stop();
    invoke.mockClear();

    hook.result.seek(0.75);

    expect(invoke.mock.calls).toEqual([
      ["seek", { player: { u32: PLAYER }, time_ns: { u64: 750_000_000 } }],
    ]);
    const state = useAnimationStore.getState();
    expect(state.currentTime).toBe(0.75);
    expect(state.transportActive).toBe(true);
    expect(state.transportPlaybackState).toBe("paused");
    hook.unmount();
  });
});

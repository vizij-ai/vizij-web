import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  buildAnimationPreviewBundle,
  type AnimationClipIR,
} from "@vizij/studio-support";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../../state/bindingAuthoringStore";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
} from "../../state/graphRuntimeStore";
import { useAnimationStore } from "../../state/animationStore";
import {
  AnimationRuntimeBridge,
  useAnimationTransport,
} from "../useAnimationTransport";

const runtimeContext = vi.hoisted(() => ({
  required: null as Record<string, unknown> | null,
  optional: null as Record<string, unknown> | null,
}));

vi.mock("@vizij/runtime-react", () => ({
  useOptionalVizijRuntime: () => runtimeContext.optional,
  useVizijRuntime: () => {
    if (!runtimeContext.required) {
      throw new Error("Mock Vizij runtime is missing");
    }
    return runtimeContext.required;
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderTransportHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  let current: ReturnType<typeof useAnimationTransport> | null = null;

  function HookHarness() {
    current = useAnimationTransport();
    return null;
  }

  act(() => {
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
      act(() => {
        if (!root) {
          return;
        }
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

function makeAuthoredClip(): AnimationClipIR {
  return {
    schemaVersion: 1,
    id: AUTHORED_TIMELINE_CLIP_ID,
    name: "Authored Timeline",
    duration: 1,
    tracks: [
      {
        id: "track-smile",
        variableId: "smile",
        channel: "default/mouth/smile",
        label: "Smile",
        interpolation: "linear",
        keyframes: [
          { id: "kf-0", time: 0, value: 0 },
          { id: "kf-1", time: 1, value: 1 },
        ],
      },
    ],
  };
}

function makeRuntimeMock() {
  const animationOutputPaths = new Map<string, string[]>([
    [AUTHORED_TIMELINE_CLIP_ID, ["default/mouth/smile"]],
  ]);
  return {
    rootId: "root",
    assetBundle: {
      animations: [
        {
          id: AUTHORED_TIMELINE_CLIP_ID,
          clip: {
            id: AUTHORED_TIMELINE_CLIP_ID,
            name: "Authored Timeline",
            duration: 1,
            tracks: [
              {
                channel: "default/mouth/smile",
                interpolation: "linear",
                targetInputId: "smile",
                keyframes: [
                  { time: 0, value: 0, interpolation: "linear" },
                  { time: 1, value: 1, interpolation: "linear" },
                ],
              },
            ],
          },
        },
      ],
    },
    setGraphBundle: vi.fn(),
    playAnimation: vi.fn().mockResolvedValue(undefined),
    pauseAnimation: vi.fn(),
    stopAnimation: vi.fn(),
    seekAnimation: vi.fn(),
    setAnimationLoop: vi.fn(),
    hasAnimationController: vi
      .fn()
      .mockImplementation((id: string) => id === AUTHORED_TIMELINE_CLIP_ID),
    getAnimationOutputPaths: vi
      .fn()
      .mockImplementation((id: string) => animationOutputPaths.get(id) ?? []),
    getAnimationState: vi.fn().mockReturnValue(null),
    setInput: vi.fn(),
    setAnimationActive: vi.fn(),
    stagePoseNeutral: vi.fn(),
  };
}

function renderAnimationBridge({
  active,
  clip,
}: {
  active: boolean;
  clip: AnimationClipIR;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const graphStore = createGraphRuntimeStore();
  const bindingStore = createBindingAuthoringStore();
  let root: Root | null = null;

  const render = (nextActive: boolean) => {
    if (!root) {
      throw new Error("Animation bridge root not initialized");
    }
    const currentRoot = root;
    act(() => {
      currentRoot.render(
        <GraphRuntimeStoreProvider store={graphStore}>
          <BindingAuthoringStoreProvider store={bindingStore}>
            <AnimationRuntimeBridge active={nextActive} clip={clip} />
          </BindingAuthoringStoreProvider>
        </GraphRuntimeStoreProvider>,
      );
    });
  };

  root = createRoot(container);
  render(active);

  return {
    graphStore,
    rerender: (nextActive: boolean) => render(nextActive),
    unmount: () => {
      act(() => {
        if (!root) {
          return;
        }
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
    useAnimationStore.getState().reset();
    useAnimationStore.getState().setRuntimeTransportAdapter(null);
    runtimeContext.required = null;
    runtimeContext.optional = null;
  });

  it("remains safe when rendered outside VizijRuntimeProvider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    expect(hook.result.active).toBe(false);
    expect(() => {
      act(() => {
        hook.result.play();
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        hook.result.pause();
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        hook.result.stop();
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        hook.result.step();
      });
    }).not.toThrow();
    hook.unmount();
  });

  it("updates timeline position without enabling runtime transport outside provider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    act(() => {
      hook.result.seek(1.25);
    });

    const state = useAnimationStore.getState();
    expect(state.currentTime).toBe(1.25);
    expect(state.transportActive).toBe(false);
    expect(state.transportPlaybackState).toBe("stopped");
    hook.unmount();
  });

  it("drives playback through runtime adapter when provider context is unavailable", async () => {
    const playAnimation = vi.fn().mockResolvedValue(undefined);
    const pauseAnimation = vi.fn();
    const stopAnimation = vi.fn();
    const seekAnimation = vi.fn();
    const setAnimationLoop = vi.fn();
    const getAnimationState = vi.fn().mockReturnValue({
      time: 0,
      duration: 2,
      playing: false,
      loop: false,
      speed: 1,
    });

    useAnimationStore.getState().setRuntimeTransportAdapter({
      playAnimation,
      pauseAnimation,
      stopAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
    });
    useAnimationStore.getState().addTrack("input_a", "Input A", "controls/a");
    useAnimationStore.getState().setLoop(false);
    useAnimationStore.getState().seek(0.4);

    const hook = renderTransportHook();
    expect(hook.result.active).toBe(true);

    await act(async () => {
      hook.result.play();
      await Promise.resolve();
    });

    expect(setAnimationLoop).toHaveBeenCalledWith(
      "authoring.timeline.main",
      false,
    );
    expect(seekAnimation).toHaveBeenCalledWith("authoring.timeline.main", 0.4);
    expect(playAnimation).toHaveBeenCalledWith("authoring.timeline.main", {
      reset: false,
      speed: 1,
    });
    act(() => {
      hook.result.pause();
    });
    expect(useAnimationStore.getState().transportActive).toBe(true);
    expect(useAnimationStore.getState().transportPlaybackState).toBe("paused");
    expect(useAnimationStore.getState().isPlaying).toBe(false);
    act(() => {
      hook.result.stop();
    });
    expect(stopAnimation).toHaveBeenCalledWith("authoring.timeline.main", {
      clearOutputs: true,
    });
    hook.unmount();
  });

  it("bootstraps runtime transport and pauses when seeking from stopped", () => {
    const playAnimation = vi.fn().mockResolvedValue(undefined);
    const pauseAnimation = vi.fn();
    const stopAnimation = vi.fn();
    const seekAnimation = vi.fn();
    const setAnimationLoop = vi.fn();
    const getAnimationState = vi.fn().mockReturnValue({
      time: 0,
      duration: 2,
      playing: false,
      loop: false,
      speed: 1,
    });

    useAnimationStore.getState().setRuntimeTransportAdapter({
      playAnimation,
      pauseAnimation,
      stopAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
    });
    useAnimationStore.getState().addTrack("input_a", "Input A", "controls/a");

    const hook = renderTransportHook();

    act(() => {
      hook.result.stop();
    });
    seekAnimation.mockClear();
    playAnimation.mockClear();
    pauseAnimation.mockClear();

    act(() => {
      hook.result.seek(0.75);
    });

    expect(playAnimation).toHaveBeenCalledWith("authoring.timeline.main", {
      reset: false,
      speed: 1,
    });
    expect(pauseAnimation).toHaveBeenCalledWith("authoring.timeline.main");
    expect(seekAnimation).toHaveBeenCalledWith("authoring.timeline.main", 0.75);
    const state = useAnimationStore.getState();
    expect(state.currentTime).toBe(0.75);
    expect(state.transportActive).toBe(true);
    expect(state.transportPlaybackState).toBe("paused");
    hook.unmount();
  });
});

describe("AnimationRuntimeBridge", () => {
  beforeEach(() => {
    useAnimationStore.getState().reset();
    runtimeContext.required = null;
    runtimeContext.optional = null;
  });

  it("does not publish muted animation bundles while inactive", () => {
    const runtime = makeRuntimeMock();
    runtimeContext.required = runtime;
    const clip = makeAuthoredClip();

    const bridge = renderAnimationBridge({ active: false, clip });

    expect(runtime.setGraphBundle).not.toHaveBeenCalled();
    expect(useAnimationStore.getState().transportRuntimeReady).toBe(false);

    bridge.rerender(true);

    expect(runtime.setGraphBundle).toHaveBeenCalledTimes(1);
    expect(useAnimationStore.getState().transportRuntimeReady).toBe(false);
    expect(runtime.setGraphBundle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        animations: expect.arrayContaining([
          expect.objectContaining({
            id: AUTHORED_TIMELINE_CLIP_ID,
          }),
        ]),
      }),
      expect.objectContaining({
        source: expect.objectContaining({
          key: "animation",
          animationId: AUTHORED_TIMELINE_CLIP_ID,
        }),
      }),
    );
    bridge.unmount();
  });

  it("marks converged authored timeline animations ready when the runtime already registered them", () => {
    const clip = makeAuthoredClip();
    const runtime = makeRuntimeMock();
    runtime.assetBundle.animations = buildAnimationPreviewBundle({
      active: true,
      authoredClip: clip,
      currentAnimations: [],
    }).animations as typeof runtime.assetBundle.animations;
    runtimeContext.required = runtime;

    const bridge = renderAnimationBridge({ active: true, clip });

    expect(runtime.setGraphBundle).not.toHaveBeenCalled();
    expect(runtime.hasAnimationController).toHaveBeenCalledWith(
      AUTHORED_TIMELINE_CLIP_ID,
    );
    expect(runtime.getAnimationOutputPaths).toHaveBeenCalledWith(
      AUTHORED_TIMELINE_CLIP_ID,
    );
    expect(
      bridge.graphStore.getState().authoringCompileTargets.animation,
    ).toMatchObject({
      status: "registered",
      signature: expect.any(String),
    });
    expect(useAnimationStore.getState().transportRuntimeReady).toBe(true);

    bridge.unmount();
  });

  it("delegates stopped animation output cleanup to the runtime when deactivated", () => {
    const runtime = makeRuntimeMock();
    runtimeContext.required = runtime;
    const clip = makeAuthoredClip();

    const bridge = renderAnimationBridge({ active: true, clip });
    runtime.stopAnimation.mockClear();
    runtime.setInput.mockClear();
    runtime.stagePoseNeutral.mockClear();

    bridge.rerender(false);

    expect(runtime.stopAnimation).toHaveBeenCalledWith(
      AUTHORED_TIMELINE_CLIP_ID,
      { clearOutputs: true },
    );
    expect(runtime.setInput).not.toHaveBeenCalled();
    expect(runtime.stagePoseNeutral).not.toHaveBeenCalled();
    bridge.unmount();
  });
});

import React, { act } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AUTHORED_TIMELINE_CLIP_ID } from "@vizij/studio-support";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
} from "../../state/graphRuntimeStore";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../../state/bindingAuthoringStore";
import { useAnimationStore } from "../../state/animationStore";
import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import { Viewer } from "./Viewer";

const motionGraphValueSamplerSpy = vi.hoisted(() => vi.fn());
const runtimeProviderProps = vi.hoisted(() => ({
  current: null as {
    onRegisterControllers?: (ids: {
      graphs: string[];
      anims: string[];
    }) => void;
    onRuntimeGraphBundleApplied?: (event: {
      source: { key?: string; signature?: string | null };
      controllers: { graphs: string[]; anims: string[] };
      revision: number;
      reregistered: boolean;
      reloadedAssets: boolean;
    }) => void;
  } | null,
}));
const runtimeControllerState = vi.hoisted(() => ({
  current: { graphs: [] as string[], anims: [] as string[] },
}));
const runtimeErrorState = vi.hoisted(() => ({
  current: null as {
    message: string;
    timestamp: number;
    phase?: string;
  } | null,
}));
const stepSpy = vi.fn();
const setInputSpy = vi.fn();
const runtimeAssetBundleState: {
  animations: Array<{ id: string; clip: { tracks: unknown[] } }>;
  programs: Array<{
    id: string;
    graph: { id: string; spec: { nodes: unknown[]; edges: unknown[] } };
    resetValues?: Record<string, number>;
  }>;
} = {
  animations: [],
  programs: [],
};
const setGraphBundleSpy = vi.fn((payload: unknown) => {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "animations")
  ) {
    const animations = (payload as { animations?: unknown }).animations;
    runtimeAssetBundleState.animations = Array.isArray(animations)
      ? (animations as Array<{ id: string; clip: { tracks: unknown[] } }>)
      : [];
  }
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "programs")
  ) {
    const programs = (payload as { programs?: unknown }).programs;
    runtimeAssetBundleState.programs = Array.isArray(programs)
      ? (programs as typeof runtimeAssetBundleState.programs)
      : [];
  }
});
const setVizijStoreSpy = vi.fn();
const stopAnimationSpy = vi.fn();
const setAnimationActiveSpy = vi.fn();
const pauseAnimationSpy = vi.fn();
const getAnimationStateSpy = vi.fn().mockReturnValue(null);
const playProgramSpy = vi.fn();
const pauseProgramSpy = vi.fn();
const stopProgramSpy = vi.fn();

vi.mock("@vizij/render", () => ({
  useVizijStore: <T,>(
    selector: (state: {
      animatables: Record<string, { default?: number }>;
      elementSelection: Array<{
        id: string;
        type?: string;
        namespace?: string;
      }>;
      world: Record<string, { type?: string }>;
    }) => T,
  ): T =>
    selector({
      animatables: {},
      elementSelection: [],
      world: {},
    }),
  useVizijStoreSetter: () => setVizijStoreSpy,
}));

vi.mock("@vizij/runtime-react", () => ({
  VizijRuntimeProvider: ({
    children,
    onRegisterControllers,
    onRuntimeGraphBundleApplied,
  }: {
    children: React.ReactNode;
    onRegisterControllers?: (ids: {
      graphs: string[];
      anims: string[];
    }) => void;
    onRuntimeGraphBundleApplied?: (event: {
      source: { key?: string; signature?: string | null };
      controllers: { graphs: string[]; anims: string[] };
      revision: number;
      reregistered: boolean;
      reloadedAssets: boolean;
    }) => void;
  }) => {
    runtimeProviderProps.current = {
      onRegisterControllers,
      onRuntimeGraphBundleApplied,
    };
    return <div data-testid="runtime-provider">{children}</div>;
  },
  VizijRuntimeFace: ({ className }: { className?: string }) => (
    <div data-testid="runtime-face" className={className} />
  ),
  useVizijRuntime: () => ({
    setInput: setInputSpy,
    step: stepSpy,
    ready: true,
    loading: false,
    rootId: "root",
    error: runtimeErrorState.current,
    controllers: runtimeControllerState.current,
    outputPaths: [],
    assetBundle: runtimeAssetBundleState,
    setGraphBundle: setGraphBundleSpy,
    stopAnimation: stopAnimationSpy,
    setAnimationActive: setAnimationActiveSpy,
    pauseAnimation: pauseAnimationSpy,
    getAnimationState: getAnimationStateSpy,
    playProgram: playProgramSpy,
    pauseProgram: pauseProgramSpy,
    stopProgram: stopProgramSpy,
  }),
}));

vi.mock("../../motiongraph/components/MotionGraphValueSampler", () => ({
  MotionGraphValueSampler: ({ active }: { active: boolean }) => {
    motionGraphValueSamplerSpy({ active });
    return (
      <div
        data-testid="motiongraph-value-sampler"
        data-active={String(active)}
      />
    );
  },
}));

vi.mock("../../motiongraph/components/InputValueBridge", () => ({
  InputValueBridge: () => <div data-testid="input-value-bridge" />,
}));

type ViewerProps = React.ComponentProps<typeof Viewer>;

function makeRuntimeProgramGraph() {
  return {
    nodes: [
      {
        id: "constant",
        type: "constant",
        position: { x: 0, y: 0 },
        data: { params: { value: "0.35" } },
      },
      {
        id: "target",
        type: "__output_target",
        position: { x: 120, y: 0 },
        data: { outputPath: "rig/face/standard/brow/inner_up" },
      },
    ],
    edges: [
      {
        id: "e-constant-target",
        source: "constant",
        target: "target",
        targetHandle: "input",
      },
    ],
  };
}

function renderViewer(props: ViewerProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  const store = createGraphRuntimeStore();
  const bindingStore = createBindingAuthoringStore();

  act(() => {
    root = createRoot(container);
    root.render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer {...props} />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Viewer", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    motionGraphValueSamplerSpy.mockReset();
    runtimeAssetBundleState.animations = [];
    runtimeAssetBundleState.programs = [];
    runtimeControllerState.current = { graphs: [], anims: [] };
    runtimeErrorState.current = null;
    runtimeProviderProps.current = null;
    setVizijStoreSpy.mockReset();
    stopAnimationSpy.mockReset();
    setAnimationActiveSpy.mockReset();
    pauseAnimationSpy.mockReset();
    getAnimationStateSpy.mockClear();
    playProgramSpy.mockReset();
    pauseProgramSpy.mockReset();
    stopProgramSpy.mockReset();
    useAnimationStore.getState().reset();
    useEditorStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows empty scene state when no rootId", () => {
    const { container, unmount } = renderViewer({
      rootId: null,
      namespace: "vizij",
      bundle: null,
      onClearSelection: () => {},
      showSelectionGlow: false,
      onImportClick: () => {},
      onLoadQuori: () => {},
    });

    expect(container.textContent).toContain("Empty Scene");
    expect(container.querySelector('[data-testid="runtime-face"]')).toBeNull();
    unmount();
  });

  it("renders runtime face when rootId is present", () => {
    const { container, unmount } = renderViewer({
      rootId: "root-1",
      namespace: "vizij",
      bundle: {
        namespace: "vizij",
        glb: {
          kind: "world",
          world: {} as any,
          animatables: {} as any,
          bundle: null,
        },
      },
      onClearSelection: () => {},
      showSelectionGlow: true,
      onImportClick: () => {},
      onLoadQuori: () => {},
    });

    expect(
      container.querySelector('[data-testid="runtime-provider"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="runtime-face"]'),
    ).toBeTruthy();
    unmount();
  });

  it("keeps runtime bridge diagnostics quiet by default", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const animationStore = useAnimationStore.getState();
    animationStore.addTrack("rig/face/standard/blink", "Blink");
    animationStore.addKeyframe("track-0001", 0, 0);
    animationStore.addKeyframe("track-0001", 1, 1);
    const { unmount } = renderViewer({
      rootId: "root-1",
      namespace: "vizij",
      bundle: {
        namespace: "vizij",
        glb: {
          kind: "world",
          world: {} as any,
          animatables: {} as any,
          bundle: null,
        },
      },
      onClearSelection: () => {},
      showSelectionGlow: true,
      onImportClick: () => {},
      onLoadQuori: () => {},
    });

    try {
      expect(logSpy).not.toHaveBeenCalledWith(
        "[vizij-runtime][graph-bridge]",
        expect.anything(),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        "[vizij-runtime][viewer]",
        expect.anything(),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        "[timeline][animation-bridge] apply animations",
        expect.anything(),
      );
    } finally {
      unmount();
      logSpy.mockRestore();
    }
  });

  it("polls animation playback so direct runtime play can surface state", () => {
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const cancelAnimationFrameSpy = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const animationStore = useAnimationStore.getState();
    animationStore.addTrack("rig/face/standard/blink", "Blink");
    animationStore.addKeyframe("track-0001", 0, 0);
    animationStore.addKeyframe("track-0001", 1, 1);
    const { unmount } = renderViewer({
      rootId: "root-1",
      namespace: "vizij",
      bundle: {
        namespace: "vizij",
        glb: {
          kind: "world",
          world: {} as any,
          animatables: {} as any,
          bundle: null,
        },
      },
      onClearSelection: () => {},
      showSelectionGlow: true,
      onImportClick: () => {},
      onLoadQuori: () => {},
    });

    try {
      expect(getAnimationStateSpy).toHaveBeenCalledWith(
        AUTHORED_TIMELINE_CLIP_ID,
      );
      expect(requestAnimationFrameSpy).toHaveBeenCalled();
    } finally {
      unmount();
      expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1);
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("stages input without forcing step", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              rig: { id: "rig", spec: { nodes: [] } },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    store.getState().stageRuntimeInput?.("rig/face/standard/mouth/x", 0.5);

    expect(setInputSpy).toHaveBeenCalled();
    expect(stepSpy).not.toHaveBeenCalled();
  });

  it("registers rig and pose graph payloads concurrently", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [] } as any,
      poseGraphSpec: { nodes: [] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });
    const bindingStore = createBindingAuthoringStore();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: {
                kind: "world",
                world: {},
                animatables: {},
                bundle: null,
              },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.any(String),
        }),
      }),
    );
  });

  it("marks a compile target registered only after a matching runtime bundle ack", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-ack" }] } as any,
    });
    const bindingStore = createBindingAuthoringStore();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: {
                kind: "world",
                world: {},
                animatables: {},
                bundle: null,
              },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    const signature =
      store.getState().authoringCompileTargets["runtime-graph"].signature;
    expect(signature).toContain("rig-ack");
    expect(
      store.getState().authoringCompileTargets["runtime-graph"].status,
    ).toBe("compiled");

    act(() => {
      runtimeProviderProps.current?.onRegisterControllers?.({
        graphs: ["graph-1"],
        anims: [],
      });
    });

    expect(store.getState().runtimeViewGraphCount).toBe(1);
    expect(
      store.getState().authoringCompileTargets["runtime-graph"].status,
    ).toBe("compiled");

    act(() => {
      runtimeProviderProps.current?.onRuntimeGraphBundleApplied?.({
        revision: 1,
        source: {
          key: "runtime-graph",
          signature: "stale-signature",
        },
        controllers: { graphs: ["graph-1"], anims: [] },
        reregistered: true,
        reloadedAssets: false,
      });
    });

    expect(
      store.getState().authoringCompileTargets["runtime-graph"].status,
    ).toBe("compiled");

    act(() => {
      runtimeProviderProps.current?.onRuntimeGraphBundleApplied?.({
        revision: 2,
        source: {
          key: "runtime-graph",
          signature,
        },
        controllers: { graphs: ["graph-1"], anims: [] },
        reregistered: true,
        reloadedAssets: false,
      });
    });

    expect(
      store.getState().authoringCompileTargets["runtime-graph"],
    ).toMatchObject({
      status: "registered",
      message: null,
      signature,
    });
  });

  it("applies runtime errors only to the active compile target", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    store.setState({
      authoringCompileStatus: "registered",
      authoringCompileTarget: "runtime-graph",
      authoringCompileMessage: null,
      authoringCompileSignature: "graph-v1",
    });
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });
    runtimeErrorState.current = {
      message: "animation registration failed",
      phase: "animation",
      timestamp: 1,
    };

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: {
                kind: "world",
                world: {},
                animatables: {},
                bundle: null,
              },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(
      store.getState().authoringCompileTargets["runtime-graph"],
    ).toMatchObject({
      status: "registered",
      message: null,
      signature: "graph-v1",
    });
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "runtime-error",
      message: "animation registration failed",
    });
  });

  it("does not clear imported rig or pose assets before authoring owns a graph payload", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: {
                kind: "world",
                world: {},
                animatables: {},
                bundle: null,
              },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).not.toHaveBeenCalledWith(
      { rig: undefined, pose: undefined },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.stringContaining("rig-1"),
        }),
      }),
    );
    expect(setGraphBundleSpy).not.toHaveBeenCalled();
  });

  it("does not inject authored timeline animations when animation source is inactive", () => {
    useAnimationStore
      .getState()
      .addTrack("input_a", "Input A", "controls/input_a");

    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const { rerender } = render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive={false}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(stopAnimationSpy).toHaveBeenCalledWith(AUTHORED_TIMELINE_CLIP_ID, {
      clearOutputs: true,
    });
    expect(setAnimationActiveSpy).toHaveBeenCalledWith(false);
  });

  it("removes inherited runtime animations while inactive and restores them when re-enabled", () => {
    runtimeAssetBundleState.animations = [
      {
        id: "bundle.imported.blink",
        clip: {
          tracks: [
            {
              channel: "rig/face/standard/blink",
              keyframes: [{ time: 0, value: 1 }],
            },
          ],
        },
      },
    ];

    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const { rerender } = render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive={false}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    const inactiveAnimationCalls = setGraphBundleSpy.mock.calls.filter(
      ([payload]) =>
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { animations?: unknown }).animations),
    );
    expect(inactiveAnimationCalls.length).toBeGreaterThan(0);
    expect(
      inactiveAnimationCalls.some(([payload]) =>
        (
          payload as {
            animations: Array<{ id: string; clip: { tracks: unknown[] } }>;
          }
        ).animations.some(
          (animation) =>
            animation.id === "bundle.imported.blink" &&
            Array.isArray(animation.clip?.tracks) &&
            animation.clip.tracks.length === 0,
        ),
      ),
    ).toBe(true);

    rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    const animationCalls = setGraphBundleSpy.mock.calls.filter(
      ([payload]) =>
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { animations?: unknown }).animations),
    );
    expect(animationCalls.length).toBeGreaterThan(0);
    expect(
      animationCalls.some(([payload]) =>
        (payload as { animations: Array<{ id: string }> }).animations.some(
          (animation) => animation.id === "bundle.imported.blink",
        ),
      ),
    ).toBe(true);
  });

  it("injects authored timeline animation bundle when animation source is active", () => {
    useAnimationStore
      .getState()
      .addTrack("input_a", "Input A", "controls/input_a");

    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    const animationBundleCalls = setGraphBundleSpy.mock.calls.filter(
      ([payload]) =>
        payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { animations?: unknown }).animations),
    );
    expect(animationBundleCalls.length).toBeGreaterThan(0);
    expect(
      animationBundleCalls.some(([payload]) =>
        (payload as { animations: Array<{ id: string }> }).animations.some(
          (animation) => animation.id === AUTHORED_TIMELINE_CLIP_ID,
        ),
      ),
    ).toBe(true);
  });

  it("keeps the authored animation target registered after the runtime signature catches up", () => {
    useAnimationStore
      .getState()
      .addTrack("input_a", "Input A", "controls/input_a");

    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const renderSubject = () => (
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            animationSourceActive
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>
    );
    const { rerender } = render(renderSubject());

    const animationCall = (
      setGraphBundleSpy.mock.calls as Array<
        [unknown, { source?: { signature?: string | null } }?]
      >
    )
      .filter(
        ([payload]) =>
          payload &&
          typeof payload === "object" &&
          Array.isArray((payload as { animations?: unknown }).animations),
      )
      .at(-1);
    const signature = animationCall?.[1]?.source?.signature;
    expect(signature).toEqual(expect.any(String));
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "compiled",
      signature,
    });

    act(() => {
      runtimeProviderProps.current?.onRuntimeGraphBundleApplied?.({
        revision: 1,
        source: {
          key: "animation",
          signature,
        },
        controllers: { graphs: [], anims: [AUTHORED_TIMELINE_CLIP_ID] },
        reregistered: true,
        reloadedAssets: false,
      });
    });

    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "registered",
      signature,
    });

    act(() => {
      rerender(renderSubject());
    });

    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "registered",
      signature,
    });
  });

  it("emits add/update/remove graph bundle transitions", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });
    const bindingStore = createBindingAuthoringStore();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    const graphBundleCalls = () =>
      setGraphBundleSpy.mock.calls.filter(
        ([payload]) =>
          payload &&
          typeof payload === "object" &&
          !Object.prototype.hasOwnProperty.call(payload, "animations"),
      );

    const initialGraphCall =
      graphBundleCalls()[graphBundleCalls().length - 1] ?? null;
    expect(initialGraphCall).toEqual([
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.stringContaining("rig-1"),
        }),
      }),
    ]);
    expect(graphBundleCalls().length).toBe(1);
    expect(
      store.getState().authoringCompileTargets["runtime-graph"],
    ).toMatchObject({
      status: "compiled",
      message: null,
    });
    expect(
      store.getState().authoringCompileTargets["runtime-graph"].signature,
    ).toContain("rig-1");

    act(() => {
      store.setState({
        poseGraphSpec: undefined,
        poseConfig: undefined,
      });
    });

    const secondGraphCall = graphBundleCalls()[graphBundleCalls().length - 1];
    expect(secondGraphCall).toEqual([
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: undefined,
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.any(String),
        }),
      }),
    ]);
    expect(graphBundleCalls().length).toBe(2);

    act(() => {
      store.setState({
        graphSpec: undefined,
      });
    });

    const finalGraphCall = graphBundleCalls()[graphBundleCalls().length - 1];
    expect(finalGraphCall).toEqual([
      {
        rig: undefined,
        pose: undefined,
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.any(String),
        }),
      }),
    ]);
    expect(graphBundleCalls().length).toBe(3);
  });

  it("registers pose graph only when rig graph is absent", () => {
    const store = createGraphRuntimeStore({
      graphSpec: undefined,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });
    const bindingStore = createBindingAuthoringStore();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: undefined,
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "runtime-graph",
          signature: expect.stringContaining("pose-1"),
        }),
      }),
    );
  });

  it("resets managed input IDs to their defaults", () => {
    const store = createGraphRuntimeStore();
    const applyStandardInputBatchSpy = vi.fn();
    const bindingStore = createBindingAuthoringStore({
      managedStandardInputs: [
        {
          input: {
            id: "jaw_open",
            label: "Jaw Open",
            path: "/standard/jaw/open",
            range: { min: -1, max: 1 },
            defaultValue: 0.5,
          } as any,
          source: "custom",
          disabled: false,
        },
        {
          input: {
            id: "jaw_control",
            label: "Pose Control Jaw",
            path: "/pose/control/jaw_open",
            range: { min: 0, max: 1 },
            defaultValue: 0.9,
          } as any,
          source: "auto",
          disabled: false,
        },
        {
          input: {
            id: "pose_smile_weight",
            label: "Smile Weight",
            path: "/poses/pose_smile.weight",
            range: { min: 0, max: 1 },
          } as any,
          source: "auto",
          disabled: false,
        },
      ],
      applyStandardInputBatch: applyStandardInputBatchSpy,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphRuntimeStoreProvider store={store}>
          <BindingAuthoringStoreProvider store={bindingStore}>
            <Viewer
              rootId="root"
              namespace="default"
              bundle={{
                namespace: "default",
                glb: {
                  kind: "world",
                  world: {},
                  animatables: {},
                  bundle: null,
                },
                bundle: null,
              }}
              onClearSelection={() => {}}
              showSelectionGlow={false}
              onImportClick={() => {}}
              onLoadQuori={() => {}}
            />
          </BindingAuthoringStoreProvider>
        </GraphRuntimeStoreProvider>,
      );
    });

    const resetButton = container.querySelector(
      'button[title="Reset main-face inputs to their default values"]',
    );
    expect(resetButton).toBeTruthy();
    fireEvent.click(resetButton as HTMLButtonElement);

    expect(applyStandardInputBatchSpy).toHaveBeenCalledWith({
      jaw_open: 0.5,
      pose_smile_weight: 0,
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("skips runtime reset when only pose-control inputs exist", () => {
    const store = createGraphRuntimeStore();
    const applyStandardInputBatchSpy = vi.fn();
    const bindingStore = createBindingAuthoringStore({
      managedStandardInputs: [
        {
          input: {
            id: "pose_control_jaw",
            label: "Pose Control Jaw",
            path: "/pose/control/jaw_open",
            range: { min: 0, max: 1 },
            defaultValue: 0.5,
          } as any,
          source: "auto",
          disabled: false,
        },
      ],
      applyStandardInputBatch: applyStandardInputBatchSpy,
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <GraphRuntimeStoreProvider store={store}>
          <BindingAuthoringStoreProvider store={bindingStore}>
            <Viewer
              rootId="root"
              namespace="default"
              bundle={{
                namespace: "default",
                glb: {
                  kind: "world",
                  world: {},
                  animatables: {},
                  bundle: null,
                },
                bundle: null,
              }}
              onClearSelection={() => {}}
              showSelectionGlow={false}
              onImportClick={() => {}}
              onLoadQuori={() => {}}
            />
          </BindingAuthoringStoreProvider>
        </GraphRuntimeStoreProvider>,
      );
    });

    const resetButton = container.querySelector(
      'button[title="Reset main-face inputs to their default values"]',
    );
    expect(resetButton).toBeTruthy();
    fireEvent.click(resetButton as HTMLButtonElement);

    expect(applyStandardInputBatchSpy).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps motion-graph sampling active while plotting a runtime snapshot", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    act(() => {
      useEditorStore.getState().togglePlot();
    });

    expect(motionGraphValueSamplerSpy).toHaveBeenLastCalledWith({
      active: true,
    });
  });

  it("publishes active procedural programs through the runtime graph bundle", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            motionGraphRuntimeResetValues={[
              {
                path: "rig/face/standard/brow/inner_up",
                value: 0.35,
              },
            ]}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenCalledWith(
      {
        programs: [
          expect.objectContaining({
            id: "graph:test",
            graph: expect.objectContaining({
              id: "graph:test.graph",
              spec: expect.objectContaining({
                nodes: expect.arrayContaining([
                  {
                    id: "target",
                    type: "output",
                    params: { path: "rig/face/standard/brow/inner_up" },
                  },
                ]),
              }),
            }),
            resetValues: {
              "rig/face/standard/brow/inner_up": 0.35,
            },
          }),
        ],
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "motiongraph",
          signature: expect.any(String),
        }),
      }),
    );
  });

  it("preserves unrelated bundle programs when publishing the active procedural program", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();
    runtimeAssetBundleState.programs = [
      {
        id: "bundle:idle",
        graph: {
          id: "bundle:idle.graph",
          spec: {
            nodes: [
              {
                id: "out",
                type: "output",
                params: { path: "rig/face/standard/gaze/left_right" },
              },
            ],
            edges: [],
          },
        },
      },
    ];

    render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenCalledWith(
      {
        programs: [
          expect.objectContaining({ id: "bundle:idle" }),
          expect.objectContaining({ id: "graph:test" }),
        ],
      },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "motiongraph",
          signature: expect.any(String),
        }),
      }),
    );
  });

  it("drives active procedural program playback through the runtime API", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();
    const view = render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    view.rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(playProgramSpy).toHaveBeenCalledWith("graph:test");
  });

  it("retries active procedural program playback after controller registration changes", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();
    const props = {
      rootId: "root",
      namespace: "default",
      bundle: {
        namespace: "default",
        glb: {
          kind: "world" as const,
          world: {},
          animatables: {},
          bundle: null,
        },
        bundle: null,
      },
      motionGraphPlaybackState: "playing" as const,
      motionGraphRuntimeControllerId: "graph:test",
      motionGraphRuntimeNodes: graph.nodes,
      motionGraphRuntimeEdges: graph.edges,
      onClearSelection: () => {},
      showSelectionGlow: false,
      onImportClick: () => {},
      onLoadQuori: () => {},
    };
    const view = render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer {...props} />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(playProgramSpy).toHaveBeenCalledTimes(1);

    view.rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer {...props} />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(playProgramSpy).toHaveBeenCalledTimes(1);

    runtimeControllerState.current = { graphs: ["graph:test"], anims: [] };
    view.rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer {...props} />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(playProgramSpy).toHaveBeenCalledTimes(2);
  });

  it("stops and clears the managed runtime program when the runtime session stops", () => {
    const store = createGraphRuntimeStore();
    const bindingStore = createBindingAuthoringStore();
    const graph = makeRuntimeProgramGraph();
    const view = render(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="playing"
            motionGraphRuntimeControllerId="graph:test"
            motionGraphRuntimeNodes={graph.nodes}
            motionGraphRuntimeEdges={graph.edges}
            motionGraphRuntimeResetValues={[
              {
                path: "rig/face/standard/brow/inner_up",
                value: 0.35,
              },
            ]}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    view.rerender(
      <GraphRuntimeStoreProvider store={store}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <Viewer
            rootId="root"
            namespace="default"
            bundle={{
              namespace: "default",
              glb: { kind: "world", world: {}, animatables: {}, bundle: null },
              bundle: null,
            }}
            motionGraphPlaybackState="stopped"
            motionGraphRuntimeControllerId={null}
            motionGraphRuntimeNodes={null}
            motionGraphRuntimeEdges={null}
            motionGraphRuntimeResetValues={[]}
            onClearSelection={() => {}}
            showSelectionGlow={false}
            onImportClick={() => {}}
            onLoadQuori={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(stopProgramSpy).toHaveBeenCalledWith("graph:test");
    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      { programs: [] },
      expect.objectContaining({
        tier: "graphs",
        source: expect.objectContaining({
          key: "motiongraph",
          signature: expect.any(String),
        }),
      }),
    );
  });
});

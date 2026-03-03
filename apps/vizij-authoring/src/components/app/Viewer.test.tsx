import React, { act } from "react";
import { fireEvent, render } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
} from "../../state/graphRuntimeStore";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../../state/bindingAuthoringStore";
import { useAnimationStore } from "../../state/animationStore";
import { AUTHORED_TIMELINE_CLIP_ID } from "../../types/animationClipIr";
import { Viewer } from "./Viewer";

const stepSpy = vi.fn();
const setInputSpy = vi.fn();
const setGraphBundleSpy = vi.fn();
const setVizijStoreSpy = vi.fn();
const stopAnimationSpy = vi.fn();
const setAnimationActiveSpy = vi.fn();
const pauseAnimationSpy = vi.fn();
const getAnimationStateSpy = vi.fn().mockReturnValue(null);

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
  VizijRuntimeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="runtime-provider">{children}</div>
  ),
  VizijRuntimeFace: ({ className }: { className?: string }) => (
    <div data-testid="runtime-face" className={className} />
  ),
  useVizijRuntime: () => ({
    setInput: setInputSpy,
    step: stepSpy,
    ready: true,
    loading: false,
    rootId: "root",
    error: null,
    controllers: { graphs: [] },
    outputPaths: [],
    setGraphBundle: setGraphBundleSpy,
    stopAnimation: stopAnimationSpy,
    setAnimationActive: setAnimationActiveSpy,
    pauseAnimation: pauseAnimationSpy,
    getAnimationState: getAnimationStateSpy,
  }),
}));
type ViewerProps = React.ComponentProps<typeof Viewer>;

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
    setVizijStoreSpy.mockReset();
    stopAnimationSpy.mockReset();
    setAnimationActiveSpy.mockReset();
    pauseAnimationSpy.mockReset();
    getAnimationStateSpy.mockClear();
    useAnimationStore.getState().reset();
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
      onLoadHugo: () => {},
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
      onLoadHugo: () => {},
    });

    expect(
      container.querySelector('[data-testid="runtime-provider"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="runtime-face"]'),
    ).toBeTruthy();
    unmount();
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
            onLoadHugo={() => {}}
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
            onLoadHugo={() => {}}
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
      { tier: "graphs" },
    );
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
            onLoadHugo={() => {}}
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
            onLoadHugo={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(stopAnimationSpy).toHaveBeenCalledWith(AUTHORED_TIMELINE_CLIP_ID, {
      clearOutputs: true,
    });
    expect(setAnimationActiveSpy).toHaveBeenCalledWith(false);
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
            onLoadHugo={() => {}}
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
            onLoadHugo={() => {}}
          />
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      { tier: "graphs" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        poseGraphSpec: undefined,
        poseConfig: undefined,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: undefined,
          config: undefined,
        },
      },
      { tier: "graphs" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);

    act(() => {
      store.setState({
        graphSpec: undefined,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: undefined,
        pose: undefined,
      },
      { tier: "graphs" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(3);
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
            onLoadHugo={() => {}}
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
      { tier: "graphs" },
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
              onLoadHugo={() => {}}
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
              onLoadHugo={() => {}}
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
});

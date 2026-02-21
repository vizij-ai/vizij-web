import React, { act } from "react";
import { render } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
} from "../../state/graphRuntimeStore";
import {
  getRuntimePerfMetricsSnapshot,
  resetRuntimePerfMetrics,
} from "../../perf/runtimePerfMetrics";
import { Viewer } from "./Viewer";

const stepSpy = vi.fn();
const setInputSpy = vi.fn();
const setGraphBundleSpy = vi.fn();
const selectElementByIdSpy = vi.fn();
let runtimeSelectedElementId: string | null = null;

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
    firstFrameReady: true,
    controllableReady: true,
    loading: false,
    rootId: "root",
    error: null,
    controllers: { graphs: [] },
    outputPaths: [],
    setGraphBundle: setGraphBundleSpy,
    selectedElementId: runtimeSelectedElementId,
    selectElementById: selectElementByIdSpy,
  }),
}));
type ViewerProps = React.ComponentProps<typeof Viewer>;

function renderViewer(props: ViewerProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  const store = createGraphRuntimeStore();

  act(() => {
    root = createRoot(container);
    root.render(
      <GraphRuntimeStoreProvider store={store}>
        <Viewer {...props} />
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
    resetRuntimePerfMetrics();
    runtimeSelectedElementId = null;
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
    render(
      <GraphRuntimeStoreProvider store={store}>
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
      </GraphRuntimeStoreProvider>,
    );

    store.getState().stageRuntimeInput?.("rig/face/standard/mouth/x", 0.5);

    expect(setInputSpy).toHaveBeenCalled();
    expect(stepSpy).not.toHaveBeenCalled();
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);
    expect(getRuntimePerfMetricsSnapshot().graphBridgePublishes).toBe(1);
  });

  it("syncs external scene selection into runtime selection", () => {
    renderViewer({
      rootId: "root",
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
      selectedSceneId: "shape_1",
      onSelectSceneChange: () => {},
      onClearSelection: () => {},
      showSelectionGlow: true,
      onImportClick: () => {},
      onLoadQuori: () => {},
      onLoadHugo: () => {},
    });

    expect(selectElementByIdSpy).toHaveBeenCalledWith("shape_1");
  });

  it("emits runtime selection changes to app selection callback", () => {
    runtimeSelectedElementId = "shape_2";
    const onSelectSceneChange = vi.fn();

    renderViewer({
      rootId: "root",
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
      selectedSceneId: null,
      onSelectSceneChange,
      onClearSelection: () => {},
      showSelectionGlow: true,
      onImportClick: () => {},
      onLoadQuori: () => {},
      onLoadHugo: () => {},
    });

    expect(onSelectSceneChange).toHaveBeenCalledWith("shape_2");
  });

  it("registers rig and pose graph payloads concurrently", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [] } as any,
      poseGraphSpec: { nodes: [] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      { tier: "graphs", mutationClass: "topology" },
    );
  });

  it("publishes topology when pose graph data arrives after rig", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: undefined,
      poseConfig: undefined,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: undefined,
          config: undefined,
        },
      },
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
        poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
        poseGraphSpecRevision: 1,
        poseRuntimeRevision: 1,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps topology mutation class when graph and pose revisions bump together", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        graphSpec: { nodes: [{ id: "rig-2" }] } as any,
        poseGraphSpec: { nodes: [{ id: "pose-2" }] } as any,
        poseConfig: {
          version: 1,
          neutralInputs: {},
          poses: [{ id: "p" }],
        } as any,
        graphSpecRevision: 1,
        poseGraphSpecRevision: 1,
        poseRuntimeRevision: 1,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-2" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-2" }] } },
          config: { version: 1, neutralInputs: {}, poses: [{ id: "p" }] },
        },
      },
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });

  it("emits add/update/remove graph bundle transitions", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        poseGraphSpec: undefined,
        poseConfig: undefined,
        poseGraphSpecRevision: 1,
        poseRuntimeRevision: 1,
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
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);

    act(() => {
      store.setState({
        graphSpec: undefined,
        graphSpecRevision: 1,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: undefined,
        pose: undefined,
      },
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(3);
    expect(getRuntimePerfMetricsSnapshot()).toMatchObject({
      graphBridgePublishes: 3,
      graphBridgeTopologyPublishes: 3,
      graphBridgePosePublishes: 0,
    });
  });

  it("keeps pose mutation class for pose-config-only updates", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
      poseGraphSpecRevision: 1,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        poseConfig: {
          version: 1,
          neutralInputs: {},
          poses: [{ id: "pose_1", values: { smile: 0.4 } }],
        } as any,
        poseRuntimeRevision: 1,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: {
            version: 1,
            neutralInputs: {},
            poses: [{ id: "pose_1", values: { smile: 0.4 } }],
          },
        },
      },
      { tier: "graphs", mutationClass: "pose" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });

  it("forces topology publish when explicit refresh revision changes", () => {
    const store = createGraphRuntimeStore({
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
      poseGraphSpecRevision: 1,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      </GraphRuntimeStoreProvider>,
    );

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState({
        graphBridgeForceTopologyRevision: 1,
      });
    });

    expect(setGraphBundleSpy).toHaveBeenLastCalledWith(
      {
        rig: { id: "rig", spec: { nodes: [{ id: "rig-1" }] } },
        pose: {
          graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
          config: { version: 1, neutralInputs: {}, poses: [] },
        },
      },
      { tier: "graphs", mutationClass: "topology" },
    );
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });

  it("registers pose graph only when rig graph is absent", () => {
    const store = createGraphRuntimeStore({
      graphSpec: undefined,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    render(
      <GraphRuntimeStoreProvider store={store}>
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
      { tier: "graphs", mutationClass: "topology" },
    );
  });
});

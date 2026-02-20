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
      { tier: "graphs", mutationClass: "pose" },
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
      graphBridgeTopologyPublishes: 2,
      graphBridgePosePublishes: 1,
    });
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

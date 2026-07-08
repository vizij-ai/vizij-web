import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { VizijContext, createVizijStore } from "@vizij/render";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../state/bindingAuthoringStore";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
  type GraphRuntimeState,
} from "../state/graphRuntimeStore";
import { useSceneComposer } from "./useSceneComposer";
import type { SceneObjectNode } from "./sceneGraph";

type HookResult = ReturnType<typeof useSceneComposer>;

const scene: SceneObjectNode[] = [
  {
    id: "group",
    name: "Root",
    type: "group",
    parentId: null,
    childIds: ["shape"],
    features: [],
  },
  {
    id: "shape",
    name: "Face",
    type: "shape",
    parentId: "group",
    childIds: [],
    features: [],
  },
];

interface BindingHandlers {
  handleBindingInputChange: ReturnType<typeof vi.fn>;
  handleAddBindingSlot: ReturnType<typeof vi.fn>;
  handleRemoveBindingSlot: ReturnType<typeof vi.fn>;
  handleUpdateBindingExpression: ReturnType<typeof vi.fn>;
  handleUpdateBindingSlotAlias: ReturnType<typeof vi.fn>;
  handleBindingSlotValueTypeChange: ReturnType<typeof vi.fn>;
}

function createBindingHandlers(): BindingHandlers {
  return {
    handleBindingInputChange: vi.fn(),
    handleAddBindingSlot: vi.fn(),
    handleRemoveBindingSlot: vi.fn(),
    handleUpdateBindingExpression: vi.fn(),
    handleUpdateBindingSlotAlias: vi.fn(),
    handleBindingSlotValueTypeChange: vi.fn(),
  };
}

function renderComposerHook() {
  const handlers = createBindingHandlers();
  const vizijStore = createVizijStore();
  const bindingStore = createBindingAuthoringStore({
    sceneObjects: scene,
    sceneObjectRoots: ["group"],
    ...handlers,
  });
  act(() => {
    vizijStore.setState((state) => ({
      ...state,
      world: {
        group: { id: "group", type: "group" },
        shape: { id: "shape", type: "shape" },
      } as any,
      elementSelection: [],
    }));
  });
  const graphStore = createGraphRuntimeStore({
    setStoreState: vizijStore.setState as GraphRuntimeState["setStoreState"],
  });

  const container = document.createElement("div");
  document.body.appendChild(container);

  const result: { current: HookResult | null } = { current: null };

  function HookWrapper() {
    result.current = useSceneComposer();
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <VizijContext.Provider value={vizijStore}>
        <GraphRuntimeStoreProvider store={graphStore}>
          <BindingAuthoringStoreProvider store={bindingStore}>
            <HookWrapper />
          </BindingAuthoringStoreProvider>
        </GraphRuntimeStoreProvider>
      </VizijContext.Provider>,
    );
  });

  return {
    result,
    vizijStore,
    handlers,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

describe("useSceneComposer", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("exposes hierarchy traversal helpers", () => {
    const hook = renderComposerHook();
    expect(hook.result.current).toBeTruthy();
    expect(
      hook.result.current?.getChildren(null).map((node) => node.id),
    ).toEqual(["group"]);
    expect(
      hook.result.current?.getChildren("group").map((node) => node.id),
    ).toEqual(["shape"]);
    expect(
      hook.result.current?.getBreadcrumb("shape").map((node) => node.id),
    ).toEqual(["group", "shape"]);
    hook.unmount();
  });

  it("proxies driver slot actions to binding handlers", () => {
    const hook = renderComposerHook();
    const composer = hook.result.current;
    expect(composer).toBeTruthy();

    act(() => {
      composer?.setDriverInput("target", "input_a", { slotId: "slot1" });
      composer?.addDriverSlot("target");
      composer?.removeDriverSlot("target", "slot1");
      composer?.setDriverExpression("target", "expr");
      composer?.setDriverSlotAlias("target", "slot1", "alias");
      composer?.setDriverSlotValueType("target", "slot1", "scalar");
    });

    expect(hook.handlers.handleBindingInputChange).toHaveBeenCalledWith(
      "target",
      "input_a",
      "slot1",
    );
    expect(hook.handlers.handleAddBindingSlot).toHaveBeenCalledWith("target");
    expect(hook.handlers.handleRemoveBindingSlot).toHaveBeenCalledWith(
      "target",
      "slot1",
    );
    expect(hook.handlers.handleUpdateBindingExpression).toHaveBeenCalledWith(
      "target",
      "expr",
    );
    expect(hook.handlers.handleUpdateBindingSlotAlias).toHaveBeenCalledWith(
      "target",
      "slot1",
      "alias",
    );
    expect(hook.handlers.handleBindingSlotValueTypeChange).toHaveBeenCalledWith(
      "target",
      "slot1",
      "scalar",
    );
    hook.unmount();
  });

  it("supports additive object selection toggles", () => {
    const hook = renderComposerHook();
    const composer = hook.result.current;
    expect(composer).toBeTruthy();

    act(() => {
      composer?.selectObject("group");
    });
    expect(
      hook.vizijStore.getState().elementSelection.map((entry) => entry.id),
    ).toEqual(["group"]);

    act(() => {
      composer?.selectObject("shape", { additive: true });
    });
    expect(
      hook.vizijStore.getState().elementSelection.map((entry) => entry.id),
    ).toEqual(["shape", "group"]);

    act(() => {
      composer?.selectObject("group", { additive: true });
    });
    expect(
      hook.vizijStore.getState().elementSelection.map((entry) => entry.id),
    ).toEqual(["shape"]);

    hook.unmount();
  });
});

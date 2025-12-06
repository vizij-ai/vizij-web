import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSceneComposer } from "./useSceneComposer";
import type { SceneObjectNode } from "./sceneGraph";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../state/bindingAuthoringStore";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
  type GraphRuntimeState,
} from "../state/graphRuntimeStore";
import { VizijContext, createVizijStore } from "@vizij/render";

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
  const bindingStore = createBindingAuthoringStore({
    sceneObjects: scene,
    sceneObjectRoots: ["group"],
    ...handlers,
  });
  const noopSetStoreState: GraphRuntimeState["setStoreState"] = (() =>
    undefined) as GraphRuntimeState["setStoreState"];
  const graphStore = createGraphRuntimeStore({
    setStoreState: noopSetStoreState,
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
    const vizijStore = createVizijStore();
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
});

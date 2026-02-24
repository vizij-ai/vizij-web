import React, { act } from "react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useHierarchyTreeState } from "./useHierarchyTreeState";

type HookResult = ReturnType<typeof useHierarchyTreeState>;

function renderHook(props: { namespace: string; nodes: string[] }) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const result: { current: HookResult | null } = { current: null };
  let renderCount = 0;

  function HookWrapper({
    namespace,
    nodes,
  }: {
    namespace: string;
    nodes: string[];
  }) {
    renderCount += 1;
    result.current = useHierarchyTreeState(namespace, nodes);
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<HookWrapper {...props} />);
  });

  return {
    result,
    rerender: (next: { namespace: string; nodes: string[] }) => {
      act(() => {
        root.render(<HookWrapper {...next} />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
    getRenderCount: () => renderCount,
  };
}

describe("useHierarchyTreeState", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    window.localStorage?.clear();
  });

  it("toggles collapse state for nodes", () => {
    const hook = renderHook({ namespace: "scene", nodes: ["shape", "group"] });
    expect(hook.result.current).toBeTruthy();
    expect(hook.result.current?.isExpanded("shape")).toBe(true);

    act(() => {
      hook.result.current?.toggleNode("shape");
    });
    expect(hook.result.current?.isExpanded("shape")).toBe(false);

    act(() => {
      hook.result.current?.setExpanded("shape", true);
    });
    expect(hook.result.current?.isExpanded("shape")).toBe(true);

    hook.unmount();
  });

  it("drops collapsed state for removed nodes when syncing", () => {
    const hook = renderHook({ namespace: "scene", nodes: ["root", "child"] });

    act(() => {
      hook.result.current?.setExpanded("child", false);
    });
    expect(hook.result.current?.isExpanded("child")).toBe(false);

    hook.rerender({ namespace: "scene", nodes: ["next"] });
    expect(hook.result.current?.isExpanded("next")).toBe(true);

    hook.unmount();
  });

  it("does not dispatch when setExpanded requests the current state", () => {
    const hook = renderHook({ namespace: "scene", nodes: ["shape"] });
    const initialRenderCount = hook.getRenderCount();

    act(() => {
      hook.result.current?.setExpanded("shape", true);
    });
    expect(hook.getRenderCount()).toBe(initialRenderCount);

    act(() => {
      hook.result.current?.setExpanded("shape", false);
    });
    const afterCollapseRenderCount = hook.getRenderCount();
    expect(afterCollapseRenderCount).toBeGreaterThan(initialRenderCount);

    act(() => {
      hook.result.current?.setExpanded("shape", false);
    });
    expect(hook.getRenderCount()).toBe(afterCollapseRenderCount);

    hook.unmount();
  });
});

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import React, { PropsWithChildren } from "react";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";

import { useAnimatableTreeState } from "./useAnimatableTreeState";

type HookResult = ReturnType<typeof useAnimatableTreeState>;

function renderHook(
  callback: (props: { namespace: string; nodes: string[] }) => HookResult,
  initialProps: { namespace: string; nodes: string[] },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const result: { current: HookResult | null } = { current: null };

  function HookWrapper({
    namespace,
    nodes,
  }: PropsWithChildren<{
    namespace: string;
    nodes: string[];
  }>) {
    result.current = callback({ namespace, nodes });
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <HookWrapper
        namespace={initialProps.namespace}
        nodes={initialProps.nodes}
      />,
    );
  });

  return {
    result,
    rerender: (props: { namespace: string; nodes: string[] }) => {
      act(() => {
        root.render(
          <HookWrapper namespace={props.namespace} nodes={props.nodes} />,
        );
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
  };
}

describe("useAnimatableTreeState", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    window.localStorage?.clear();
  });

  it("defaults nodes to expanded and toggles collapsed state", () => {
    const hook = renderHook(
      ({ namespace, nodes }) => useAnimatableTreeState(namespace, nodes),
      { namespace: "test", nodes: ["shape:root"] },
    );

    expect(hook.result.current).toBeTruthy();
    expect(hook.result.current?.isExpanded("shape", "root")).toBe(false);

    act(() => {
      hook.result.current?.toggleNode("shape", "root");
    });
    expect(hook.result.current?.isExpanded("shape", "root")).toBe(true);

    act(() => {
      hook.result.current?.setExpanded("shape", "root", true);
    });
    expect(hook.result.current?.isExpanded("shape", "root")).toBe(true);

    hook.unmount();
  });

  it("syncs collapsed nodes when the set of keys changes", () => {
    const initialNodes = ["shape:one", "shape:two"];
    const hook = renderHook(
      ({ namespace, nodes }) => useAnimatableTreeState(namespace, nodes),
      { namespace: "test", nodes: initialNodes },
    );

    expect(hook.result.current).toBeTruthy();
    expect(hook.result.current?.isExpanded("shape", "one")).toBe(false);

    act(() => {
      hook.result.current?.toggleNode("shape", "one");
    });
    expect(hook.result.current?.isExpanded("shape", "one")).toBe(true);

    hook.rerender({ namespace: "test", nodes: ["shape:two", "shape:three"] });

    expect(hook.result.current?.isExpanded("shape", "two")).toBe(false);
    expect(hook.result.current?.isExpanded("shape", "three")).toBe(false);
    // Nodes removed from the tree no longer carry persisted collapsed state
    expect(hook.result.current?.isExpanded("shape", "one")).toBe(true);

    hook.unmount();
  });
});

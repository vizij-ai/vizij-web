import React, { act } from "react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  computeBlockedHierarchyParentIds,
  useHierarchySurfaceState,
} from "./useHierarchySurfaceState";

type HookResult = ReturnType<typeof useHierarchySurfaceState>;

interface HookProps {
  namespace: string;
  objects: SceneObjectNode[];
  rootIds: string[];
  selectedId: string | null;
}

function createNode(
  id: string,
  parentId: string | null,
  childIds: string[],
): SceneObjectNode {
  return {
    id,
    name: id,
    type: "group",
    parentId,
    childIds,
    features: [],
  };
}

function createBreadcrumbLookup(
  nodesById: Map<string, SceneObjectNode>,
  nodeId: string,
): SceneObjectNode[] {
  const crumbs: SceneObjectNode[] = [];
  let current = nodesById.get(nodeId) ?? null;
  while (current) {
    crumbs.unshift(current);
    if (!current.parentId) {
      break;
    }
    current = nodesById.get(current.parentId) ?? null;
  }
  return crumbs;
}

function renderHook(props: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const result: { current: HookResult | null } = { current: null };

  function HookWrapper({ namespace, objects, rootIds, selectedId }: HookProps) {
    const nodesById = new Map(objects.map((node) => [node.id, node]));
    result.current = useHierarchySurfaceState({
      namespace,
      objects,
      rootIds,
      selectedId,
      getBreadcrumb: (nodeId) => createBreadcrumbLookup(nodesById, nodeId),
    });
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<HookWrapper {...props} />);
  });

  return {
    result,
    rerender: (next: HookProps) => {
      act(() => {
        root.render(<HookWrapper {...next} />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

const sampleTree: SceneObjectNode[] = [
  createNode("root", null, ["head", "torso"]),
  createNode("head", "root", ["eye"]),
  createNode("torso", "root", []),
  createNode("eye", "head", []),
];

describe("useHierarchySurfaceState", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    window.localStorage?.clear();
  });

  it("expands selected node ancestors when selection changes", () => {
    const hook = renderHook({
      namespace: "scene-surface",
      objects: sampleTree,
      rootIds: ["root"],
      selectedId: null,
    });

    act(() => {
      hook.result.current?.setExpanded("root", false);
      hook.result.current?.setExpanded("head", false);
    });
    expect(hook.result.current?.isExpanded("root")).toBe(false);
    expect(hook.result.current?.isExpanded("head")).toBe(false);

    hook.rerender({
      namespace: "scene-surface",
      objects: sampleTree,
      rootIds: ["root"],
      selectedId: "eye",
    });

    expect(hook.result.current?.isExpanded("root")).toBe(true);
    expect(hook.result.current?.isExpanded("head")).toBe(true);

    hook.unmount();
  });

  it("expands matching ancestors when a search query is applied", () => {
    const hook = renderHook({
      namespace: "scene-search",
      objects: sampleTree,
      rootIds: ["root"],
      selectedId: null,
    });

    act(() => {
      hook.result.current?.setExpanded("root", false);
      hook.result.current?.setExpanded("head", false);
    });

    act(() => {
      hook.result.current?.setSearch("eye");
    });

    expect(hook.result.current?.matchingIds.has("eye")).toBe(true);
    expect(hook.result.current?.isExpanded("root")).toBe(true);
    expect(hook.result.current?.isExpanded("head")).toBe(true);
    expect(hook.result.current?.hasVisibleNodes).toBe(true);

    hook.unmount();
  });
});

describe("computeBlockedHierarchyParentIds", () => {
  it("blocks selected node and descendants", () => {
    const nodesById = new Map(sampleTree.map((node) => [node.id, node]));
    const selectedNode = nodesById.get("head") ?? null;
    const blocked = computeBlockedHierarchyParentIds(nodesById, selectedNode);

    expect(blocked.has("head")).toBe(true);
    expect(blocked.has("eye")).toBe(true);
    expect(blocked.has("root")).toBe(false);
    expect(blocked.has("torso")).toBe(false);
  });
});

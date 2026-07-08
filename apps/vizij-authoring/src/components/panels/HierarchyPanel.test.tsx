import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "@vizij/render";
import type { ComponentProps } from "react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { HierarchyPanel } from "./HierarchyPanel";

const mockUseSceneComposer = vi.fn();
let selectionStack: Selection[] = [];
let lockedInspectorTargetIds = new Set<string>();
let handleSetInspectorTargetLocked =
  vi.fn<(targetId: string, locked: boolean) => void>();

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => mockUseSceneComposer(),
}));

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (
    selector: (state: {
      lockedInspectorTargetIds: Set<string>;
      handleSetInspectorTargetLocked: (
        targetId: string,
        locked: boolean,
      ) => void;
    }) => unknown,
  ) =>
    selector({
      lockedInspectorTargetIds,
      handleSetInspectorTargetLocked,
    }),
  useSelectionStore: (
    selector: (state: {
      selectionStack: Selection[];
      handleFocusSelectionIndex: (index: number) => void;
      handleClearSelection: () => void;
    }) => unknown,
  ) =>
    selector({
      selectionStack,
      handleFocusSelectionIndex: () => undefined,
      handleClearSelection: () => undefined,
    }),
}));

function createLockableFeatures(
  targetIds: string[],
): SceneObjectNode["features"] {
  return [
    {
      id: "feature_lockable",
      key: "feature_lockable",
      label: "Lockable",
      defaultLabel: "Lockable",
      type: "number",
      animated: true,
      elementId: "shape",
      elementName: "Shape",
      elementType: "shape",
      components: targetIds.map((targetId, index) => ({
        id: `component_${index}`,
        label: `C${index}`,
        targetId,
      })),
    } as SceneObjectNode["features"][number],
  ];
}

function createFeature(
  key: string,
  targetIds: string[],
): SceneObjectNode["features"][number] {
  return {
    id: `feature_${key}`,
    key,
    label: key,
    defaultLabel: key,
    type: "number",
    animated: true,
    elementId: "shape",
    elementName: "Shape",
    elementType: "shape",
    components: targetIds.map((targetId, index) => ({
      id: `${key}_component_${index}`,
      label: `C${index}`,
      targetId,
    })),
  } as SceneObjectNode["features"][number];
}

function createSceneComposerMock(objects: SceneObjectNode[]) {
  const byId = new Map(objects.map((node) => [node.id, node]));

  const getBreadcrumb = (nodeId: string) => {
    const crumbs: SceneObjectNode[] = [];
    let current = byId.get(nodeId) ?? null;
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
    }
    return crumbs;
  };

  return {
    objects,
    rootIds: objects.filter((node) => node.parentId === null).map((n) => n.id),
    getChildren: (id: string | null) =>
      objects.filter((node) => node.parentId === id),
    getBreadcrumb,
    selectObject: vi.fn(),
    duplicateNode: vi.fn(() => null),
    deleteNode: vi.fn(),
    reparentNode: vi.fn(),
  };
}

function renderPanel(props?: Partial<ComponentProps<typeof HierarchyPanel>>) {
  return render(
    <HierarchyPanel
      showSelectionGlow={false}
      onToggleSelectionGlow={vi.fn()}
      referenceFaceFile={null}
      {...props}
    />,
  );
}

describe("HierarchyPanel", () => {
  beforeEach(() => {
    selectionStack = [];
    lockedInspectorTargetIds = new Set();
    handleSetInspectorTargetLocked = vi.fn((targetId, locked) => {
      if (locked) {
        lockedInspectorTargetIds.add(targetId);
      } else {
        lockedInspectorTargetIds.delete(targetId);
      }
    });
    mockUseSceneComposer.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("forwards Ctrl-click selection as additive", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    const onSelectObject = vi.fn();

    renderPanel({ onSelectObject });

    fireEvent.click(screen.getByText("Shape A"), { ctrlKey: true });

    expect(onSelectObject).toHaveBeenCalledWith("shape_a", {
      additive: true,
    });
  });

  it("forwards Cmd-click selection as additive", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    const onSelectObject = vi.fn();

    renderPanel({ onSelectObject });

    fireEvent.click(screen.getByText("Shape A"), { metaKey: true });

    expect(onSelectObject).toHaveBeenCalledWith("shape_a", {
      additive: true,
    });
  });

  it("deletes only top-level selections during bulk delete", () => {
    const composer = createSceneComposerMock([
      {
        id: "group_a",
        name: "Group A",
        type: "group",
        parentId: null,
        childIds: ["shape_child"],
        features: [],
      },
      {
        id: "shape_child",
        name: "Shape Child",
        type: "shape",
        parentId: "group_a",
        childIds: [],
        features: [],
      },
      {
        id: "shape_other",
        name: "Shape Other",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    selectionStack = [
      { id: "group_a", namespace: DEFAULT_NAMESPACE, type: "group" },
      { id: "shape_child", namespace: DEFAULT_NAMESPACE, type: "shape" },
      { id: "shape_other", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];

    renderPanel();

    fireEvent.click(screen.getByTitle("Delete Selection"));

    expect(composer.deleteNode).toHaveBeenCalledTimes(2);
    expect(composer.deleteNode).toHaveBeenCalledWith("group_a", {
      includeChildren: true,
    });
    expect(composer.deleteNode).toHaveBeenCalledWith("shape_other", {
      includeChildren: true,
    });
  });

  it("reparents all selected top-level nodes in one move action", async () => {
    const composer = createSceneComposerMock([
      {
        id: "root_a",
        name: "Root A",
        type: "group",
        parentId: null,
        childIds: ["shape_a"],
        features: [],
      },
      {
        id: "root_b",
        name: "Root B",
        type: "group",
        parentId: null,
        childIds: ["shape_b"],
        features: [],
      },
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: "root_a",
        childIds: [],
        features: [],
      },
      {
        id: "shape_b",
        name: "Shape B",
        type: "shape",
        parentId: "root_b",
        childIds: [],
        features: [],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    selectionStack = [
      { id: "shape_a", namespace: DEFAULT_NAMESPACE, type: "shape" },
      { id: "shape_b", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];

    renderPanel();

    fireEvent.click(screen.getByTitle("Move Selection"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Move" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    expect(composer.reparentNode).toHaveBeenCalledTimes(2);
    expect(composer.reparentNode).toHaveBeenCalledWith("shape_a", null);
    expect(composer.reparentNode).toHaveBeenCalledWith("shape_b", null);
  });

  it("locks all selected top-level element targets from the Face Elements pane", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: createLockableFeatures(["shape_a:value"]),
      },
      {
        id: "shape_b",
        name: "Shape B",
        type: "shape",
        parentId: null,
        childIds: [],
        features: createLockableFeatures(["shape_b:value"]),
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    selectionStack = [
      { id: "shape_a", namespace: DEFAULT_NAMESPACE, type: "shape" },
      { id: "shape_b", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];

    renderPanel();

    fireEvent.click(screen.getByTitle("Lock Selection"));

    expect(handleSetInspectorTargetLocked).toHaveBeenCalledTimes(2);
    expect(handleSetInspectorTargetLocked).toHaveBeenNthCalledWith(
      1,
      "shape_a:value",
      true,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenNthCalledWith(
      2,
      "shape_b:value",
      true,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_a:value",
      true,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_b:value",
      true,
    );
  });

  it("unlocks all selected top-level element targets when fully locked", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: createLockableFeatures(["shape_a:value"]),
      },
      {
        id: "shape_b",
        name: "Shape B",
        type: "shape",
        parentId: null,
        childIds: [],
        features: createLockableFeatures(["shape_b:value"]),
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    lockedInspectorTargetIds = new Set(["shape_a:value", "shape_b:value"]);
    selectionStack = [
      { id: "shape_a", namespace: DEFAULT_NAMESPACE, type: "shape" },
      { id: "shape_b", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];

    renderPanel();

    fireEvent.click(screen.getByTitle("Unlock Selection"));

    expect(handleSetInspectorTargetLocked).toHaveBeenCalledTimes(2);
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_a:value",
      false,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_b:value",
      false,
    );
  });

  it("locks child selections even when a selected parent is also selected", () => {
    const composer = createSceneComposerMock([
      {
        id: "group_a",
        name: "Group A",
        type: "group",
        parentId: null,
        childIds: ["shape_child"],
        features: [],
      },
      {
        id: "shape_child",
        name: "Shape Child",
        type: "shape",
        parentId: "group_a",
        childIds: [],
        features: createLockableFeatures(["shape_child:value"]),
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    selectionStack = [
      { id: "group_a", namespace: DEFAULT_NAMESPACE, type: "group" },
      { id: "shape_child", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];

    renderPanel();

    fireEvent.click(screen.getByTitle("Lock Selection"));

    expect(handleSetInspectorTargetLocked).toHaveBeenCalledTimes(1);
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_child:value",
      true,
    );
  });

  it("shows per-row locked property counts beside the type icon", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: createLockableFeatures(["shape_a:x", "shape_a:y"]),
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    lockedInspectorTargetIds = new Set(["shape_a:x"]);

    renderPanel();

    expect(screen.getByTitle("Locked properties: 1/2")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("applies smart transform locks across all face elements", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [
          createFeature("translation", ["shape_a:translation:x"]),
          createFeature("color", ["shape_a:color:r"]),
          createFeature("smile", ["shape_a:morph:smile"]),
          createFeature("opacity", ["shape_a:opacity"]),
        ],
      },
      {
        id: "shape_b",
        name: "Shape B",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [
          createFeature("rotation", ["shape_b:rotation:y"]),
          createFeature("color", ["shape_b:color:r"]),
          createFeature("jaw_open", ["shape_b:morph:jaw_open"]),
        ],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);
    selectionStack = [
      { id: "shape_a", namespace: DEFAULT_NAMESPACE, type: "shape" },
    ];
    lockedInspectorTargetIds = new Set([
      "shape_a:color:r",
      "shape_a:morph:smile",
      "shape_b:color:r",
      "shape_b:morph:jaw_open",
    ]);

    renderPanel();

    fireEvent.click(
      screen.getByTitle("Apply Smart Transform Locks (all face elements)"),
    );

    expect(handleSetInspectorTargetLocked).toHaveBeenCalledTimes(6);
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_a:translation:x",
      true,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_b:rotation:y",
      true,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_a:color:r",
      false,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_a:morph:smile",
      false,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_b:color:r",
      false,
    );
    expect(handleSetInspectorTargetLocked).toHaveBeenCalledWith(
      "shape_b:morph:jaw_open",
      false,
    );
    expect(handleSetInspectorTargetLocked).not.toHaveBeenCalledWith(
      "shape_a:opacity",
      expect.anything(),
    );
  });

  it("uses a shrinkable scroll region so the last face element stays fully reachable", () => {
    const composer = createSceneComposerMock([
      {
        id: "shape_a",
        name: "Shape A",
        type: "shape",
        parentId: null,
        childIds: [],
        features: [],
      },
    ]);
    mockUseSceneComposer.mockReturnValue(composer);

    const view = renderPanel();

    const scroller = view.container.querySelector(".custom-scrollbar");
    expect(scroller).toBeTruthy();
    expect(scroller?.className).toContain("min-h-0");
    expect(scroller?.className).toContain("pb-2");
  });
});

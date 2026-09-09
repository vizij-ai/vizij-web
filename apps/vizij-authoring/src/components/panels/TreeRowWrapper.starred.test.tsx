import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { starredRefKey } from "../../state/starredStore";
import { TreeRowWrapper } from "./TreeRowWrapper";
import type { RigNodeSource, TreeNode } from "./variablesTreeModel";

/**
 * Covers the star toggle on its current home. The starred work was authored
 * when this component lived inside VariablesPanel.tsx; the @semio/ui port
 * extracted it, so this row-level wiring was re-applied by hand and had no
 * test of its own.
 */
function rigNode(id: string, source: RigNodeSource = "custom"): TreeNode {
  return {
    id: `rig:${id}`,
    label: id,
    type: "rig",
    children: new Map(),
    showChildren: false,
    data: {
      input: { id, path: id, type: "float" } as never,
      source,
    },
  };
}

function renderRow(node: TreeNode, starredKeys?: ReadonlySet<string>) {
  const onAction = vi.fn();
  render(
    <TreeRowWrapper
      node={node}
      depth={0}
      expanded={new Set()}
      onToggle={vi.fn()}
      onAction={onAction}
      starredKeys={starredKeys}
      searchQuery=""
    />,
  );
  return { onAction };
}

describe("TreeRowWrapper starred toggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers no star when the panel passes no starred set", () => {
    renderRow(rigNode("jaw"));
    expect(screen.queryByTitle("Add to Starred")).toBeNull();
    expect(screen.queryByTitle("Remove from Starred")).toBeNull();
  });

  it("shows an unpressed star for a starrable driver that is not starred", () => {
    renderRow(rigNode("jaw"), new Set<string>());
    const star = screen.getByTitle("Add to Starred");
    expect(star.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a pressed star once the driver's key is in the set", () => {
    const key = starredRefKey({ kind: "driver", id: "jaw" });
    renderRow(rigNode("jaw"), new Set([key]));
    const star = screen.getByTitle("Remove from Starred");
    expect(star.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports a toggle-star action without selecting the row", () => {
    const { onAction } = renderRow(rigNode("jaw"), new Set<string>());
    fireEvent.click(screen.getByTitle("Add to Starred"));
    expect(onAction).toHaveBeenCalledTimes(1);
    const [node, action] = onAction.mock.calls[0];
    expect(action).toBe("toggle-star");
    expect((node as TreeNode).id).toBe("rig:jaw");
  });

  it("offers no star on drivers that belong to another face", () => {
    for (const source of ["reference", "shared"] as RigNodeSource[]) {
      renderRow(rigNode("jaw", source), new Set<string>());
      expect(screen.queryByTitle("Add to Starred")).toBeNull();
      cleanup();
    }
  });
});

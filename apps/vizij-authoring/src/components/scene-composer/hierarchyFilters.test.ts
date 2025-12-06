import { describe, expect, it } from "vitest";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { filterHierarchyNodes } from "./hierarchyFilters";

function createNode(
  id: string,
  name: string,
  childIds: string[] = [],
  parentId: string | null = null,
): SceneObjectNode {
  return {
    id,
    name,
    type: "shape",
    parentId,
    childIds,
    features: [],
  };
}

const nodes = new Map<string, SceneObjectNode>([
  ["root", createNode("root", "Root", ["face"], null)],
  [
    "face",
    createNode("face", "Face Controller", ["eyeLeft", "eyeRight"], "root"),
  ],
  ["eyeLeft", createNode("eyeLeft", "Left Eye", [], "face")],
  ["eyeRight", createNode("eyeRight", "Right Eye", [], "face")],
]);

describe("filterHierarchyNodes", () => {
  it("returns null visibility when the query is empty", () => {
    const result = filterHierarchyNodes(["root"], nodes, "");
    expect(result.visibleIds).toBeNull();
    expect(result.matchingIds.size).toBe(0);
  });

  it("includes ancestors and descendants when a node matches", () => {
    const result = filterHierarchyNodes(["root"], nodes, "left");
    expect(result.visibleIds).not.toBeNull();
    expect(result.visibleIds?.has("root")).toBe(true);
    expect(result.visibleIds?.has("face")).toBe(true);
    expect(result.visibleIds?.has("eyeLeft")).toBe(true);
    expect(result.visibleIds?.has("eyeRight")).toBe(false);
    expect(result.matchingIds.has("eyeLeft")).toBe(true);
  });

  it("returns an empty set when nothing matches the query", () => {
    const result = filterHierarchyNodes(["root"], nodes, "jaw");
    expect(result.visibleIds).not.toBeNull();
    expect(result.visibleIds?.size).toBe(0);
    expect(result.matchingIds.size).toBe(0);
  });
});

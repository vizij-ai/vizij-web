import { describe, expect, it } from "vitest";
import type { EditorNode } from "../store/useEditorStore";
import { withoutTransientNodeFields } from "./editorNodeSnapshot";

function measuredNode(): EditorNode {
  return {
    id: "node_1",
    type: "__output_target",
    position: { x: 12, y: 34 },
    data: { outputPath: "standard/jaw/open" },
    // Written by React Flow, not by the author.
    width: 224,
    height: 305,
    positionAbsolute: { x: 12, y: 34 },
    selected: true,
    dragging: false,
  } as unknown as EditorNode;
}

describe("withoutTransientNodeFields", () => {
  it("drops React Flow's measurements and interaction state", () => {
    const [node] = withoutTransientNodeFields([measuredNode()]);

    expect(node).not.toHaveProperty("width");
    expect(node).not.toHaveProperty("height");
    expect(node).not.toHaveProperty("positionAbsolute");
    expect(node).not.toHaveProperty("selected");
    expect(node).not.toHaveProperty("dragging");
  });

  it("keeps everything the author authored", () => {
    const [node] = withoutTransientNodeFields([measuredNode()]);

    expect(node).toMatchObject({
      id: "node_1",
      type: "__output_target",
      position: { x: 12, y: 34 },
      data: { outputPath: "standard/jaw/open" },
    });
  });

  it("makes a measured node and an unmeasured one the same snapshot", () => {
    // This is the property the autosave guard depends on: measuring a node is
    // not an edit, so it must not produce a different snapshot.
    const measured = measuredNode();
    const unmeasured = measuredNode();
    delete (unmeasured as unknown as Record<string, unknown>).width;
    delete (unmeasured as unknown as Record<string, unknown>).height;
    delete (unmeasured as unknown as Record<string, unknown>).positionAbsolute;
    delete (unmeasured as unknown as Record<string, unknown>).selected;
    delete (unmeasured as unknown as Record<string, unknown>).dragging;

    expect(JSON.stringify(withoutTransientNodeFields([measured]))).toBe(
      JSON.stringify(withoutTransientNodeFields([unmeasured])),
    );
  });

  it("does not mutate the nodes it is given", () => {
    const node = measuredNode();
    withoutTransientNodeFields([node]);

    expect(node).toHaveProperty("width", 224);
  });
});

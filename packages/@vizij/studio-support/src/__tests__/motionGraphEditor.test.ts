import { describe, expect, it } from "vitest";
import { specToEditorState } from "../utils/motionGraphEditor";

describe("specToEditorState", () => {
  it("falls back to auto-layout when only part of the saved layout is present", () => {
    const result = specToEditorState({
      nodes: [
        {
          id: "source",
          type: "input",
          params: { path: "sensors/face/jaw_open" },
        },
        { id: "add-1", type: "add" },
        {
          id: "target",
          type: "output",
          params: { path: "rig/face/poses/neutral.weight" },
        },
      ],
      edges: [
        {
          from: { node_id: "source" },
          to: { node_id: "add-1", input: "operand_0" },
        },
        {
          from: { node_id: "add-1" },
          to: { node_id: "target", input: "in" },
        },
      ],
      layout: {
        target: { x: 900, y: 900 },
      },
    });

    const addNode = result.nodes.find((node) => node.id === "add-1");
    const targetNode = result.nodes.find((node) => node.id === "target");
    expect(addNode?.position).toEqual({ x: 350, y: 0 });
    expect(targetNode?.position).toEqual({ x: 700, y: 0 });
  });

  it("restores variadic input handles that are backed by synthetic defaults", () => {
    const result = specToEditorState({
      nodes: [
        { id: "add-1", type: "add" },
        {
          id: "__const_add-1_operand_1",
          type: "constant",
          params: { value: 0.68 },
        },
        {
          id: "target",
          type: "output",
          params: { path: "rig/face/poses/neutral.weight" },
        },
      ],
      edges: [
        {
          from: { node_id: "__const_add-1_operand_1" },
          to: { node_id: "add-1", input: "operand_1" },
        },
        {
          from: { node_id: "add-1" },
          to: { node_id: "target", input: "in" },
        },
      ],
    });

    const addNode = result.nodes.find((node) => node.id === "add-1");
    expect(addNode?.data?.inputDefaults).toEqual({ operand_1: 0.68 });
    expect(addNode?.data?.variadicInputCount).toBe(2);
  });
});

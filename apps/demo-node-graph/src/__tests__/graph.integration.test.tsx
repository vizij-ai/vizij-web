import { describe, it, expect, vi, beforeEach } from "vitest";
import { nodesToSpec } from "../lib/graph";
import { displayValue } from "../lib/display";
import NodePalette from "../components/NodePalette";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../schema/registry", async () => {
  const actual =
    await vi.importActual<typeof import("../schema/registry")>(
      "../schema/registry",
    );
  return {
    ...actual,
    loadRegistry: vi.fn(async () => ({
      version: "1",
      nodes: [
        {
          type_id: "constant",
          name: "Constant",
          category: "Sources",
          inputs: [],
          outputs: [],
        },
        {
          type_id: "output",
          name: "Output",
          category: "Output",
          inputs: [],
          outputs: [],
        },
      ],
    })),
  };
});

describe("demo-node-graph integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should build graph specs preserving shapes and typed paths", () => {
    const graphNodes = [
      {
        id: "const",
        type: "constant",
        position: { x: 0, y: 0 },
        data: { value: { float: 1 }, label: "Const" },
      },
      {
        id: "out",
        type: "output",
        position: { x: 1, y: 1 },
        data: { label: "Out", path: "robot/Arm.Joint" },
      },
    ];
    const graphEdges = [];

    const spec = nodesToSpec(graphNodes as any, graphEdges as any);
    expect(spec.nodes).toHaveLength(2);

    const outputNode = spec.nodes.find((n) => n.id === "out");
    expect(outputNode?.params.path).toBe("robot/Arm.Joint");
  });

  it("should render palette entries from the schema registry", async () => {
    render(<NodePalette />);

    await waitFor(() => {
      expect(screen.getByText(/Sources/)).not.toBeNull();
    });
    expect(screen.getByText("Constant")).not.toBeNull();
    expect(screen.getByText("Output")).not.toBeNull();
  });

  it("should format composite values for inspection", () => {
    const transformValue = {
      transform: {
        pos: [1, 2, 3],
        rot: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    } as const;

    expect(
      displayValue(
        {
          value: transformValue as any,
          shape: { id: "Transform" },
        } as any,
        2,
      ),
    ).toContain("pos=[1.00, 2.00, 3.00]");
  });
});

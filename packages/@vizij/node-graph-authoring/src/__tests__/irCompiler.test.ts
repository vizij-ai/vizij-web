import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import { compileIrGraph } from "../ir/compiler";
import type { IrGraph, IrGraphMetadata, IrGraphSummary } from "../ir/types";

function createTestGraph(overrides: Partial<IrGraph> = {}): IrGraph {
  const summary: IrGraphSummary = overrides.summary ?? {
    faceId: "face",
    inputs: [],
    outputs: [],
    bindings: [],
  };
  const metadata: IrGraphMetadata = overrides.metadata ?? {
    source: "test",
    registryVersion: "test-registry",
  };
  return {
    id: "ir_face_1",
    faceId: "face",
    nodes: [
      {
        id: "input_ctrl",
        type: "input",
        params: { path: "rig/face/controls/a" },
      },
      {
        id: "sum",
        type: "add",
      },
      {
        id: "output_ctrl",
        type: "output",
        params: { path: "rig/face/outputs/a" },
      },
    ],
    edges: [
      {
        from: { nodeId: "input_ctrl" },
        to: { nodeId: "sum", portId: "operand_1" },
      },
      {
        from: { nodeId: "const_offset" },
        to: { nodeId: "sum", portId: "operand_2" },
      },
      {
        from: { nodeId: "sum" },
        to: { nodeId: "output_ctrl", portId: "in" },
      },
    ],
    constants: [
      {
        id: "const_offset",
        value: 2,
        valueType: "scalar",
      },
    ],
    issues: overrides.issues ?? [],
    summary,
    metadata,
    legacy: overrides.legacy,
  };
}

describe("compileIrGraph", () => {
  it("compiles IR nodes/edges and inlines constant defaults", () => {
    const result = compileIrGraph(createTestGraph());
    expect(result.issues).toEqual([]);
    expect(result.spec.nodes).toEqual([
      {
        id: "input_ctrl",
        type: "input",
        params: { path: "rig/face/controls/a" },
      },
      {
        id: "sum",
        type: "add",
        input_defaults: { operand_2: 2 },
      },
      {
        id: "output_ctrl",
        type: "output",
        params: { path: "rig/face/outputs/a" },
      },
    ]);
    expect(result.spec.edges).toEqual([
      {
        from: { node_id: "input_ctrl", output: undefined },
        to: { node_id: "sum", input: "operand_1" },
      },
      {
        from: { node_id: "sum", output: undefined },
        to: { node_id: "output_ctrl", input: "in" },
      },
    ]);
  });

  it("returns legacy spec when preferLegacySpec is true", () => {
    const legacySpec: GraphSpec = {
      nodes: [{ id: "legacy_node", type: "constant", params: { value: 1 } }],
      edges: [],
    };
    const graph = createTestGraph({
      legacy: { spec: legacySpec },
    });
    const result = compileIrGraph(graph, { preferLegacySpec: true });
    expect(result.spec).toBe(legacySpec);
  });
});

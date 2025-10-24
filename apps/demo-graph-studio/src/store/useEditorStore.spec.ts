import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEditorStore } from "./useEditorStore";

const WEIGHTED_BLEND_FIXTURE = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../..",
      "vizij-rs",
      "fixtures",
      "node_graphs",
      "weighted-blend-graph.json",
    ),
    "utf8",
  ),
);

describe("useEditorStore variadic canonicalisation", () => {
  beforeEach(() => {
    const api = useEditorStore.getState();
    api.reset();
    api.setVariadicPortGroups({
      add: "operands",
    });
  });

  it("normalises legacy variadic handles to registry ids", () => {
    const api = useEditorStore.getState();
    const { nodes, edges } = api.specToNodes(WEIGHTED_BLEND_FIXTURE as any);

    const weightSumNode = nodes.find((node) => node.id === "weight_sum");
    expect(weightSumNode).toBeTruthy();

    const variadicInputs = Array.isArray(weightSumNode?.data?.inputs)
      ? (weightSumNode!.data!.inputs as any[]).filter(
          (entry) => entry.basePortId === "operands",
        )
      : [];

    const canonicalHandles = variadicInputs
      .map((entry) => String(entry.portId))
      .sort();
    expect(canonicalHandles).toEqual([
      "operands_0",
      "operands_1",
      "operands_2",
    ]);

    const weightSumEdges = edges.filter((edge) => edge.target === "weight_sum");
    const edgeHandles = weightSumEdges
      .map((edge) => String(edge.targetHandle ?? ""))
      .sort();
    expect(edgeHandles).toEqual(["operands_0", "operands_1", "operands_2"]);

    const regenerated = api.nodesToSpec(nodes, edges);
    const exportedInputs =
      regenerated.edges
        ?.filter((edge) => edge.to?.node_id === "weight_sum")
        .map((edge) => edge.to?.input) ?? [];
    expect(exportedInputs.sort()).toEqual([
      "operands_0",
      "operands_1",
      "operands_2",
    ]);
  });

  it("preserves non-variadic input handles", () => {
    const api = useEditorStore.getState();
    const { nodes, edges } = api.specToNodes(WEIGHTED_BLEND_FIXTURE as any);

    const weightedNode = nodes.find((node) => node.id === "weighted_0");
    expect(weightedNode).toBeTruthy();

    const inputHandles = Array.isArray(weightedNode?.data?.inputs)
      ? (weightedNode!.data!.inputs as any[]).map((entry) => ({
          portId: String(entry.portId),
          basePortId: String(entry.basePortId),
        }))
      : [];

    expect(inputHandles).toContainEqual({ portId: "v", basePortId: "v" });
    expect(inputHandles).toContainEqual({
      portId: "scalar",
      basePortId: "scalar",
    });

    const weightedEdges = edges.filter((edge) => edge.target === "weighted_0");
    const handleIds = weightedEdges.map((edge) => String(edge.targetHandle));
    expect(handleIds).toContain("v");
    expect(handleIds).toContain("scalar");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { Connection, Edge, Node, NodeChange } from "reactflow";
import useGraphStore from "../state/useGraphStore";
import { nodesToSpec } from "../lib/graph";
import { getInitialGraph } from "../assets/graph-presets";

type StoreSnapshot = {
  nodes: Node[];
  edges: Edge[];
};

const cloneGraph = ({ nodes, edges }: StoreSnapshot): StoreSnapshot => ({
  nodes: nodes.map((node) => ({
    ...node,
    data: { ...(node.data ?? {}) },
  })),
  edges: edges.map((edge) => ({ ...edge })),
});

const resetStore = () => {
  const { n, e } = getInitialGraph();
  const cloned = cloneGraph({ nodes: n, edges: e });
  useGraphStore.setState({
    nodes: cloned.nodes,
    edges: cloned.edges,
    spec: nodesToSpec(cloned.nodes, cloned.edges),
  });
};

beforeEach(() => {
  resetStore();
});

describe("useGraphStore", () => {
  it("updates the spec when node data changes", () => {
    const store = useGraphStore.getState();
    store.setNodeData("offset", { value: 0.75 });

    const updatedSpec = useGraphStore.getState().spec;
    const offsetSpec = updatedSpec.nodes.find((node) => node.id === "offset");

    expect(offsetSpec?.params?.value).toEqual({ float: 0.75 });
  });

  it("recomputes spec inputs when new edges are connected", () => {
    const { setGraph } = useGraphStore.getState();
    const minimalNodes: Node[] = [
      {
        id: "src",
        type: "constant",
        position: { x: 0, y: 0 },
        data: { label: "Source", value: { float: 2 } },
      },
      {
        id: "clamp",
        type: "clamp",
        position: { x: 200, y: 0 },
        data: { label: "Clamp" },
      },
    ];
    setGraph({ nodes: minimalNodes, edges: [] });

    const { onConnect } = useGraphStore.getState();
    onConnect({
      source: "src",
      target: "clamp",
      targetHandle: "in",
    } as Connection);
    onConnect({
      source: "src",
      target: "clamp",
      targetHandle: "min",
    } as Connection);

    const spec = useGraphStore.getState().spec;
    const clampSpec = spec.nodes.find((node) => node.id === "clamp");
    expect(clampSpec?.inputs?.in?.node_id).toBe("src");
    expect(clampSpec?.inputs?.min?.node_id).toBe("src");
  });

  it("drops dangling edges when nodes are removed", () => {
    const { setGraph } = useGraphStore.getState();
    const nodes: Node[] = [
      {
        id: "a",
        type: "constant",
        position: { x: 0, y: 0 },
        data: { label: "A", value: { float: 1 } },
      },
      {
        id: "b",
        type: "constant",
        position: { x: 100, y: 0 },
        data: { label: "B", value: { float: 2 } },
      },
    ];
    const edges: Edge[] = [
      {
        id: "edge-a-b",
        source: "a",
        target: "b",
        targetHandle: "in",
        animated: true,
      },
    ];

    setGraph({ nodes, edges });

    const removeChange: NodeChange = { id: "b", type: "remove" } as NodeChange;
    useGraphStore.getState().onNodesChange([removeChange]);

    const state = useGraphStore.getState();
    expect(state.edges).toHaveLength(0);
    expect(state.spec.nodes.find((node) => node.id === "b")).toBeUndefined();
  });

  it("renames nodes across state and spec", () => {
    const { renameNode } = useGraphStore.getState();
    renameNode("offset", "offset2");

    const state = useGraphStore.getState();
    expect(state.nodes.some((node) => node.id === "offset2")).toBe(true);
    expect(state.edges.some((edge) => edge.source === "offset")).toBe(false);
    expect(state.spec.nodes.some((node) => node.id === "offset2")).toBe(true);
  });

  it("preserves labels when updating node type", () => {
    const { updateNodeType } = useGraphStore.getState();
    updateNodeType("offset", "slider", { value: { float: 0.4 } });

    const updatedNode = useGraphStore
      .getState()
      .nodes.find((node) => node.id === "offset");
    expect(updatedNode?.data?.label).toBe("Offset");
    expect(updatedNode?.type).toBe("slider");
  });
});

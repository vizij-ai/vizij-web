import type { RFState } from "../state/useGraphStore";

const GRAPH_STORAGE_KEY = "node-graph-ecs-graphs-v2";
const ACTIVE_GRAPH_KEY = "node-graph-ecs-active";

export type StoredGraph = Pick<RFState, "nodes" | "edges">;

type GraphMap = Record<string, StoredGraph>;

export type GraphSelection = {
  type: "preset" | "saved";
  name: string;
};

const cloneGraph = (graph: StoredGraph): StoredGraph => ({
  nodes: graph.nodes.map((node) => ({
    ...node,
    position: { ...(node.position || {}) },
    data: { ...(node.data ?? {}) },
  })),
  edges: graph.edges.map((edge) => ({ ...edge })),
});

const readGraphStorage = (): GraphMap => {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GraphMap;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return {};
  } catch (error) {
    console.error("Failed to parse saved graphs", error);
    return {};
  }
};

const writeGraphStorage = (map: GraphMap) => {
  try {
    localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error("Failed to write saved graphs", error);
  }
};

export function listSavedGraphs(): string[] {
  return Object.keys(readGraphStorage()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function saveGraphToLocalStorage(name: string, graph: StoredGraph) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const map = readGraphStorage();
  map[trimmed] = cloneGraph(graph);
  writeGraphStorage(map);
}

export function loadGraphFromLocalStorage(name: string): StoredGraph | null {
  const map = readGraphStorage();
  if (!map[name]) return null;
  return cloneGraph(map[name]);
}

export function deleteGraphFromLocalStorage(name: string) {
  const map = readGraphStorage();
  if (!(name in map)) return;
  delete map[name];
  writeGraphStorage(map);
}

export function storeActiveGraphSelection(selection: GraphSelection) {
  try {
    localStorage.setItem(ACTIVE_GRAPH_KEY, JSON.stringify(selection));
  } catch (error) {
    console.error("Failed to store active graph selection", error);
  }
}

export function loadActiveGraphSelection(): GraphSelection | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GRAPH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GraphSelection;
    if (parsed && typeof parsed === "object" && parsed.name && parsed.type) {
      return parsed;
    }
    return null;
  } catch (error) {
    console.error("Failed to load active graph selection", error);
    return null;
  }
}

export function clearActiveGraphSelection() {
  localStorage.removeItem(ACTIVE_GRAPH_KEY);
}

import { create } from "zustand";
import type { Edge, Node } from "reactflow";

export type EditorNode = Node & {
  data: Record<string, any>;
};

export type EditorEdge = Edge;

type EditorState = {
  nodes: EditorNode[];
  edges: EditorEdge[];
  selectedNodeId: string | null;
  enabledOutputs: Set<string>;
  enabledInputs: Set<string>;
  customInputPaths: string[];
  plotActive: boolean;
  setSelected: (id: string | null) => void;
  setEnabledOutputs: (paths: Iterable<string>) => void;
  setEnabledInputs: (paths: Iterable<string>) => void;
  pruneEnabledOutputs: (allowedPaths: ReadonlySet<string>) => void;
  pruneEnabledInputs: (allowedPaths: ReadonlySet<string>) => void;
  setNodes: (
    updater: EditorNode[] | ((prev: EditorNode[]) => EditorNode[]),
  ) => void;
  setEdges: (
    updater: EditorEdge[] | ((prev: EditorEdge[]) => EditorEdge[]),
  ) => void;
  toggleOutput: (path: string) => void;
  toggleInput: (path: string) => void;
  addCustomInputPath: (path: string) => void;
  removeCustomInputPath: (path: string) => void;
  togglePlot: () => void;
  clear: () => void;
  /** Replace the entire editor state (used when loading a motion graph from a GLB bundle). */
  hydrate: (
    nodes: EditorNode[],
    edges: EditorEdge[],
    enabledOutputs: Set<string>,
    enabledInputs?: Set<string>,
    customInputPaths?: string[],
  ) => void;
};

type EditorDataState = Pick<
  EditorState,
  | "nodes"
  | "edges"
  | "selectedNodeId"
  | "enabledOutputs"
  | "enabledInputs"
  | "customInputPaths"
  | "plotActive"
>;

function createEmptyEditorDataState(): EditorDataState {
  return {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    enabledOutputs: new Set<string>(),
    enabledInputs: new Set<string>(),
    customInputPaths: [],
    plotActive: false,
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  ...createEmptyEditorDataState(),

  setSelected: (id) => set({ selectedNodeId: id }),

  setEnabledOutputs: (paths) => set({ enabledOutputs: new Set(paths) }),

  setEnabledInputs: (paths) => set({ enabledInputs: new Set(paths) }),

  pruneEnabledOutputs: (allowedPaths) =>
    set((state) => {
      if (state.enabledOutputs.size === 0) {
        return state;
      }
      const next = new Set<string>();
      state.enabledOutputs.forEach((path) => {
        if (allowedPaths.has(path)) {
          next.add(path);
        }
      });
      if (next.size === state.enabledOutputs.size) {
        return state;
      }
      return { enabledOutputs: next };
    }),

  pruneEnabledInputs: (allowedPaths) =>
    set((state) => {
      if (state.enabledInputs.size === 0) {
        return state;
      }
      const next = new Set<string>();
      state.enabledInputs.forEach((path) => {
        if (allowedPaths.has(path)) {
          next.add(path);
        }
      });
      if (next.size === state.enabledInputs.size) {
        return state;
      }
      return { enabledInputs: next };
    }),

  setNodes: (updater) =>
    set((state) => ({
      nodes: typeof updater === "function" ? updater(state.nodes) : updater,
    })),

  setEdges: (updater) =>
    set((state) => ({
      edges: typeof updater === "function" ? updater(state.edges) : updater,
    })),

  toggleOutput: (path) =>
    set((state) => {
      const next = new Set(state.enabledOutputs);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { enabledOutputs: next };
    }),

  toggleInput: (path) =>
    set((state) => {
      const next = new Set(state.enabledInputs);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { enabledInputs: next };
    }),

  addCustomInputPath: (path) =>
    set((state) => {
      if (state.customInputPaths.includes(path)) return state;
      const enabledNext = new Set(state.enabledInputs);
      enabledNext.add(path);
      return {
        customInputPaths: [...state.customInputPaths, path],
        enabledInputs: enabledNext,
      };
    }),

  removeCustomInputPath: (path) =>
    set((state) => {
      const enabledNext = new Set(state.enabledInputs);
      enabledNext.delete(path);
      return {
        customInputPaths: state.customInputPaths.filter((p) => p !== path),
        enabledInputs: enabledNext,
      };
    }),

  togglePlot: () => set((state) => ({ plotActive: !state.plotActive })),

  clear: () => set(createEmptyEditorDataState()),

  hydrate: (nodes, edges, enabledOutputs, enabledInputs, customInputPaths) =>
    set({
      nodes,
      edges,
      enabledOutputs: new Set(enabledOutputs),
      enabledInputs: new Set(enabledInputs ?? []),
      customInputPaths: [...(customInputPaths ?? [])],
      selectedNodeId: null,
      plotActive: false,
    }),
}));

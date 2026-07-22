import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import type { HistoryManager, HistorySnapshot } from "./historyStore";

export const MOTIONGRAPH_HISTORY_SCOPE_ID = "motiongraph-editor";

type EditorState = ReturnType<typeof useEditorStore.getState>;

interface MotionGraphHistorySnapshot extends HistorySnapshot {
  nodes: EditorState["nodes"];
  edges: EditorState["edges"];
  enabledInputs: EditorState["enabledInputs"];
  enabledOutputs: EditorState["enabledOutputs"];
  customInputPaths: EditorState["customInputPaths"];
}

/**
 * Registers the motion-graph editor document (nodes, edges, enabled IO sets,
 * custom input paths) as an undo/redo scope. Selection and plot toggles are
 * not undoable.
 */
export function registerMotionGraphHistoryScope(
  history: HistoryManager,
): () => void {
  const unregister = history.registerScope({
    id: MOTIONGRAPH_HISTORY_SCOPE_ID,
    capture: (): MotionGraphHistorySnapshot => {
      const state = useEditorStore.getState();
      return {
        nodes: state.nodes,
        edges: state.edges,
        enabledInputs: state.enabledInputs,
        enabledOutputs: state.enabledOutputs,
        customInputPaths: state.customInputPaths,
      };
    },
    restore: (snapshot) => {
      const typed = snapshot as MotionGraphHistorySnapshot;
      useEditorStore.setState({
        nodes: typed.nodes,
        edges: typed.edges,
        enabledInputs: typed.enabledInputs,
        enabledOutputs: typed.enabledOutputs,
        customInputPaths: typed.customInputPaths,
        selectedNodeId: null,
      });
    },
  });

  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (
      state.nodes !== previous.nodes ||
      state.edges !== previous.edges ||
      state.enabledInputs !== previous.enabledInputs ||
      state.enabledOutputs !== previous.enabledOutputs ||
      state.customInputPaths !== previous.customInputPaths
    ) {
      history.notifyChange();
    }
  });

  return () => {
    unsubscribe();
    unregister();
  };
}

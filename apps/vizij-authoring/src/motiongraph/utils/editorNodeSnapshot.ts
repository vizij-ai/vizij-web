import type { EditorNode } from "../store/useEditorStore";

/**
 * What React Flow measures or tracks about a node, as opposed to what the
 * author put there.
 *
 * React Flow writes its measured size, its resolved absolute position and its
 * selection/drag state onto the node objects, and it does so one node at a
 * time as its ResizeObserver reports them. None of it is program content: an
 * imported motion graph is the same graph whether its nodes have been measured
 * yet or not.
 */
export const TRANSIENT_EDITOR_NODE_FIELDS = [
  "width",
  "height",
  "positionAbsolute",
  "selected",
  "dragging",
  "resizing",
] as const;

/**
 * A program snapshot's nodes, with React Flow's bookkeeping dropped.
 *
 * Keeping those fields in the snapshot made every measurement look like an
 * edit: the autosave effect wrote a new snapshot override, that re-rendered
 * the app, and the re-render let React Flow measure the next node. Measured
 * with a program playing, one `dimensions` change per node produced ~250 full
 * app re-renders in a row, each with a fresh
 * `bundleProceduralSnapshotOverrides` object.
 */
export function withoutTransientNodeFields(nodes: EditorNode[]): EditorNode[] {
  return nodes.map((node) => {
    const next = { ...node } as Record<string, unknown>;
    TRANSIENT_EDITOR_NODE_FIELDS.forEach((field) => {
      delete next[field];
    });
    return next as EditorNode;
  });
}

import { useMemo } from "react";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { Panel } from "../ui";

export function SceneSelectionDetails() {
  const { getNode } = useSceneComposer();
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const handleClearSelection = useSelectionStore(
    (state) => state.handleClearSelection,
  );

  const activeSelection = selectionStack[0] ?? null;
  const node = activeSelection ? getNode(activeSelection.id) : null;

  const summary = useMemo(() => {
    if (!node) {
      return null;
    }
    return {
      name: node.name || node.id,
      typeLabel: node.type,
      id: node.id,
      featureCount: node.features.length,
      childCount: node.childIds.length,
    };
  }, [node]);

  return (
    <Panel
      className="scene-selection"
      title="Selection"
      description={
        summary
          ? "Selected object metadata feeds the upcoming inspector."
          : "Pick an object from the hierarchy or viewport to continue."
      }
      badge={summary ? summary.typeLabel : undefined}
    >
      {summary ? (
        <div className="scene-selection__body">
          <dl className="scene-selection__grid">
            <div>
              <dt>Name</dt>
              <dd>{summary.name}</dd>
            </div>
            <div>
              <dt>Object ID</dt>
              <dd>{summary.id}</dd>
            </div>
            <div>
              <dt>Features</dt>
              <dd>{summary.featureCount}</dd>
            </div>
            <div>
              <dt>Direct Children</dt>
              <dd>{summary.childCount}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="scene-selection__clear"
            onClick={() => handleClearSelection()}
          >
            Clear Selection
          </button>
        </div>
      ) : (
        <p className="sidebar__empty">
          No object selected. Choose one to populate the inspector workspace.
        </p>
      )}

      <p className="sidebar__hint">
        Object-centric inspector controls will replace the driver/property
        panels once the hierarchy is baked.
      </p>
    </Panel>
  );
}

import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { RiggingInspector } from "../inspector/RiggingInspector";

export function BaseController() {
  return (
    <div className="flex flex-col gap-2 p-2 h-full">
      <SceneRiggingSectionContent />
    </div>
  );
}

function SceneRiggingSectionContent() {
  const activeResult = useActiveNode();

  if (!activeResult?.node) {
    return <div className="p-1 text-xs text-slate-500">Select an object</div>;
  }

  return (
    <div className="scene-rigging-section">
      <RiggingInspector node={activeResult?.node} />
    </div>
  );
}

function useActiveNode() {
  const { getNode } = useSceneComposer();
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const activeSelection = selectionStack[0] ?? null;
  return activeSelection ? { node: getNode(activeSelection.id) } : null;
}


import { ObjectInspector } from "../inspector/ObjectInspector";
import { StandardInputCoveragePanel } from "../app/StandardInputCoveragePanel";


interface SceneRiggingSectionProps {
  showCoverage?: boolean;
  showMissingList?: boolean;
  allowEditActions?: boolean;
  allowNodeActions?: boolean;
  showMaterials?: boolean;
  showDrivers?: boolean;
  showBindings?: boolean;
  showFeatures?: boolean;
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
  allowCreateDrivers?: boolean;
}

export function BaseController() {
  return (
    <div className="flex flex-col gap-2 p-2 h-full">
      <SceneRiggingSectionContent />
    </div>
  );
}

function SceneRiggingSectionContent({
  showCoverage = false,
  showMissingList = false,
  allowEditActions = true,
  allowNodeActions = false,
  showMaterials = true,
  showDrivers = true,
  showBindings = true,
  showFeatures = true,
  hiddenMode = "grey",
  showHideControls = true,
  allowCreateDrivers = true,
}: SceneRiggingSectionProps) {
  const activeResult = useActiveNode();

  if (!activeResult?.node) {
    return <div className="p-1 text-xs text-slate-500">Select an object</div>;
  }

  return (
    <div className="scene-rigging-section">
      {/* Hierarchy moved to main sidebar */}
      {/* Standard Input Coverage Panel hidden as requested */}
      {/* {showCoverage ? (
        <StandardInputCoveragePanel showMissingList={showMissingList} />
      ) : null} */}
      <RiggingInspector node={activeResult?.node} />
    </div>
  );
}

// Helper to get active node from selection (duplicating logic for now or we hoist it)
import { useSelectionStore } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { RiggingInspector } from "../inspector/RiggingInspector"; // Import new component

function useActiveNode() {
  const { getNode } = useSceneComposer();
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const activeSelection = selectionStack[0] ?? null;
  return activeSelection ? { node: getNode(activeSelection.id) } : null;
}

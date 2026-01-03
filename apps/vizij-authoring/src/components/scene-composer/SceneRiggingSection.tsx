import { ObjectInspector } from "../inspector/ObjectInspector";
import { StandardInputCoveragePanel } from "../app/StandardInputCoveragePanel";
import { SceneHierarchyPanel } from "./SceneHierarchyPanel";

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

export function SceneRiggingSection({
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
  return (
    <div className="scene-rigging-section">
      <SceneHierarchyPanel allowEditActions={allowEditActions} />
      {showCoverage ? (
        <StandardInputCoveragePanel showMissingList={showMissingList} />
      ) : null}
      <ObjectInspector
        showMaterialEditor={showMaterials}
        showDrivers={showDrivers}
        showBindings={showBindings}
        showFeatures={showFeatures}
        hiddenMode={hiddenMode}
        showHideControls={showHideControls}
        allowCreateDrivers={allowCreateDrivers}
        allowNodeActions={allowNodeActions}
      />
    </div>
  );
}

import { SceneRiggingSection } from "./SceneRiggingSection";

export function SceneComposerWorkbench() {
  return (
    <div className="scene-composer">
      <SceneRiggingSection
        showCoverage
        showMissingList={false}
        allowEditActions={false}
        allowNodeActions={false}
        showMaterials={false}
        showDrivers
        showBindings
        showFeatures={false}
        hiddenMode="grey"
        showHideControls
      />
    </div>
  );
}

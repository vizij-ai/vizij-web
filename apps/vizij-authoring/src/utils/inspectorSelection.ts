interface AssetInspectorSelectionState {
  selectedSceneId: string | null;
  selectedRigId: string | null;
  selectedPoseId: string | null;
  selectedMaterialId: string | null;
  selectedMotionGraphNodeId: string | null;
}

export function shouldShowAssetInspector(
  state: AssetInspectorSelectionState,
): boolean {
  return !(
    state.selectedSceneId ||
    state.selectedRigId ||
    state.selectedPoseId ||
    state.selectedMaterialId ||
    state.selectedMotionGraphNodeId
  );
}

import { useCallback, useMemo } from "react";
import {
  useBindingAuthoring,
  useSelectionStore,
} from "../state/RigControllerProvider";
import { usePoseRig } from "../state/PoseRigProvider";
import { useSceneComposer } from "../scene/useSceneComposer";

/**
 * Custom hook to manage mutually exclusive selection across different state stores.
 * Ensures that selecting a scene object clears pose/rig selection, and vice-versa.
 */
export function useUnifiedSelection() {
  const { selectObject } = useSceneComposer();
  const selectedRigId = useBindingAuthoring((state) => state.selectedRigId);
  const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);

  const selectedId = useSelectionStore((state) => state.selectionStack[0]?.id);
  const handleClearSelection = useSelectionStore(
    (state) => state.handleClearSelection,
  );

  const selectedMaterialId = useBindingAuthoring(
    (state) => state.selectedMaterialId,
  );
  const handleSelectMaterial = useBindingAuthoring(
    (state) => state.handleSelectMaterial,
  );

  const { selectedPoseId, selectPose } = usePoseRig();

  // Derived Inspector Mode
  const inspectorMode = useMemo(() => {
    if (selectedId) return "scene";
    if (selectedPoseId) return "pose";
    if (selectedRigId) return "rig";
    if (selectedMaterialId) return "material";
    return "default";
  }, [selectedId, selectedPoseId, selectedRigId, selectedMaterialId]);

  const handleSelectObject = useCallback(
    (id: string) => {
      // Note: We also perform the actual selection here now to make this a complete selection handler.
      if (selectedPoseId) selectPose("");
      if (selectedRigId) handleSelectRig(null);
      if (selectedMaterialId) handleSelectMaterial(null);
      selectObject(id);
    },
    [
      selectedPoseId,
      selectedRigId,
      selectedMaterialId,
      selectPose,
      handleSelectRig,
      handleSelectMaterial,
      selectObject,
    ],
  );

  const handleSelectPose = useCallback(
    (id: string) => {
      if (selectedId) handleClearSelection();
      if (selectedRigId) handleSelectRig(null);
      if (selectedMaterialId) handleSelectMaterial(null);
      selectPose(id);
    },
    [
      selectedId,
      selectedRigId,
      selectedMaterialId,
      handleClearSelection,
      handleSelectRig,
      handleSelectMaterial,
      selectPose,
    ],
  );

  const handleSelectRigAction = useCallback(
    (id: string | null) => {
      if (id) {
        if (selectedId) handleClearSelection();
        if (selectedPoseId) selectPose("");
        if (selectedMaterialId) handleSelectMaterial(null);
      }
      handleSelectRig(id);
    },
    [
      selectedId,
      selectedPoseId,
      selectedMaterialId,
      handleClearSelection,
      selectPose,
      handleSelectRig,
      handleSelectMaterial,
    ],
  );

  return {
    selectedId,
    selectedPoseId,
    selectedRigId,
    inspectorMode,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig: handleSelectRigAction,
    selectedMaterialId,
    handleSelectMaterial: (id: string | null) => {
      if (id) {
        if (selectedId) handleClearSelection();
        if (selectedPoseId) selectPose("");
        if (selectedRigId) handleSelectRig(null);
      }
      handleSelectMaterial(id);
    },
    handleClearSelection,
  };
}

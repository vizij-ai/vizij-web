import { useCallback, useMemo } from "react";
import { useBindingAuthoring, useSelectionStore } from "../state/RigControllerProvider";
import { usePoseRig } from "../state/PoseRigProvider";

/**
 * Custom hook to manage mutually exclusive selection across different state stores.
 * Ensures that selecting a scene object clears pose/rig selection, and vice-versa.
 */
export function useUnifiedSelection() {
    const selectedRigId = useBindingAuthoring((state) => state.selectedRigId);
    const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);

    const selectedId = useSelectionStore((state) => state.selectionStack[0]?.id);
    const handleClearSelection = useSelectionStore((state) => state.handleClearSelection);

    const { selectedPoseId, selectPose } = usePoseRig();

    // Derived Inspector Mode
    const inspectorMode = useMemo(() => {
        if (selectedId) return "scene";
        if (selectedPoseId) return "pose";
        if (selectedRigId) return "rig";
        return "default";
    }, [selectedId, selectedPoseId, selectedRigId]);

    const handleSelectObject = useCallback((_id: string) => {
        // Note: The actual object selection is usually handled by the component using useSelectionStore.
        // This wrapper ensures other systems are cleared.
        if (selectedPoseId) selectPose("");
        if (selectedRigId) handleSelectRig(null);
    }, [selectedPoseId, selectedRigId, selectPose, handleSelectRig]);

    const handleSelectPose = useCallback((id: string) => {
        if (selectedId) handleClearSelection();
        if (selectedRigId) handleSelectRig(null);
        selectPose(id);
    }, [selectedId, selectedRigId, handleClearSelection, handleSelectRig, selectPose]);

    const handleSelectRigAction = useCallback((id: string | null) => {
        if (id) {
            if (selectedId) handleClearSelection();
            if (selectedPoseId) selectPose("");
        }
        handleSelectRig(id);
    }, [selectedId, selectedPoseId, handleClearSelection, selectPose, handleSelectRig]);

    return {
        selectedId,
        selectedPoseId,
        selectedRigId,
        inspectorMode,
        handleSelectObject,
        handleSelectPose,
        handleSelectRig: handleSelectRigAction,
        handleClearSelection,
    };
}

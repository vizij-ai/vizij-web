import { useCallback, useMemo } from "react";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useSelectionStore,
} from "../state/RigControllerProvider";
import { usePoseRigStore } from "../poseRig/store";
import { useEditorStore } from "../motiongraph/store/useEditorStore";
import { DEFAULT_NAMESPACE } from "../utils/constants";

/**
 * Custom hook to manage mutually exclusive selection across different state stores.
 * Ensures that selecting a scene object clears pose/rig selection, and vice-versa.
 */
export function useUnifiedSelection() {
  const setStoreState = useGraphRuntime((state) => state.setStoreState);
  const selectedRigId = useBindingAuthoring((state) => state.selectedRigId);
  const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);

  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const selectedId = selectionStack[0]?.id;
  const handleClearSelection = useSelectionStore(
    (state) => state.handleClearSelection,
  );

  const selectedMaterialId = useBindingAuthoring(
    (state) => state.selectedMaterialId,
  );
  const handleSelectMaterial = useBindingAuthoring(
    (state) => state.handleSelectMaterial,
  );

  const selectedPoseId = usePoseRigStore((state) => state.selectedPoseId);
  const selectPose = usePoseRigStore((state) => state.selectPose);
  const selectedMotionGraphNodeId = useEditorStore(
    (state) => state.selectedNodeId,
  );
  const setSelectedMotionGraphNodeId = useEditorStore(
    (state) => state.setSelected,
  );

  const selectObject = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      setStoreState((state) => {
        const renderable = state.world[id];
        if (!renderable) {
          return state;
        }
        const selectionType: "shape" | "group" | "ellipse" | "rectangle" =
          renderable.type === "group"
            ? "group"
            : renderable.type === "ellipse"
              ? "ellipse"
              : renderable.type === "rectangle"
                ? "rectangle"
                : "shape";
        const nextSelection = {
          id,
          type: selectionType,
          namespace: DEFAULT_NAMESPACE,
        } as const;
        const isSameSelection = (
          entry: (typeof state.elementSelection)[number],
        ) =>
          entry.id === nextSelection.id &&
          entry.type === nextSelection.type &&
          entry.namespace === nextSelection.namespace;

        if (options?.additive) {
          const existing = state.elementSelection ?? [];
          if (existing.some(isSameSelection)) {
            return {
              ...state,
              elementSelection: existing.filter(
                (entry) => !isSameSelection(entry),
              ),
            };
          }
          return {
            ...state,
            elementSelection: [nextSelection, ...existing],
          };
        }

        const existing = state.elementSelection?.[0];
        if (
          existing &&
          isSameSelection(existing) &&
          (state.elementSelection?.length ?? 0) === 1
        ) {
          return state;
        }

        return {
          ...state,
          elementSelection: [nextSelection],
        };
      });
    },
    [setStoreState],
  );

  // Derived Inspector Mode
  const inspectorMode = useMemo(() => {
    if (selectedId) return "scene";
    if (selectedPoseId) return "pose";
    if (selectedRigId) return "rig";
    if (selectedMaterialId) return "material";
    if (selectedMotionGraphNodeId) return "motiongraph";
    return "default";
  }, [
    selectedId,
    selectedPoseId,
    selectedRigId,
    selectedMaterialId,
    selectedMotionGraphNodeId,
  ]);

  const handleSelectObject = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      if (
        !options?.additive &&
        selectedId === id &&
        selectionStack.length === 1 &&
        !selectedPoseId &&
        !selectedRigId &&
        !selectedMaterialId
      ) {
        return;
      }
      // Note: We also perform the actual selection here now to make this a complete selection handler.
      if (selectedPoseId) selectPose("");
      if (selectedRigId) handleSelectRig(null);
      if (selectedMaterialId) handleSelectMaterial(null);
      if (selectedMotionGraphNodeId) setSelectedMotionGraphNodeId(null);
      selectObject(id, options);
    },
    [
      selectedId,
      selectionStack.length,
      selectedPoseId,
      selectedRigId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      selectPose,
      handleSelectRig,
      handleSelectMaterial,
      setSelectedMotionGraphNodeId,
      selectObject,
    ],
  );

  const handleSelectPose = useCallback(
    (id: string) => {
      if (selectedId) handleClearSelection();
      if (selectedRigId) handleSelectRig(null);
      if (selectedMaterialId) handleSelectMaterial(null);
      if (selectedMotionGraphNodeId) setSelectedMotionGraphNodeId(null);
      selectPose(id);
    },
    [
      selectedId,
      selectedRigId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      handleClearSelection,
      handleSelectRig,
      handleSelectMaterial,
      setSelectedMotionGraphNodeId,
      selectPose,
    ],
  );

  const handleSelectRigAction = useCallback(
    (id: string | null) => {
      if (id) {
        if (selectedId) handleClearSelection();
        if (selectedPoseId) selectPose("");
        if (selectedMaterialId) handleSelectMaterial(null);
        if (selectedMotionGraphNodeId) setSelectedMotionGraphNodeId(null);
      }
      handleSelectRig(id);
    },
    [
      selectedId,
      selectedPoseId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      handleClearSelection,
      selectPose,
      handleSelectRig,
      handleSelectMaterial,
      setSelectedMotionGraphNodeId,
    ],
  );

  const handleSelectMotionGraphNode = useCallback(
    (id: string | null) => {
      if (id) {
        if (selectedId) handleClearSelection();
        if (selectedPoseId) selectPose("");
        if (selectedRigId) handleSelectRig(null);
        if (selectedMaterialId) handleSelectMaterial(null);
      }
      setSelectedMotionGraphNodeId(id);
    },
    [
      handleClearSelection,
      handleSelectMaterial,
      handleSelectRig,
      selectPose,
      selectedId,
      selectedMaterialId,
      selectedPoseId,
      selectedRigId,
      setSelectedMotionGraphNodeId,
    ],
  );

  return {
    selectedId,
    selectedPoseId,
    selectedRigId,
    selectedMotionGraphNodeId,
    inspectorMode,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig: handleSelectRigAction,
    handleSelectMotionGraphNode,
    selectedMaterialId,
    handleSelectMaterial: (id: string | null) => {
      if (id) {
        if (selectedId) handleClearSelection();
        if (selectedPoseId) selectPose("");
        if (selectedRigId) handleSelectRig(null);
        if (selectedMotionGraphNodeId) setSelectedMotionGraphNodeId(null);
      }
      handleSelectMaterial(id);
    },
    handleClearSelection,
  };
}

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { loadGLTFFromBlobWithBundle, useVizijStore } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { useWorkspaceStore } from "./state/workspaceStore";
import { AppMenuBar } from "./components/app/AppMenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import {
  Viewer,
  type RuntimeExportBodiesSnapshot,
} from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { FaceLoadingProgressBar } from "./components/app/FaceLoadingProgressBar";
import { OrientationConfirmationDialog } from "./components/app/OrientationConfirmationDialog";
import {
  FACE_PRESET_GRID_OPTIONS,
  type FacePresetAssetOption,
} from "./components/app/facePresetAssets";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
import { RegistryProvider } from "./motiongraph/contexts/RegistryProvider";
import { useEditorStore } from "./motiongraph/store/useEditorStore";
import { specToEditorState } from "./motiongraph/utils/specToEditorState";
import {
  MotionGraphPanel,
  MotionGraphPalettePanel,
} from "./motiongraph/MotionGraphPanel";
import { AppWizards } from "./components/app/AppWizards";
import {
  RigControllerProvider,
  useBindingAuthoring,
  useGraphRuntime,
} from "./state/RigControllerProvider";
import {
  AuthoringUiProvider,
  useAuthoringUiActions,
  useAuthoringUiState,
} from "./state/AuthoringUiProvider";
import { PoseRigProvider, usePoseRig } from "./state/PoseRigProvider";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import type {
  BlendStageInspectorSelection,
  PoseGroupInspectorSelection,
} from "./types/poseGroupInspector";
import { ReferenceFaceProvider } from "./state/ReferenceFaceContext";
import { useReferenceFaceState } from "./hooks/useReferenceFaceState";
import { useUnifiedSelection } from "./hooks/useUnifiedSelection";
import { buildRuntimeBaseBundle } from "./utils/runtimeBundle";
import { useSharedVariableSync } from "./hooks/useSharedVariableSync";
import { SharedVariableSyncProvider } from "./state/SharedVariableSyncContext";
import { getVisibleVariablesSurfaces } from "./components/panels/variablesSurfaceOrder";
import {
  radiansToRoundedDegrees,
  resolveRootSceneRotationInputs,
  type RotationAxis,
} from "./components/app/importOrientation";

const __DEV__ = process.env.NODE_ENV !== "production";
const EMPTY_INPUT_VALUES: Readonly<Record<string, number>> = Object.freeze({});
function createEmptyRuntimeExportBodiesSnapshot(): RuntimeExportBodiesSnapshot {
  return {
    rootFilteredBodies: [],
    anyBodies: [],
    runtimeRootId: null,
  };
}
const QUARTER_TURN_RADIANS = Math.PI / 2;
const UNKNOWN_FACE_LOAD_STEP_WEIGHT = 6;
const FACE_LOAD_STEP_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  "select-import-source": 0,
  "load-asset": 18,
  "validate-root": 6,
  "reset-state": 6,
  "mount-runtime": 8,
  "finalize-load": 8,
  "bundle-sync": 16,
  "rig-import-normalization": 14,
  "pose-graph-bootstrap": 10,
  "runtime-stabilization": 10,
});

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;
type FaceLoadPhaseChange = Parameters<
  VizijAssetLoaderState["updateExternalPhase"]
>[0];
type FaceLoadStep = VizijAssetLoaderState["faceLoadSteps"][number];

function statusProgress(status: FaceLoadStep["status"]): number {
  switch (status) {
    case "complete":
    case "error":
      return 1;
    case "active":
      return 0.45;
    case "pending":
    default:
      return 0;
  }
}

function stepProgress(step: FaceLoadStep): number {
  if (step.status === "complete" || step.status === "error") {
    return 1;
  }
  if (step.substeps.length === 0) {
    return statusProgress(step.status);
  }
  const substepAverage =
    step.substeps.reduce(
      (sum, substep) => sum + statusProgress(substep.status),
      0,
    ) / step.substeps.length;
  if (step.status === "active") {
    return Math.max(0.12, substepAverage);
  }
  return substepAverage;
}

function computeWeightedFaceLoadProgress(steps: FaceLoadStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  let weightedProgress = 0;
  let totalWeight = 0;
  steps.forEach((step) => {
    const weight =
      FACE_LOAD_STEP_WEIGHTS[step.id] ?? UNKNOWN_FACE_LOAD_STEP_WEIGHT;
    totalWeight += weight;
    weightedProgress += stepProgress(step) * weight;
  });
  if (totalWeight <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, weightedProgress / totalWeight));
}

export default function App() {
  const assetLoader = useVizijAssetLoader();
  const updateFaceLoadPhase = useCallback(
    (update: FaceLoadPhaseChange) => {
      const sessionToken = assetLoader.faceLoadSessionToken;
      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      assetLoader.updateExternalPhase({
        ...update,
        sessionToken,
        operationId,
      });
      if (update.stepId === "bundle-sync" && update.status === "complete") {
        assetLoader.markFaceLoadMilestone("bundle-synced", {
          sessionToken,
        });
      }
      if (
        update.stepId === "runtime-stabilization" &&
        update.substepId === "settle-recompiles" &&
        update.status === "complete" &&
        assetLoader.faceLoadMilestones["bundle-synced"] !== null
      ) {
        assetLoader.markFaceLoadMilestone("graph-ready", {
          sessionToken,
        });
      }
    },
    [
      assetLoader.faceLoadSessionToken,
      assetLoader.faceLoadMilestones,
      assetLoader.markFaceLoadMilestone,
      assetLoader.updateExternalPhase,
    ],
  );

  return (
    <RigControllerProvider
      namespace={DEFAULT_NAMESPACE}
      rootId={assetLoader.rootId}
      sourceName={assetLoader.sourceName}
      onLoadPhaseChange={updateFaceLoadPhase}
    >
      <PoseRigProvider
        rootId={assetLoader.rootId}
        onLoadPhaseChange={updateFaceLoadPhase}
      >
        <AuthoringUiProvider>
          <RegistryProvider>
            <AppContent
              loader={assetLoader}
              onFaceLoadPhaseChange={updateFaceLoadPhase}
            />
          </RegistryProvider>
        </AuthoringUiProvider>
      </PoseRigProvider>
    </RigControllerProvider>
  );
}

interface AppContentProps {
  loader: VizijAssetLoaderState;
  onFaceLoadPhaseChange: (update: FaceLoadPhaseChange) => void;
}

function AppContent({ loader, onFaceLoadPhaseChange }: AppContentProps) {
  const {
    rootId,
    sourceName,
    isLoading,
    exportSceneRoot,
    faceLoadSessionToken,
    faceLoadMilestones,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    markFaceLoadMilestone,
    loadFromFile,
    bundle: loadedBundle,
    beginImportFlow,
    markImportFileSelected,
    markImportFlowError,
    completeImportFlow,
  } = loader;

  // Highlighting State (moved from Viewer)
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [runtimeExportBodies, setRuntimeExportBodies] =
    useState<RuntimeExportBodiesSnapshot>(
      createEmptyRuntimeExportBodiesSnapshot,
    );
  const [selectedPoseGroup, setSelectedPoseGroup] =
    useState<PoseGroupInspectorSelection | null>(null);
  const [selectedBlendStage, setSelectedBlendStage] =
    useState<BlendStageInspectorSelection | null>(null);
  const [showOrientationDialog, setShowOrientationDialog] = useState(false);
  const [orientationPromptSessionToken, setOrientationPromptSessionToken] =
    useState<string | null>(null);

  // Reference Face State

  const handleLoadAssetFromUrl = useCallback(
    async (url: string, filename: string) => {
      try {
        beginImportFlow(`Preset: ${filename}`);
        markImportFileSelected();
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url} `);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "model/gltf-binary" });

        await loadFromFile(file, () =>
          loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
        );
      } catch (err) {
        markImportFlowError("load-asset");
        console.error("Failed to load asset from URL:", err);
      }
    },
    [
      beginImportFlow,
      loadFromFile,
      markImportFlowError,
      markImportFileSelected,
    ],
  );

  const handleLoadQuori = useCallback(() => {
    handleLoadAssetFromUrl("/assets/Quori_Legacy.glb", "Quori_Legacy.glb");
  }, [handleLoadAssetFromUrl]);

  const handleLoadHugo = useCallback(() => {
    handleLoadAssetFromUrl("/assets/Hugo_Legacy.glb", "Hugo_Legacy.glb");
  }, [handleLoadAssetFromUrl]);

  const handleLoadPresetAsset = useCallback(
    (preset: FacePresetAssetOption) => {
      if (!preset.available) {
        return;
      }
      handleLoadAssetFromUrl(preset.url, preset.filename);
    },
    [handleLoadAssetFromUrl],
  );

  const referenceFaceContextValue = useReferenceFaceState();
  const sharedVariableSyncEnabled =
    referenceFaceContextValue.standardInputs.length > 0;
  const [mainRuntimeInputsById, setMainRuntimeInputsById] = useState<
    Map<string, StandardRigInput>
  >(new Map());
  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const mainFaceInputValues = useBindingAuthoring((state) =>
    sharedVariableSyncEnabled ? state.inputValues : EMPTY_INPUT_VALUES,
  );
  const mainFaceInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const mirrorableMainInputsById = useMemo(() => {
    if (mainRuntimeInputsById.size === 0) {
      return mainFaceInputsById;
    }
    const merged = new Map(mainRuntimeInputsById);
    mainFaceInputsById.forEach((input, inputId) => {
      merged.set(inputId, input);
    });
    return merged;
  }, [mainFaceInputsById, mainRuntimeInputsById]);
  const handleMainRuntimeInputsReady = useCallback(
    (_inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setMainRuntimeInputsById(new Map(byId));
    },
    [],
  );

  // Graph Runtime Hook
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const graphError = useGraphRuntime((state) => state.graphError);
  const stageRuntimeInput = useGraphRuntime((state) => state.stageRuntimeInput);
  const runtimeViewReady = useGraphRuntime((state) => state.runtimeViewReady);
  const runtimeViewLoading = useGraphRuntime(
    (state) => state.runtimeViewLoading,
  );
  const runtimeViewRootId = useGraphRuntime((state) => state.runtimeViewRootId);
  const runtimeViewGraphCount = useGraphRuntime(
    (state) => state.runtimeViewGraphCount,
  );
  const runtimeWorld = useVizijStore((state) => state.world);
  const runtimeAnimatables = useVizijStore((state) => state.animatables);

  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);
  const handleRuntimeExportBodiesChange = useCallback(
    (next: RuntimeExportBodiesSnapshot) => {
      setRuntimeExportBodies((previous) => {
        const sameRootFiltered =
          previous.rootFilteredBodies.length ===
            next.rootFilteredBodies.length &&
          previous.rootFilteredBodies.every(
            (body, index) => body === next.rootFilteredBodies[index],
          );
        const sameAny =
          previous.anyBodies.length === next.anyBodies.length &&
          previous.anyBodies.every(
            (body, index) => body === next.anyBodies[index],
          );
        if (
          previous.runtimeRootId === next.runtimeRootId &&
          sameRootFiltered &&
          sameAny
        ) {
          return previous;
        }
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    setRuntimeExportBodies(createEmptyRuntimeExportBodiesSnapshot());
  }, [rootId]);

  const canExport = Boolean(rootId) && !isLoading;

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const animatableComponentCount = useBindingAuthoring(
    (state) => state.animatableComponents.length,
  );
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleMigrateAllLegacyBindings = useBindingAuthoring(
    (state) => state.handleMigrateAllLegacyBindings,
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();

  const { activeWorkbench, skipDiscrepancyCheck } = uiState;

  const poseRig = usePoseRig();

  const { alert: showAlert } = useDialogQueue();

  useEffect(() => {
    uiActions.setIncludeVizijBundle(true);
    const animationCount = loadedBundle?.animations?.length ?? 0;
    uiActions.setIncludeImportedAnimations(animationCount > 0);
  }, [loadedBundle, uiActions]);

  const applyPoseGraphImport = useCallback(
    async (graphSpec: any, sourceNameHint: string) => {
      const baseName = sourceNameHint.replace(/\.json$/i, "");
      const warnings = poseRig.importPoseGraphSpec(graphSpec, {
        rigName: baseName,
        groupName: baseName,
        applyNeutral: false,
      });
      if (warnings.length > 0) {
        await showAlert(
          `Pose graph imported with ${warnings.length} warning(s). Review Pose diagnostics in the Pose Rig panel.`,
        );
      }
    },
    [poseRig, showAlert],
  );

  const {
    poseGraphRemap,
    handleImportPoseGraphFile,
    handlePoseGraphRemapApply,
    handlePoseGraphRemapCancel,
  } = usePoseGraphImport({
    faceSegment,
    standardInputs,
    rigOutputLookup,
    standardInputsByPath,
    alertDialog: showAlert,
    applyPoseGraphImport,
  });

  const standardInputCount = poseRig.standardInputs.length;

  const faceId = useGraphRuntime((state) => state.faceId);
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );
  const canImportRigGraphFromBundle = useMemo(() => {
    if (!loader.rootId) {
      return false;
    }
    if (!runtimeWorld[loader.rootId]) {
      return false;
    }
    if (animatableComponentCount === 0) {
      return false;
    }
    if (!runtimeAnimatables || Object.keys(runtimeAnimatables).length === 0) {
      return false;
    }
    if (!runtimeViewReady) {
      return false;
    }
    return graphStatus === "ready" || graphStatus === "error";
  }, [
    animatableComponentCount,
    graphStatus,
    loader.rootId,
    runtimeAnimatables,
    runtimeViewReady,
    runtimeWorld,
  ]);
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );
  const importMotionGraph = useCallback(
    (spec: Record<string, unknown> | null) => {
      const store = useEditorStore.getState();
      if (!spec) {
        store.clear();
        return;
      }
      const result = specToEditorState(spec);
      if (result.nodes.length === 0) {
        store.clear();
        return;
      }
      store.hydrate(
        result.nodes,
        result.edges,
        result.enabledOutputs,
        result.enabledInputs,
        result.customInputPaths,
      );
    },
    [],
  );

  useBundleSynchronizer({
    faceId,
    rootId: loader.rootId,
    loadedBundle: loader.bundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpec: handleImportGraphSpec,
    canImportRigGraph: canImportRigGraphFromBundle,
    adoptFaceId: handleFaceIdChange,
    importPoseConfigFromData: poseRig.importPoseConfigFromData,
    resetPoseState: poseRig.resetPoseState,
    importMotionGraph,
    onPhaseChange: onFaceLoadPhaseChange,
  });

  const sceneRotationInputs = useMemo(
    () => resolveRootSceneRotationInputs(managedStandardInputs, rootId),
    [managedStandardInputs, rootId],
  );

  const orientationAxisAvailability = useMemo(
    () => ({
      x: Boolean(sceneRotationInputs.x),
      y: Boolean(sceneRotationInputs.y),
      z: Boolean(sceneRotationInputs.z),
    }),
    [sceneRotationInputs],
  );

  const orientationAxisDegrees = useMemo(
    () => ({
      x: sceneRotationInputs.x
        ? radiansToRoundedDegrees(sceneRotationInputs.x.defaultValue)
        : 0,
      y: sceneRotationInputs.y
        ? radiansToRoundedDegrees(sceneRotationInputs.y.defaultValue)
        : 0,
      z: sceneRotationInputs.z
        ? radiansToRoundedDegrees(sceneRotationInputs.z.defaultValue)
        : 0,
    }),
    [sceneRotationInputs],
  );

  const handleOrientationDialogClose = useCallback(() => {
    setShowOrientationDialog(false);
  }, []);

  const handleRotateSceneOrientation = useCallback(
    (axis: RotationAxis, direction: -1 | 1) => {
      const target = sceneRotationInputs[axis];
      if (!target) {
        return;
      }
      const nextDefaultValue =
        target.defaultValue + direction * QUARTER_TURN_RADIANS;
      handleUpdateStandardInput(target.inputId, {
        defaultValue: nextDefaultValue,
      });
      mainFaceHandleInputValueChange(target.inputId, nextDefaultValue);
    },
    [
      handleUpdateStandardInput,
      mainFaceHandleInputValueChange,
      sceneRotationInputs,
    ],
  );

  useEffect(() => {
    if (!rootId || !faceLoadSessionToken) {
      setShowOrientationDialog(false);
      return;
    }
    if (faceLoadMilestones["asset-loaded"] === null) {
      return;
    }
    if (loadedBundle !== null) {
      setShowOrientationDialog(false);
      return;
    }
    if (orientationPromptSessionToken === faceLoadSessionToken) {
      return;
    }
    setOrientationPromptSessionToken(faceLoadSessionToken);
    setShowOrientationDialog(true);
  }, [
    faceLoadMilestones,
    faceLoadSessionToken,
    loadedBundle,
    orientationPromptSessionToken,
    rootId,
  ]);

  const hierarchyPanelVisible = useWorkspaceStore(
    (state) => state.panels.hierarchy.isVisible,
  );
  const variablesPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.variables.isVisible,
  );
  const posesPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.poses.isVisible,
  );
  const materialsPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.materials.isVisible,
  );
  const inputsPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.inputs.isVisible,
  );
  const referenceFacePanelVisible = useWorkspaceStore(
    (state) => state.panels.referenceFace.isVisible,
  );
  const animationPanelVisible = useWorkspaceStore(
    (state) => state.panels.animation.isVisible,
  );
  const motionGraphPanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraph.isVisible,
  );
  const motionGraphPalettePanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraphPalette.isVisible,
  );
  const inspectorPanelVisible = useWorkspaceStore(
    (state) => state.panels.inspector.isVisible,
  );
  const debugPanelVisible = useWorkspaceStore(
    (state) => state.panels.debug.isVisible,
  );
  const setWorkspacePanelVisibility = useWorkspaceStore(
    (state) => state.setPanelVisibility,
  );
  const visibleVariablesSurfaces = useMemo(
    () =>
      getVisibleVariablesSurfaces({
        variables: { isVisible: variablesPanelTabVisible },
        poses: { isVisible: posesPanelTabVisible },
        materials: { isVisible: materialsPanelTabVisible },
        inputs: { isVisible: inputsPanelTabVisible },
      }),
    [
      inputsPanelTabVisible,
      materialsPanelTabVisible,
      posesPanelTabVisible,
      variablesPanelTabVisible,
    ],
  );
  const inputControlSurfaces = useMemo(
    () => visibleVariablesSurfaces.filter((surface) => surface === "inputs"),
    [visibleVariablesSurfaces],
  );
  const controlAuthoringSurfaces = useMemo(
    () => visibleVariablesSurfaces.filter((surface) => surface !== "inputs"),
    [visibleVariablesSurfaces],
  );
  const inputControlsPanelVisible = inputControlSurfaces.length > 0;
  const controlAuthoringPanelVisible = controlAuthoringSurfaces.length > 0;
  const handleHideControlAuthoringPanel = useCallback(() => {
    setWorkspacePanelVisibility("variables", false);
    setWorkspacePanelVisibility("poses", false);
    setWorkspacePanelVisibility("materials", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideInputControlsPanel = useCallback(() => {
    setWorkspacePanelVisibility("inputs", false);
  }, [setWorkspacePanelVisibility]);
  const {
    selectedId,
    selectedRigId,
    selectedPoseId,
    selectedMaterialId,
    selectedMotionGraphNodeId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    handleSelectMaterial,
    handleSelectMotionGraphNode,
    handleClearSelection,
  } = useUnifiedSelection();
  const selectedSceneId = selectedId;
  const clearPoseGraphInspectorSelection = useCallback(() => {
    setSelectedPoseGroup(null);
    setSelectedBlendStage(null);
  }, []);
  const handleSelectObjectWithInspectorSync = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectObject(id, options);
    },
    [clearPoseGraphInspectorSelection, handleSelectObject],
  );
  const handleSelectRigWithInspectorSync = useCallback(
    (id: string | null) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectRig(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectRig],
  );
  const handleClearSelectionWithInspectorSync = useCallback(() => {
    clearPoseGraphInspectorSelection();
    handleClearSelection();
  }, [clearPoseGraphInspectorSelection, handleClearSelection]);
  const handleSelectPoseWithInspectorSync = useCallback(
    (id: string) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectPose(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectPose],
  );
  const handleSelectPoseGroupWithInspectorSync = useCallback(
    (selection: PoseGroupInspectorSelection | null) => {
      if (selection) {
        if (selectedId) {
          handleClearSelection();
        }
        if (selectedRigId) {
          handleSelectRig(null);
        }
        if (selectedMaterialId) {
          handleSelectMaterial(null);
        }
        if (selectedMotionGraphNodeId) {
          handleSelectMotionGraphNode(null);
        }
        poseRig.selectPose("");
        setSelectedBlendStage(null);
      }
      setSelectedPoseGroup(selection);
    },
    [
      handleClearSelection,
      handleSelectMaterial,
      handleSelectRig,
      poseRig,
      selectedId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      selectedRigId,
      handleSelectMotionGraphNode,
    ],
  );
  const handleSelectBlendStageWithInspectorSync = useCallback(
    (selection: BlendStageInspectorSelection | null) => {
      if (selection) {
        if (selectedId) {
          handleClearSelection();
        }
        if (selectedRigId) {
          handleSelectRig(null);
        }
        if (selectedMaterialId) {
          handleSelectMaterial(null);
        }
        if (selectedMotionGraphNodeId) {
          handleSelectMotionGraphNode(null);
        }
        poseRig.selectPose("");
        setSelectedPoseGroup(null);
      }
      setSelectedBlendStage(selection);
    },
    [
      handleClearSelection,
      handleSelectMaterial,
      handleSelectRig,
      poseRig,
      selectedId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      selectedRigId,
      handleSelectMotionGraphNode,
    ],
  );
  const handleSelectMotionGraphNodeWithInspectorSync = useCallback(
    (id: string | null) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectMotionGraphNode(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectMotionGraphNode],
  );
  useEffect(() => {
    if (motionGraphPanelVisible) {
      return;
    }
    if (selectedMotionGraphNodeId) {
      handleSelectMotionGraphNode(null);
    }
  }, [
    motionGraphPanelVisible,
    selectedMotionGraphNodeId,
    handleSelectMotionGraphNode,
  ]);

  const sharedVariableSync = useSharedVariableSync({
    mainInputsById: mirrorableMainInputsById,
    mainInputValues: mainFaceInputValues,
    referenceInputs: referenceFaceContextValue.standardInputs,
    referenceInputValues: referenceFaceContextValue.inputValues,
    onMainInputValueChange: mainFaceHandleInputValueChange,
    onReferenceInputValueChange:
      referenceFaceContextValue.handleInputValueChange,
    initialPolicy: "off",
  });

  // Reference Face Import
  const refFaceFileInputRef = useRef<HTMLInputElement>(null);
  const handleRefFaceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      referenceFaceContextValue.setFile(file);
      event.target.value = "";
    },
    [referenceFaceContextValue],
  );

  const handleImportReferenceFaceClick = useCallback(() => {
    refFaceFileInputRef.current?.click();
  }, []);

  // File Import Logic
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipNextDiscrepancyCheck = useRef(false);

  const handleNewClick = useCallback(() => {
    loader.reset();
  }, [loader]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        skipNextDiscrepancyCheck.current = false;
        return;
      }
      const skipChecks = skipNextDiscrepancyCheck.current;
      beginImportFlow(skipChecks ? "File import (skip checks)" : "File import");
      markImportFileSelected();

      if (skipChecks) {
        uiActions.setSkipDiscrepancyCheck(true);
      } else {
        uiActions.setSkipDiscrepancyCheck(false);
      }
      skipNextDiscrepancyCheck.current = false;

      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
      );
      event.target.value = "";
    },
    [beginImportFlow, loadFromFile, markImportFileSelected, uiActions],
  );

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = false;
    fileInputRef.current?.click();
  }, []);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = true;
    fileInputRef.current?.click();
  }, []);

  const menuBar = (
    <AppMenuBar
      onNew={handleNewClick}
      onImport={handleImportClick}
      onImportSkipChecks={handleImportSkipChecksClick}
      onImportReferenceFace={handleImportReferenceFaceClick}
      onExport={() => setShowExportDialog(true)}
      showSelectionGlow={showSelectionGlow}
      onToggleSelectionGlow={setShowSelectionGlow}
    />
  );

  const runtimeBundle = useMemo(
    () =>
      buildRuntimeBaseBundle({
        namespace: DEFAULT_NAMESPACE,
        world: runtimeWorld ?? null,
        animatables: runtimeAnimatables ?? null,
        loadedBundle: loadedBundle ?? null,
      }),
    [loadedBundle, runtimeAnimatables, runtimeWorld],
  );

  const runtimeInputReady =
    typeof stageRuntimeInput === "function" && graphStatus === "ready";
  const runtimeVisibleReady =
    runtimeViewReady &&
    !runtimeViewLoading &&
    runtimeViewRootId !== null &&
    runtimeViewRootId === rootId;
  const loadingSessionActive =
    loader.faceLoadSessionStartedAtMs !== null &&
    loader.faceLoadSessionCompletedAtMs === null;
  const loadingCoordinatorSettled = faceLoadInFlightOperationCount === 0;
  const deterministicMilestoneChainReady =
    faceLoadMilestones["asset-loaded"] !== null &&
    faceLoadMilestones["bundle-synced"] !== null &&
    faceLoadMilestones["graph-ready"] !== null;
  const loadingBarVisible = loadingSessionActive;
  const weightedStepProgress = useMemo(
    () => computeWeightedFaceLoadProgress(loader.faceLoadSteps),
    [loader.faceLoadSteps],
  );
  const migrationStepInFlightRef = useRef(false);
  const [migrationCompletedSessionToken, setMigrationCompletedSessionToken] =
    useState<string | null>(null);
  const migrationCompleteForSession =
    faceLoadSessionToken !== null &&
    migrationCompletedSessionToken === faceLoadSessionToken;
  const loadingBarProgress =
    runtimeInputReady &&
    runtimeVisibleReady &&
    loadingCoordinatorSettled &&
    migrationCompleteForSession
      ? 1
      : weightedStepProgress;
  const previousLoadingSessionActiveRef = useRef(loadingSessionActive);

  useEffect(() => {
    if (!loadingSessionActive) {
      migrationStepInFlightRef.current = false;
      setMigrationCompletedSessionToken(null);
    }
  }, [loadingSessionActive]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const previous = previousLoadingSessionActiveRef.current;
    if (previous !== loadingSessionActive) {
      console.log("[face-load][app]", {
        event: loadingSessionActive ? "session-visible" : "session-hidden",
        sessionToken: faceLoadSessionToken,
        graphStatus,
        runtimeInputReady,
        runtimeVisibleReady,
        runtimeViewRootId,
        runtimeViewGraphCount,
        rootId,
        milestones: faceLoadMilestones,
        inFlightOperations: faceLoadInFlightOperationCount,
        lastOperationAtMs: faceLoadLastOperationUpdateAtMs,
        startedAtMs: loader.faceLoadSessionStartedAtMs,
        completedAtMs: loader.faceLoadSessionCompletedAtMs,
      });
      previousLoadingSessionActiveRef.current = loadingSessionActive;
    }
  }, [
    faceLoadMilestones,
    faceLoadSessionToken,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    graphStatus,
    loader.faceLoadSessionCompletedAtMs,
    loader.faceLoadSessionStartedAtMs,
    loadingSessionActive,
    rootId,
    runtimeInputReady,
    runtimeViewRootId,
    runtimeViewGraphCount,
    runtimeVisibleReady,
  ]);

  useEffect(() => {
    const completionSettleWindowMs = 500;
    if (!loadingSessionActive) {
      return;
    }
    if (
      rootId &&
      loadedBundle === null &&
      faceLoadMilestones["asset-loaded"] !== null &&
      faceLoadMilestones["bundle-synced"] === null
    ) {
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "normalize-rig-graph",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "import-rig-graph",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "import-pose-config",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        status: "complete",
      });
    }
    onFaceLoadPhaseChange({
      stepId: "runtime-stabilization",
      substepId: "wait-runtime-input-bridge",
      status: runtimeInputReady ? "complete" : "active",
    });
    if (migrationStepInFlightRef.current || migrationCompleteForSession) {
      onFaceLoadPhaseChange({
        stepId: "runtime-stabilization",
        substepId: "migrate-legacy-bindings",
        status: migrationStepInFlightRef.current ? "active" : "complete",
      });
    }
    if (runtimeInputReady && runtimeVisibleReady) {
      if (deterministicMilestoneChainReady) {
        markFaceLoadMilestone("runtime-ready", {
          sessionToken: faceLoadSessionToken,
        });
      }
    }
    if (
      graphStatus === "ready" &&
      faceLoadMilestones["asset-loaded"] !== null &&
      faceLoadMilestones["bundle-synced"] !== null &&
      faceLoadMilestones["graph-ready"] === null
    ) {
      markFaceLoadMilestone("graph-ready", {
        sessionToken: faceLoadSessionToken,
      });
    }
    if (!runtimeInputReady || !runtimeVisibleReady) {
      return;
    }
    if (!deterministicMilestoneChainReady) {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "wait-milestone-chain",
          sessionToken: faceLoadSessionToken,
          graphStatus,
          runtimeInputReady,
          runtimeVisibleReady,
          runtimeViewRootId,
          runtimeViewGraphCount,
          rootId,
          milestones: faceLoadMilestones,
        });
      }
      return;
    }
    if (!loadingCoordinatorSettled) {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "wait-operations",
          sessionToken: faceLoadSessionToken,
          inFlightOperations: faceLoadInFlightOperationCount,
        });
      }
      return;
    }
    if (!migrationCompleteForSession) {
      if (!faceLoadSessionToken || migrationStepInFlightRef.current) {
        return;
      }
      migrationStepInFlightRef.current = true;
      onFaceLoadPhaseChange({
        stepId: "runtime-stabilization",
        substepId: "migrate-legacy-bindings",
        status: "active",
      });
      let migratedCount = 0;
      try {
        migratedCount = handleMigrateAllLegacyBindings();
      } catch (error) {
        console.error(
          "[face-load][app] failed to auto-migrate legacy bindings",
          error,
        );
      } finally {
        if (__DEV__) {
          console.log("[face-load][app]", {
            event: "migrate-legacy-bindings-complete",
            sessionToken: faceLoadSessionToken,
            migratedCount,
          });
        }
        migrationStepInFlightRef.current = false;
        setMigrationCompletedSessionToken(faceLoadSessionToken);
        onFaceLoadPhaseChange({
          stepId: "runtime-stabilization",
          substepId: "migrate-legacy-bindings",
          status: "complete",
        });
      }
      return;
    }
    const sinceLastOperationMs =
      typeof faceLoadLastOperationUpdateAtMs === "number"
        ? Math.max(0, Date.now() - faceLoadLastOperationUpdateAtMs)
        : completionSettleWindowMs;
    const settleDelayMs = Math.max(
      0,
      completionSettleWindowMs - sinceLastOperationMs,
    );
    if (__DEV__) {
      console.log("[face-load][app]", {
        event: "complete-scheduled",
        sessionToken: faceLoadSessionToken,
        settleDelayMs,
        inFlightOperations: faceLoadInFlightOperationCount,
        milestones: faceLoadMilestones,
      });
    }
    const timer = window.setTimeout(() => {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "complete-fired",
          sessionToken: faceLoadSessionToken,
          milestones: faceLoadMilestones,
        });
      }
      completeImportFlow();
    }, settleDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    completeImportFlow,
    deterministicMilestoneChainReady,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    faceLoadMilestones,
    faceLoadSessionToken,
    handleMigrateAllLegacyBindings,
    graphStatus,
    loadingCoordinatorSettled,
    migrationCompleteForSession,
    loadingSessionActive,
    loadedBundle,
    markFaceLoadMilestone,
    setMigrationCompletedSessionToken,
    runtimeInputReady,
    runtimeViewRootId,
    runtimeViewGraphCount,
    runtimeVisibleReady,
    onFaceLoadPhaseChange,
    rootId,
  ]);

  const viewerContent = (
    <div
      className={
        activeWorkbench === "std-feature-spaces"
          ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
          : "viewer-wrapper relative w-full h-full"
      }
      style={{ height: "100%", width: "100%" }}
    >
      {referenceFacePanelVisible ? (
        <PanelGroup
          orientation={viewerSplitVertical ? "horizontal" : "vertical"}
        >
          <ResizablePanel defaultSize={70} minSize={20}>
            <div className="relative w-full h-full">
              {loadingBarVisible && (
                <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none">
                  <FaceLoadingProgressBar
                    visible={loadingBarVisible}
                    progress={loadingBarProgress}
                    steps={loader.faceLoadSteps}
                    milestones={faceLoadMilestones}
                    graphStatus={graphStatus}
                    graphError={graphError}
                    runtimeInputReady={runtimeInputReady}
                    sessionStartedAtMs={loader.faceLoadSessionStartedAtMs}
                    sessionCompletedAtMs={loader.faceLoadSessionCompletedAtMs}
                    inFlightOperations={faceLoadInFlightOperationCount}
                    sourceLabel={loader.faceLoadSourceLabel}
                  />
                </div>
              )}
              <Viewer
                rootId={rootId}
                namespace={DEFAULT_NAMESPACE}
                bundle={rootId ? runtimeBundle : null}
                selectedSceneId={selectedSceneId}
                onSelectScene={handleSelectObjectWithInspectorSync}
                onRuntimeInputsReady={handleMainRuntimeInputsReady}
                onRuntimeExportBodiesChange={handleRuntimeExportBodiesChange}
                onClearSelection={handleClearSelectionWithInspectorSync}
                showSelectionGlow={showSelectionGlow}
                onImportClick={handleImportClick}
                onLoadQuori={handleLoadQuori}
                onLoadHugo={handleLoadHugo}
                presetLoadOptions={FACE_PRESET_GRID_OPTIONS}
                onLoadPresetAsset={handleLoadPresetAsset}
              />
            </div>
          </ResizablePanel>
          <PanelResizeHandle
            className={
              viewerSplitVertical
                ? "w-1 bg-border-default hover:bg-border-hover transition-colors"
                : "h-1 bg-border-default hover:bg-border-hover transition-colors"
            }
          />
          <ResizablePanel defaultSize={30} minSize={20}>
            <ReferenceFacePanel
              splitVertical={viewerSplitVertical}
              onToggleSplit={() => setViewerSplitVertical((prev) => !prev)}
            />
          </ResizablePanel>
        </PanelGroup>
      ) : (
        <div className="relative w-full h-full">
          {loadingBarVisible && (
            <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none">
              <FaceLoadingProgressBar
                visible={loadingBarVisible}
                progress={loadingBarProgress}
                steps={loader.faceLoadSteps}
                milestones={faceLoadMilestones}
                graphStatus={graphStatus}
                graphError={graphError}
                runtimeInputReady={runtimeInputReady}
                sessionStartedAtMs={loader.faceLoadSessionStartedAtMs}
                sessionCompletedAtMs={loader.faceLoadSessionCompletedAtMs}
                inFlightOperations={faceLoadInFlightOperationCount}
                sourceLabel={loader.faceLoadSourceLabel}
              />
            </div>
          )}
          <Viewer
            rootId={rootId}
            namespace={DEFAULT_NAMESPACE}
            bundle={rootId ? runtimeBundle : null}
            selectedSceneId={selectedSceneId}
            onSelectScene={handleSelectObjectWithInspectorSync}
            onRuntimeInputsReady={handleMainRuntimeInputsReady}
            onRuntimeExportBodiesChange={handleRuntimeExportBodiesChange}
            onClearSelection={handleClearSelectionWithInspectorSync}
            showSelectionGlow={showSelectionGlow}
            onImportClick={handleImportClick}
            onLoadQuori={handleLoadQuori}
            onLoadHugo={handleLoadHugo}
            presetLoadOptions={FACE_PRESET_GRID_OPTIONS}
            onLoadPresetAsset={handleLoadPresetAsset}
          />
        </div>
      )}

      {/* Hidden file input for Reference Face import */}
      <input
        ref={refFaceFileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleRefFaceFileChange}
      />
    </div>
  );
  const viewportContent = motionGraphPanelVisible ? (
    <PanelGroup orientation="horizontal">
      <ResizablePanel defaultSize={58} minSize={20}>
        {viewerContent}
      </ResizablePanel>
      <PanelResizeHandle className="w-1 bg-border-default hover:bg-border-hover transition-colors" />
      <ResizablePanel defaultSize={42} minSize={20}>
        <MotionGraphPanel
          onSelectNode={handleSelectMotionGraphNodeWithInspectorSync}
        />
      </ResizablePanel>
    </PanelGroup>
  ) : (
    viewerContent
  );

  return (
    <ReferenceFaceProvider value={referenceFaceContextValue}>
      <SharedVariableSyncProvider value={sharedVariableSync}>
        <WorkspaceLayout
          menuBar={menuBar}
          // Left
          leftTopVisible={hierarchyPanelVisible}
          leftTopPanel={
            <HierarchyPanel
              showSelectionGlow={showSelectionGlow}
              onToggleSelectionGlow={setShowSelectionGlow}
              onSelectObject={handleSelectObjectWithInspectorSync}
              referenceFaceFile={referenceFaceContextValue.file}
            />
          }
          leftBottomPanel={
            <VariablesPanel
              selectedRigId={selectedRigId}
              selectedPoseId={selectedPoseId}
              selectedSceneId={selectedSceneId}
              onSelectRig={handleSelectRigWithInspectorSync}
              onSelectPose={handleSelectPoseWithInspectorSync}
              onSelectScene={handleSelectObjectWithInspectorSync}
              availableSurfaces={controlAuthoringSurfaces}
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
              selectedBlendStage={selectedBlendStage}
              onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
              panelTitle="Control Authoring"
              panelDescription="Author and organize variables, poses, and pose groups."
              onClosePanel={handleHideControlAuthoringPanel}
            />
          }
          leftBottomVisible2={false}
          leftBottomVisible3={
            motionGraphPanelVisible && motionGraphPalettePanelVisible
          }
          leftBottomPanel3={<MotionGraphPalettePanel />}
          leftMiddleVisible={inputControlsPanelVisible}
          leftMiddlePanel={
            <VariablesPanel
              selectedRigId={selectedRigId}
              selectedPoseId={selectedPoseId}
              selectedSceneId={selectedSceneId}
              onSelectRig={handleSelectRigWithInspectorSync}
              onSelectPose={handleSelectPoseWithInspectorSync}
              onSelectScene={handleSelectObjectWithInspectorSync}
              availableSurfaces={inputControlSurfaces}
              panelTitle="Input Controls"
              panelDescription="Preview and adjust live rig and pose-weight inputs plus procedural animation programming I/O."
              onClosePanel={handleHideInputControlsPanel}
              motionGraphActive={motionGraphPanelVisible}
              runtimeFaceId={faceId}
              onSelectMotionGraphNode={
                handleSelectMotionGraphNodeWithInspectorSync
              }
            />
          }
          leftBottomVisible={controlAuthoringPanelVisible}
          // Center
          topPanel={
            <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-bg-panel/50 border-b border-border-default"></div>
          }
          viewport={viewportContent}
          bottomVisible={animationPanelVisible}
          bottomPanel={<AnimationPanel />}
          // Right
          rightTopVisible={inspectorPanelVisible}
          rightTopPanel={
            <InspectorPanel
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
              selectedBlendStage={selectedBlendStage}
              onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
              hasReferenceFaceFile={Boolean(referenceFaceContextValue.file)}
            />
          }
          rightBottomVisible={debugPanelVisible}
          rightBottomPanel={
            <DebugPanel
              rootId={loader.rootId}
              loadedBundle={loader.bundle}
              updateBundle={loader.updateBundle}
              isLoading={loader.isLoading}
            />
          }
        />
      </SharedVariableSyncProvider>

      <AppWizards
        showExportDialog={showExportDialog}
        onCloseExportDialog={() => setShowExportDialog(false)}
        rootId={rootId}
        exportSceneRoot={exportSceneRoot}
        runtimeExportBodies={runtimeExportBodies}
        sourceName={sourceName}
        loadedBundle={loadedBundle}
        canExport={canExport}
        handleImportPoseGraphFile={handleImportPoseGraphFile}
        poseGraphRemap={poseGraphRemap}
        handlePoseGraphRemapApply={handlePoseGraphRemapApply}
        handlePoseGraphRemapCancel={handlePoseGraphRemapCancel}
      />

      <OrientationConfirmationDialog
        open={showOrientationDialog}
        onClose={handleOrientationDialogClose}
        axisDegrees={orientationAxisDegrees}
        axisAvailability={orientationAxisAvailability}
        onRotateAxis={handleRotateSceneOrientation}
      />

      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".glb,.gltf"
        onChange={(e) => void handleFileChange(e)}
      />
    </ReferenceFaceProvider>
  );
}

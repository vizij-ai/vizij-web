import { useCallback, useEffect, useState, useRef } from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { loadGLTFFromBlobWithBundle, useVizijStore } from "@vizij/render";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { useWorkspaceStore } from "./state/workspaceStore";
import { AppMenuBar } from "./components/app/AppMenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import { Viewer } from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
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
import type { PoseGroupInspectorSelection } from "./types/poseGroupInspector";
import { ReferenceFaceProvider } from "./state/ReferenceFaceContext";
import { useReferenceFaceState } from "./hooks/useReferenceFaceState";
import { useUnifiedSelection } from "./hooks/useUnifiedSelection";
import { buildRuntimeBaseBundle } from "./utils/runtimeBundle";
import { useSharedVariableSync } from "./hooks/useSharedVariableSync";
import { SharedVariableSyncProvider } from "./state/SharedVariableSyncContext";
import { getVisibleVariablesSurfaces } from "./components/panels/variablesSurfaceOrder";

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;

export default function App() {
  const assetLoader = useVizijAssetLoader();

  return (
    <RigControllerProvider
      namespace={DEFAULT_NAMESPACE}
      rootId={assetLoader.rootId}
      sourceName={assetLoader.sourceName}
    >
      <PoseRigProvider rootId={assetLoader.rootId}>
        <AuthoringUiProvider>
          <AppContent loader={assetLoader} />
        </AuthoringUiProvider>
      </PoseRigProvider>
    </RigControllerProvider>
  );
}

interface AppContentProps {
  loader: VizijAssetLoaderState;
}

function AppContent({ loader }: AppContentProps) {
  const {
    rootId,
    sourceName,
    isLoading,
    loadFromFile,
    bundle: loadedBundle,
  } = loader;

  // Highlighting State (moved from Viewer)
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedPoseGroup, setSelectedPoseGroup] =
    useState<PoseGroupInspectorSelection | null>(null);

  // Reference Face State

  const handleLoadAssetFromUrl = useCallback(
    async (url: string, filename: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url} `);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "model/gltf-binary" });

        await loadFromFile(file, () =>
          loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
        );
      } catch (err) {
        console.error("Failed to load asset from URL:", err);
      }
    },
    [loadFromFile],
  );

  const handleLoadQuori = useCallback(() => {
    handleLoadAssetFromUrl(
      "/assets/Quori_Latest_Rigged.glb",
      "Quori_Latest_Rigged.glb",
    );
  }, [handleLoadAssetFromUrl]);

  const handleLoadHugo = useCallback(() => {
    handleLoadAssetFromUrl(
      "/assets/Hugo_Latest_Rigged.glb",
      "Hugo_Latest_Rigged.glb",
    );
  }, [handleLoadAssetFromUrl]);

  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const mainFaceInputValues = useBindingAuthoring((state) => state.inputValues);
  const mainFaceInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );

  const referenceFaceContextValue = useReferenceFaceState();

  // Graph Runtime Hook
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const runtimeWorld = useVizijStore((state) => state.world);
  const runtimeAnimatables = useVizijStore((state) => state.animatables);
  useGraphRuntime((state) => state.graphSpec);
  useGraphRuntime((state) => state.poseGraphSpec);
  useGraphRuntime((state) => state.poseConfig);
  useGraphRuntime((state) => state.discrepancyReview);
  useGraphRuntime((state) => state.resolveDiscrepancyReview);

  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);

  const canExport = Boolean(rootId) && !isLoading;

  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);

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
        console.warn("[vizij-authoring] Pose graph import warnings:", warnings);
      }
    },
    [poseRig],
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
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );

  useBundleSynchronizer({
    faceId,
    rootId: loader.rootId,
    loadedBundle: loader.bundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpec: handleImportGraphSpec,
    importPoseConfigFromData: poseRig.importPoseConfigFromData,
  });

  const { panels } = useWorkspaceStore();
  const visibleVariablesSurfaces = getVisibleVariablesSurfaces({
    variables: panels.variables,
    poses: panels.poses,
    materials: panels.materials,
    inputs: panels.inputs,
  });
  const variablesPanelVisible = visibleVariablesSurfaces.length > 0;
  const {
    selectedId,
    selectedRigId,
    selectedPoseId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    handleClearSelection,
  } = useUnifiedSelection();
  const selectedSceneId = selectedId;

  const sharedVariableSync = useSharedVariableSync({
    mainInputsById: mainFaceInputsById,
    mainInputValues: mainFaceInputValues,
    referenceInputs: referenceFaceContextValue.standardInputs,
    referenceInputValues: referenceFaceContextValue.inputValues,
    onMainInputValueChange: mainFaceHandleInputValueChange,
    onReferenceInputValueChange:
      referenceFaceContextValue.handleInputValueChange,
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
      if (!file) return;

      if (skipNextDiscrepancyCheck.current) {
        uiActions.setSkipDiscrepancyCheck(true);
        skipNextDiscrepancyCheck.current = false;
      } else {
        uiActions.setSkipDiscrepancyCheck(false);
      }

      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
      );
      event.target.value = "";
    },
    [loadFromFile, uiActions],
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
    />
  );

  const runtimeBundle = buildRuntimeBaseBundle({
    namespace: DEFAULT_NAMESPACE,
    world: runtimeWorld ?? null,
    animatables: runtimeAnimatables ?? null,
    loadedBundle: loadedBundle ?? null,
  });

  const viewerContent = (
    <div
      className={
        activeWorkbench === "std-feature-spaces"
          ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
          : "viewer-wrapper relative w-full h-full"
      }
      style={{ height: "100%", width: "100%" }}
    >
      {panels.referenceFace.isVisible ? (
        <PanelGroup
          orientation={viewerSplitVertical ? "horizontal" : "vertical"}
        >
          <ResizablePanel defaultSize={70} minSize={20}>
            <Viewer
              rootId={rootId}
              namespace={DEFAULT_NAMESPACE}
              bundle={rootId ? runtimeBundle : null}
              onClearSelection={handleClearSelection}
              showSelectionGlow={showSelectionGlow}
              onImportClick={handleImportClick}
              onLoadQuori={handleLoadQuori}
              onLoadHugo={handleLoadHugo}
            />
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
        <Viewer
          rootId={rootId}
          namespace={DEFAULT_NAMESPACE}
          bundle={rootId ? runtimeBundle : null}
          onClearSelection={handleClearSelection}
          showSelectionGlow={showSelectionGlow}
          onImportClick={handleImportClick}
          onLoadQuori={handleLoadQuori}
          onLoadHugo={handleLoadHugo}
        />
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

  return (
    <ReferenceFaceProvider value={referenceFaceContextValue}>
      <SharedVariableSyncProvider value={sharedVariableSync}>
        <WorkspaceLayout
          menuBar={menuBar}
          // Left
          leftTopVisible={panels.hierarchy.isVisible}
          leftTopPanel={
            <HierarchyPanel
              showSelectionGlow={showSelectionGlow}
              onToggleSelectionGlow={setShowSelectionGlow}
              onSelectObject={handleSelectObject}
            />
          }
          leftBottomVisible={variablesPanelVisible}
          leftBottomPanel={
            <VariablesPanel
              selectedRigId={selectedRigId}
              selectedPoseId={selectedPoseId}
              selectedSceneId={selectedSceneId}
              onSelectRig={handleSelectRig}
              onSelectPose={handleSelectPose}
              onSelectScene={handleSelectObject}
              availableSurfaces={visibleVariablesSurfaces}
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={setSelectedPoseGroup}
            />
          }
          leftBottomVisible2={false}
          leftBottomVisible3={false}
          leftMiddleVisible={false}
          // Center
          topPanel={
            <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-bg-panel/50 border-b border-border-default"></div>
          }
          viewport={viewerContent}
          bottomVisible={panels.animation.isVisible}
          bottomPanel={<AnimationPanel />}
          // Right
          rightTopVisible={panels.inspector.isVisible}
          rightTopPanel={
            <InspectorPanel
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={setSelectedPoseGroup}
            />
          }
          rightBottomVisible={panels.debug.isVisible}
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
        sourceName={sourceName}
        loadedBundle={loadedBundle}
        canExport={canExport}
        handleImportPoseGraphFile={handleImportPoseGraphFile}
        poseGraphRemap={poseGraphRemap}
        handlePoseGraphRemapApply={handlePoseGraphRemapApply}
        handlePoseGraphRemapCancel={handlePoseGraphRemapCancel}
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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { useVizijStore } from "@vizij/render";
import { prewarmVizijRuntime } from "@vizij/runtime-react";
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
import { useBundleSyncState } from "./hooks/useBundleSyncState";
import { AppWizards } from "./components/app/AppWizards";
import { ImportFailureStack } from "./components/app/ImportFailureStack";
import { ImportProgressStatus } from "./components/app/ImportProgressStatus";
import {
  RigControllerProvider,
  useBindingAuthoring,
  useGraphRuntime,
} from "./state/RigControllerProvider";
import { isPlaceholderGraphImportHandler } from "./state/graphRuntimeStore";
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
import { useSharedVariableSync } from "./hooks/useSharedVariableSync";
import { useRuntimeBaseBundle } from "./hooks/useRuntimeBaseBundle";
import { useSampleAssetLoader } from "./hooks/useSampleAssetLoader";
import { useImportFileHandlers } from "./hooks/useImportFileHandlers";
import { SharedVariableSyncProvider } from "./state/SharedVariableSyncContext";
import { getVisibleVariablesSurfaces } from "./components/panels/variablesSurfaceOrder";
import { waitForNextFrame } from "./utils/frame";
import {
  createPoseImportResult,
  resolveImportSuccessStatus,
} from "./types/importOutcome";

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;
const runtimePrewarmFlag = (
  import.meta.env.VITE_RUNTIME_PREWARM ?? ""
).toLowerCase();
const ENABLE_RUNTIME_PREWARM =
  runtimePrewarmFlag === "1" || runtimePrewarmFlag === "true";

export default function App() {
  const assetLoader = useVizijAssetLoader();
  const [rigAutosaveEnabled, setRigAutosaveEnabled] = useState(false);

  return (
    <RigControllerProvider
      namespace={DEFAULT_NAMESPACE}
      rootId={assetLoader.rootId}
      sourceName={assetLoader.sourceName}
      rigAutosaveEnabled={rigAutosaveEnabled}
    >
      <PoseRigProvider rootId={assetLoader.rootId}>
        <AuthoringUiProvider>
          <AppContent
            loader={assetLoader}
            rigAutosaveEnabled={rigAutosaveEnabled}
            onToggleRigAutosave={setRigAutosaveEnabled}
          />
        </AuthoringUiProvider>
      </PoseRigProvider>
    </RigControllerProvider>
  );
}

interface AppContentProps {
  loader: VizijAssetLoaderState;
  rigAutosaveEnabled: boolean;
  onToggleRigAutosave: (enabled: boolean) => void;
}

function AppContent({
  loader,
  rigAutosaveEnabled,
  onToggleRigAutosave,
}: AppContentProps) {
  const {
    rootId,
    sourceName,
    isLoading,
    error: loaderError,
    clearError: clearLoaderError,
    loadFromFile,
    bundle: loadedBundle,
  } = loader;

  // Highlighting State (moved from Viewer)
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);
  const [includeAutorigInputs, setIncludeAutorigInputs] = useState(true);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedPoseGroup, setSelectedPoseGroup] =
    useState<PoseGroupInspectorSelection | null>(null);

  // Reference Face State
  const {
    sampleLoadFailure,
    loadSampleAssetFromUrl,
    loadQuoriSample,
    loadHugoSample,
    clearSampleLoadFailure,
  } = useSampleAssetLoader({
    clearLoaderError,
    loadFromFile,
  });

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

  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);

  const canExport = Boolean(rootId) && !isLoading;

  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);
  const createMissingStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();

  const { activeWorkbench, skipDiscrepancyCheck } = uiState;

  const poseRig = usePoseRig();

  const { alert: showAlert } = useDialogQueue();

  useEffect(() => {
    if (!ENABLE_RUNTIME_PREWARM) {
      return;
    }
    void prewarmVizijRuntime();
  }, []);

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
        return createPoseImportResult(
          resolveImportSuccessStatus(true),
          `Pose graph import applied with ${warnings.length} warning(s).`,
        );
      }
      return createPoseImportResult(resolveImportSuccessStatus(false));
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
    createMissingStandardInput,
    alertDialog: showAlert,
    applyPoseGraphImport,
  });

  const standardInputCount = poseRig.standardInputs.length;

  const faceId = useGraphRuntime((state) => state.faceId);
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );
  const importGraphSpecReady = !isPlaceholderGraphImportHandler(
    handleImportGraphSpec,
  );
  const poseRigRef = useRef(poseRig);
  useEffect(() => {
    poseRigRef.current = poseRig;
  }, [poseRig]);
  const runPostPoseImportNudge = useCallback(async () => {
    let snapshot = poseRigRef.current;
    for (
      let attempt = 0;
      attempt < 20 &&
      (snapshot.poses.length === 0 || snapshot.standardInputs.length === 0);
      attempt += 1
    ) {
      await waitForNextFrame();
      snapshot = poseRigRef.current;
    }
    if (snapshot.poses.length === 0 || snapshot.standardInputs.length === 0) {
      return;
    }
    const target = snapshot.poses
      .map((pose) => {
        const currentInputs = new Set(Object.keys(pose.values));
        const nudgeInput = snapshot.standardInputs.find(
          (input) => !currentInputs.has(input.id),
        );
        return nudgeInput ? { poseId: pose.id, inputId: nudgeInput.id } : null;
      })
      .find((entry): entry is { poseId: string; inputId: string } =>
        Boolean(entry),
      );
    if (!target) {
      return;
    }
    snapshot.addPoseInput(target.poseId, target.inputId);
    await waitForNextFrame();
    poseRigRef.current.removePoseInput(target.poseId, target.inputId);
  }, []);
  const {
    bundleSyncFailure,
    retryBundleSync,
    clearBundleSyncFailure,
    resetBundleSyncState,
  } = useBundleSyncState({
    faceId,
    rootId: loader.rootId,
    loadedBundle: loader.bundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpecReady,
    importGraphSpec: handleImportGraphSpec,
    importPoseConfigFromData: poseRig.importPoseConfigFromData,
    onPostPoseImport: runPostPoseImportNudge,
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
  const handleViewportSceneSelection = useCallback(
    (id: string | null) => {
      if (!id) {
        handleClearSelection();
        return;
      }
      handleSelectObject(id);
    },
    [handleClearSelection, handleSelectObject],
  );

  const sharedVariableSync = useSharedVariableSync({
    mainInputsById: mainFaceInputsById,
    mainInputValues: mainFaceInputValues,
    referenceInputs: referenceFaceContextValue.standardInputs,
    referenceInputValues: referenceFaceContextValue.inputValues,
    onMainInputValueChange: mainFaceHandleInputValueChange,
    onReferenceInputValueChange:
      referenceFaceContextValue.handleInputValueChange,
  });

  const {
    fileInputRef,
    referenceFaceFileInputRef,
    handleFileChange,
    handleImportClick,
    handleImportSkipChecksClick,
    handleReferenceFaceFileChange,
    handleImportReferenceFaceClick,
  } = useImportFileHandlers({
    clearLoaderError,
    clearSampleLoadFailure,
    resetBundleSyncState,
    loadFromFile,
    setSkipDiscrepancyCheck: uiActions.setSkipDiscrepancyCheck,
    setReferenceFaceFile: referenceFaceContextValue.setFile,
  });

  const handleNewClick = useCallback(() => {
    loader.reset();
    clearLoaderError();
    clearSampleLoadFailure();
    resetBundleSyncState();
  }, [clearLoaderError, clearSampleLoadFailure, loader, resetBundleSyncState]);

  const menuBar = (
    <AppMenuBar
      onNew={handleNewClick}
      onImport={handleImportClick}
      onImportSkipChecks={handleImportSkipChecksClick}
      onImportReferenceFace={handleImportReferenceFaceClick}
      onExport={() => setShowExportDialog(true)}
      showSelectionGlow={showSelectionGlow}
      onToggleSelectionGlow={setShowSelectionGlow}
      includeAutorigInputs={includeAutorigInputs}
      onToggleIncludeAutorigInputs={setIncludeAutorigInputs}
      rigAutosaveEnabled={rigAutosaveEnabled}
      onToggleRigAutosave={onToggleRigAutosave}
    />
  );

  const runtimeBundle = useRuntimeBaseBundle({
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
      <ImportFailureStack
        failures={[
          ...(loaderError
            ? [
                {
                  id: "asset-loader-failure",
                  title: "Asset import failed",
                  message: loaderError,
                  retryLabel: "Retry Import",
                  onRetry: handleImportClick,
                  onDismiss: clearLoaderError,
                },
              ]
            : []),
          ...(sampleLoadFailure
            ? [
                {
                  id: "sample-load-failure",
                  title: "Sample load failed",
                  message: sampleLoadFailure.message,
                  retryLabel: "Retry Sample",
                  onRetry: () => {
                    void loadSampleAssetFromUrl(
                      sampleLoadFailure.url,
                      sampleLoadFailure.filename,
                    );
                  },
                  onDismiss: clearSampleLoadFailure,
                },
              ]
            : []),
          ...(bundleSyncFailure
            ? [
                {
                  id: `bundle-sync-failure-${bundleSyncFailure.phase}`,
                  title:
                    bundleSyncFailure.phase === "rig"
                      ? "Bundle rig import failed"
                      : "Bundle pose import failed",
                  message: bundleSyncFailure.message,
                  retryLabel: "Retry Bundle Import",
                  onRetry: retryBundleSync,
                  onDismiss: clearBundleSyncFailure,
                },
              ]
            : []),
        ]}
      />

      {panels.referenceFace.isVisible ? (
        <PanelGroup
          orientation={viewerSplitVertical ? "horizontal" : "vertical"}
        >
          <ResizablePanel defaultSize={70} minSize={20}>
            <Viewer
              rootId={rootId}
              namespace={DEFAULT_NAMESPACE}
              bundle={rootId ? runtimeBundle : null}
              selectedSceneId={selectedSceneId}
              onSelectSceneChange={handleViewportSceneSelection}
              onClearSelection={handleClearSelection}
              showSelectionGlow={showSelectionGlow}
              onImportClick={handleImportClick}
              onLoadQuori={loadQuoriSample}
              onLoadHugo={loadHugoSample}
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
          selectedSceneId={selectedSceneId}
          onSelectSceneChange={handleViewportSceneSelection}
          onClearSelection={handleClearSelection}
          showSelectionGlow={showSelectionGlow}
          onImportClick={handleImportClick}
          onLoadQuori={loadQuoriSample}
          onLoadHugo={loadHugoSample}
        />
      )}

      {/* Hidden file input for Reference Face import */}
      <input
        ref={referenceFaceFileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleReferenceFaceFileChange}
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
              includeAutorigInputs={includeAutorigInputs}
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
            <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-bg-panel/50 border-b border-border-default">
              <ImportProgressStatus
                isAssetLoading={isLoading}
                rootId={rootId}
              />
            </div>
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

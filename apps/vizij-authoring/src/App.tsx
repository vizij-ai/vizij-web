import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
import { FaceLoadingProgressBar } from "./components/app/FaceLoadingProgressBar";
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

const __DEV__ = process.env.NODE_ENV !== "production";

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;
type FaceLoadPhaseChange = Parameters<
  VizijAssetLoaderState["updateExternalPhase"]
>[0];

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
          <AppContent
            loader={assetLoader}
            onFaceLoadPhaseChange={updateFaceLoadPhase}
          />
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
    faceLoadSessionToken,
    faceLoadMilestones,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    markFaceLoadMilestone,
    loadFromFile,
    bundle: loadedBundle,
    beginImportFlow,
    markImportFileSelected,
    cancelImportFlow,
    markImportFlowError,
    completeImportFlow,
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
    onPhaseChange: onFaceLoadPhaseChange,
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
      if (!file) {
        cancelImportFlow();
        return;
      }
      markImportFileSelected();

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
    [cancelImportFlow, loadFromFile, markImportFileSelected, uiActions],
  );

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = false;
    beginImportFlow("File import");
    fileInputRef.current?.click();
  }, [beginImportFlow]);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = true;
    beginImportFlow("File import (skip checks)");
    fileInputRef.current?.click();
  }, [beginImportFlow]);

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
  const loadingBarProgress =
    runtimeInputReady && runtimeVisibleReady && loadingCoordinatorSettled
      ? 1
      : graphStatus === "ready"
        ? Math.max(
            loadingCoordinatorSettled ? 0.95 : 0.92,
            loader.faceLoadProgress,
          )
        : loader.faceLoadProgress;
  const previousLoadingSessionActiveRef = useRef(loadingSessionActive);

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
    onFaceLoadPhaseChange({
      stepId: "runtime-stabilization",
      substepId: "wait-runtime-input-bridge",
      status: runtimeInputReady ? "complete" : "active",
    });
    if (runtimeInputReady && runtimeVisibleReady) {
      if (deterministicMilestoneChainReady) {
        markFaceLoadMilestone("runtime-ready", {
          sessionToken: faceLoadSessionToken,
        });
      }
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
    graphStatus,
    loadingCoordinatorSettled,
    loadingSessionActive,
    markFaceLoadMilestone,
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
      {panels.referenceFace.isVisible ? (
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
                onClearSelection={handleClearSelection}
                showSelectionGlow={showSelectionGlow}
                onImportClick={handleImportClick}
                onLoadQuori={handleLoadQuori}
                onLoadHugo={handleLoadHugo}
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
            onClearSelection={handleClearSelection}
            showSelectionGlow={showSelectionGlow}
            onImportClick={handleImportClick}
            onLoadQuori={handleLoadQuori}
            onLoadHugo={handleLoadHugo}
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

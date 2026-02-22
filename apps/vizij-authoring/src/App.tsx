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
  useGraphRuntimeStoreApi,
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
  getRuntimePerfMetricsSnapshot,
  recordRuntimeDebugEvent,
} from "./perf/runtimePerfMetrics";
import { resolveMainFaceLoadingPolicy } from "./perf/mainFaceLoadingPolicy";
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
  const mainFaceRuntimeInputBridgeReady = useGraphRuntime(
    (state) => typeof state.stageRuntimeInput === "function",
  );
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );
  const importGraphSpecReady = !isPlaceholderGraphImportHandler(
    handleImportGraphSpec,
  );
  const poseRigRef = useRef(poseRig);

  type PostPoseImportNudgeStrategy =
    | "add-remove-missing-input"
    | "remove-readd-existing-input";
  type PostPoseImportNudgeResult = {
    attempted: boolean;
    applied: boolean;
    strategy: PostPoseImportNudgeStrategy | null;
    reason: string | null;
    poseId: string | null;
    inputId: string | null;
    waitAttempts: number;
  };

  useEffect(() => {
    poseRigRef.current = poseRig;
  }, [poseRig]);
  const runPostPoseImportNudge = useCallback<
    () => Promise<PostPoseImportNudgeResult>
  >(async () => {
    let snapshot = poseRigRef.current;
    let waitAttempts = 0;
    for (
      let attempt = 0;
      attempt < 45 &&
      (snapshot.poses.length === 0 || snapshot.standardInputs.length === 0);
      attempt += 1
    ) {
      waitAttempts = attempt + 1;
      await waitForNextFrame();
      snapshot = poseRigRef.current;
    }
    if (snapshot.poses.length === 0) {
      return {
        attempted: false,
        applied: false,
        strategy: null,
        reason: "no-poses",
        poseId: null,
        inputId: null,
        waitAttempts,
      };
    }
    if (snapshot.standardInputs.length === 0) {
      return {
        attempted: false,
        applied: false,
        strategy: null,
        reason: "no-standard-inputs",
        poseId: null,
        inputId: null,
        waitAttempts,
      };
    }

    const availableInputIds = new Set(
      snapshot.standardInputs.map((input) => input.id),
    );

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
    if (target) {
      snapshot.addPoseInput(target.poseId, target.inputId);
      await waitForNextFrame();
      poseRigRef.current.removePoseInput(target.poseId, target.inputId);
      return {
        attempted: true,
        applied: true,
        strategy: "add-remove-missing-input",
        reason: null,
        poseId: target.poseId,
        inputId: target.inputId,
        waitAttempts,
      };
    }

    const fallbackTarget = snapshot.poses
      .map((pose) => {
        const existingInputId = Object.keys(pose.values).find((inputId) =>
          availableInputIds.has(inputId),
        );
        return existingInputId
          ? { poseId: pose.id, inputId: existingInputId }
          : null;
      })
      .find((entry): entry is { poseId: string; inputId: string } =>
        Boolean(entry),
      );

    if (!fallbackTarget) {
      return {
        attempted: false,
        applied: false,
        strategy: null,
        reason: "no-reusable-pose-input",
        poseId: null,
        inputId: null,
        waitAttempts,
      };
    }

    const targetPose =
      snapshot.poses.find((pose) => pose.id === fallbackTarget.poseId) ?? null;
    const originalValue =
      targetPose?.values[fallbackTarget.inputId] ?? undefined;
    const originalComposeMode =
      targetPose?.composeModes?.[fallbackTarget.inputId] ?? undefined;

    snapshot.removePoseInput(fallbackTarget.poseId, fallbackTarget.inputId);
    await waitForNextFrame();
    poseRigRef.current.addPoseInput(
      fallbackTarget.poseId,
      fallbackTarget.inputId,
    );
    await waitForNextFrame();

    if (typeof originalValue === "number" && Number.isFinite(originalValue)) {
      poseRigRef.current.updatePoseValue(
        fallbackTarget.poseId,
        fallbackTarget.inputId,
        originalValue,
      );
    }
    if (originalComposeMode === "add" || originalComposeMode === "average") {
      poseRigRef.current.setPoseInputComposeMode(
        fallbackTarget.poseId,
        fallbackTarget.inputId,
        originalComposeMode,
      );
    }

    return {
      attempted: true,
      applied: true,
      strategy: "remove-readd-existing-input",
      reason: null,
      poseId: fallbackTarget.poseId,
      inputId: fallbackTarget.inputId,
      waitAttempts,
    };
  }, []);
  const requestRuntimeTopologyRefresh = useCallback(async () => {
    const refreshStartMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const baseline = graphRuntimeStore.getState();
    const baselinePoseGraphRevision = baseline.poseGraphSpecRevision ?? 0;
    const baselinePoseGraphSpec = baseline.poseGraphSpec ?? null;
    const baselineForceRevision =
      baseline.graphBridgeForceTopologyRevision ?? 0;
    const targetForceRevision = baselineForceRevision + 1;
    const metricsBeforeRefresh = getRuntimePerfMetricsSnapshot();
    recordRuntimeDebugEvent("post-pose-import-refresh-start", {
      refreshVersion: "deterministic-nudge-v2",
      baselinePoseGraphRevision,
      baselineForceRevision,
      targetForceRevision,
      baselineControllerRegistrationRuns:
        metricsBeforeRefresh.controllerRegistrationRuns,
      baselineTopologyPublishes:
        metricsBeforeRefresh.graphBridgeTopologyPublishes,
    });

    let poseGraphSettled = false;
    let poseGraphSettleAttempts = 0;

    // Wait for the imported pose graph publication before forcing topology.
    for (let attempt = 0; attempt < 45; attempt += 1) {
      poseGraphSettleAttempts = attempt + 1;
      const next = graphRuntimeStore.getState();
      const poseGraphRevisionAdvanced =
        (next.poseGraphSpecRevision ?? 0) > baselinePoseGraphRevision;
      const poseGraphReferenceChanged =
        (next.poseGraphSpec ?? null) !== baselinePoseGraphSpec;
      if (poseGraphRevisionAdvanced || poseGraphReferenceChanged) {
        poseGraphSettled = true;
        break;
      }
      await waitForNextFrame();
    }

    let runtimeBridgeReady =
      typeof graphRuntimeStore.getState().stageRuntimeInput === "function";
    let runtimeReadyAttempts = 0;
    for (let attempt = 0; attempt < 90 && !runtimeBridgeReady; attempt += 1) {
      runtimeReadyAttempts = attempt + 1;
      await waitForNextFrame();
      runtimeBridgeReady =
        typeof graphRuntimeStore.getState().stageRuntimeInput === "function";
    }

    const metricsBeforeForce = getRuntimePerfMetricsSnapshot();

    graphRuntimeStore.setState((state) => ({
      graphBridgeForceTopologyRevision:
        (state.graphBridgeForceTopologyRevision ?? 0) + 1,
    }));

    let forcePublishObserved = false;
    let forcePublishWaitAttempts = 0;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      forcePublishWaitAttempts = attempt + 1;
      const next = graphRuntimeStore.getState();
      if ((next.graphBridgeForceTopologyRevision ?? 0) >= targetForceRevision) {
        const metricsAfterForce = getRuntimePerfMetricsSnapshot();
        if (
          metricsAfterForce.graphBridgeTopologyPublishes >
          metricsBeforeForce.graphBridgeTopologyPublishes
        ) {
          forcePublishObserved = true;
          break;
        }
      }
      await waitForNextFrame();
    }

    const metricsAfterForce = getRuntimePerfMetricsSnapshot();
    const postForceTopologyDelta =
      metricsAfterForce.graphBridgeTopologyPublishes -
      metricsBeforeForce.graphBridgeTopologyPublishes;
    const postForceRegistrationDelta =
      metricsAfterForce.controllerRegistrationRuns -
      metricsBeforeForce.controllerRegistrationRuns;

    // Deterministic correctness path: always apply the proven nudge after the
    // explicit forced refresh. Keep force deltas for continued root-cause work.
    await waitForNextFrame();
    const nudgeResult = await runPostPoseImportNudge();

    const metricsAfterNudge = getRuntimePerfMetricsSnapshot();
    recordRuntimeDebugEvent("post-pose-import-refresh-result", {
      refreshVersion: "deterministic-nudge-v2",
      poseGraphSettled,
      poseGraphSettleAttempts,
      runtimeBridgeReady,
      runtimeReadyAttempts,
      forcePublishObserved,
      forcePublishWaitAttempts,
      postForceTopologyDelta,
      postForceRegistrationDelta,
      nudgeApplied: nudgeResult.applied,
      nudgeAttempted: nudgeResult.attempted,
      nudgeStrategy: nudgeResult.strategy,
      nudgeReason: nudgeResult.reason,
      nudgePoseId: nudgeResult.poseId,
      nudgeInputId: nudgeResult.inputId,
      nudgeWaitAttempts: nudgeResult.waitAttempts,
      postNudgeTopologyDelta:
        metricsAfterNudge.graphBridgeTopologyPublishes -
        metricsBeforeRefresh.graphBridgeTopologyPublishes,
      postNudgeRegistrationDelta:
        metricsAfterNudge.controllerRegistrationRuns -
        metricsBeforeRefresh.controllerRegistrationRuns,
      elapsedMs:
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        refreshStartMs,
    });
  }, [graphRuntimeStore, runPostPoseImportNudge]);
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
    onPostPoseImport: requestRuntimeTopologyRefresh,
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

  const mainFaceLoadingPolicy = resolveMainFaceLoadingPolicy({
    rootId,
    isAssetLoading: isLoading,
    hasRuntimeInputBridge: mainFaceRuntimeInputBridgeReady,
  });
  const controlsLocked =
    Boolean(rootId) && !mainFaceLoadingPolicy.interactionEnabled;
  const panelInteractivityClass = controlsLocked
    ? "h-full w-full pointer-events-none opacity-65 transition-opacity"
    : "h-full w-full";

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
            <div className={panelInteractivityClass}>
              <HierarchyPanel
                showSelectionGlow={showSelectionGlow}
                onToggleSelectionGlow={setShowSelectionGlow}
                onSelectObject={handleSelectObject}
              />
            </div>
          }
          leftBottomVisible={variablesPanelVisible}
          leftBottomPanel={
            <div className={panelInteractivityClass}>
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
            </div>
          }
          leftBottomVisible2={false}
          leftBottomVisible3={false}
          leftMiddleVisible={false}
          // Center
          topPanel={
            <div className="h-full flex items-center px-4 gap-3 text-xs select-none bg-bg-panel/50 border-b border-border-default">
              <ImportProgressStatus
                isAssetLoading={isLoading}
                rootId={rootId}
                faceScope="main"
              />
              <div
                className={`ml-auto rounded border px-2 py-1 text-[10px] font-semibold tracking-wide ${
                  mainFaceLoadingPolicy.interactionEnabled
                    ? "border-emerald-600/60 bg-emerald-900/20 text-emerald-300"
                    : "border-amber-600/60 bg-amber-900/20 text-amber-300"
                }`}
              >
                {mainFaceLoadingPolicy.label}
              </div>
              <p className="max-w-sm truncate text-[10px] text-text-muted">
                {mainFaceLoadingPolicy.detail}
              </p>
            </div>
          }
          viewport={viewerContent}
          bottomVisible={panels.animation.isVisible}
          bottomPanel={
            <div className={panelInteractivityClass}>
              <AnimationPanel />
            </div>
          }
          // Right
          rightTopVisible={panels.inspector.isVisible}
          rightTopPanel={
            <div className={panelInteractivityClass}>
              <InspectorPanel
                selectedPoseGroup={selectedPoseGroup}
                onSelectPoseGroup={setSelectedPoseGroup}
              />
            </div>
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

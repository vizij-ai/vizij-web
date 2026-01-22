import { useCallback, useEffect, useMemo, useState, useId, useRef } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { ImportExportWorkbench } from "./components/app/ImportExportWorkbench";
import { Viewer } from "./components/app/Viewer";
import { WorkbenchNav } from "./components/app/WorkbenchNav";
import { SceneComposerWorkbench } from "./components/scene-composer";
import { PoseRigWorkbench } from "./poseRig/components";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useDialogQueue } from "@vizij/authoring-shared";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
import {
  WORKBENCH_OPTIONS,
  type WorkbenchView,
} from "./components/app/workbenchConfig";
import { DiscrepancyWizard } from "./components/discrepancy/DiscrepancyWizard";
import { PoseGraphRemapWizard } from "./components/poseRig/PoseGraphRemapWizard";
import {
  RigControllerProvider,
  useBindingAuthoring,
  useGraphRuntime,
  useSelectionStore,
} from "./state/RigControllerProvider";
import {
  AuthoringUiProvider,
  useAuthoringUiActions,
  useAuthoringUiState,
  type RiggingTab,
} from "./state/AuthoringUiProvider";
import { PoseRigProvider, usePoseRig } from "./state/PoseRigProvider";
import type { ReactNode } from "react";
import { Panel } from "./components/ui";
import { RiggingTabs } from "./components/app/RiggingTabs";
import { SceneRiggingSection } from "./components/scene-composer/SceneRiggingSection";
import { StdFeatureSpacesEditor } from "./components/app/StdFeatureSpacesEditor";
import { ReferenceFaceRuntime } from "./components/app/ReferenceFaceRuntime";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import type { VizijBundleExtension } from "@vizij/render";
import { ReferenceFaceProvider, type ReferenceFaceState } from "./state/ReferenceFaceContext";
import type { StandardRigInput } from "@vizij/utils";
import {
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "./utils/standardInputBindings";

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;

type WorkbenchGuide = {
  label: string;
  summary: string;
  content: ReactNode;
};

const WORKBENCH_GUIDES: Record<WorkbenchView, WorkbenchGuide> = {
  "import-export": {
    label: "How the import/export sidebar flows",
    summary: "Load GLBs → audit data → export clean assets",
    content: (
      <ol>
        <li>
          Drop in a Vizij GLB or use the loader below to populate the bundle
          summary and runtime preview.
        </li>
        <li>
          Run RobotData and bundle audits before exporting—green statuses
          confirm GraphSpecs and IR are in sync.
        </li>
        <li>
          Use the export + optional sections to save GLBs, rig graphs, and pose
          configs once everything checks out.
        </li>
      </ol>
    ),
  },
  "scene-composer": {
    label: "Scene composer quickstart",
    summary: "Select nodes, inspect drivers, edit bindings",
    content: (
      <ol>
        <li>
          Use the hierarchy tree to pick objects or search by name / type;
          selections remain in sync with the viewport.
        </li>
        <li>
          The inspector surfaces drivers, bindings, and metadata for the active
          object—tweak values to preview changes live.
        </li>
        <li>
          Clear or refocus selections anytime via the tree or directly clicking
          in the viewer.
        </li>
        <li>
          Pose the face by manipulating drivers and save the pose with the
          viewport header.
        </li>
      </ol>
    ),
  },
  "pose-rig": {
    label: "Pose rig workflow",
    summary: "Capture neutrals → sculpt poses → export grouped graphs",
    content: (
      <ol>
        <li>
          Capture/overwrite the neutral pose, then create pose entries to store
          sculpted driver deltas.
        </li>
        <li>
          Assign group labels to define rig path prefixes and batch apply names
          to related poses.
        </li>
        <li>
          Export grouped pose graphs or import an existing graph to reuse naming
          + weights.
        </li>
      </ol>
    ),
  },
  "std-feature-spaces": {
    label: "Standard Feature Spaces workflow",
    summary: "Map your face to a Standard Feature Space",
    content: (
      <div>
        <p>
        The Standard Feature Spaces Editor allows you to align your face to predefined
        feature spaces. This enables consistent facial rigging and animation
        across different models by providing a common reference frame.
        </p>
        <p>
          There is no single Standard Feature Space. Instead we refer to a Standard,
          which may be developed by the community or specific entities.
          By mapping your face to a given Standard, your face complies with its feature space,
          and thus supports being controlled by rigs and animations built for that Standard.
        </p>
        <ol>
          <li>
            Load your face model and a Standard model which you will use as reference.
          </li>
          <li>
            Your face model should already be rigged with the Vizij rigging system.
          </li>
          <li>
            The reference model can be any face that is already rigged to the Standard feature space.
          </li>
          <li>
            Use the reference controls to set features on the reference model.
          </li>
          <li>
            By viewing them side by side, adjust the mapping controls to align your face model so that it matches the reference model's features as close as as possible.
          </li>
          <li>
            Once you are satisfied with the mapping, save the mapping configuration into your Vizij bundle for future use.
          </li>
        </ol>
        <p style={{ marginTop: "1rem" }}>
          <strong>Mapping Editor Status Indicators:</strong>
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ color: "#22c55e" }}>●</span>
            <span><strong>Green</strong> — Track exists and has a binding configured. Ready to use.</span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ color: "#3b82f6" }}>●</span>
            <span><strong>Blue</strong> — Track exists but has no binding. Configure a binding to drive features.</span>
          </li>
          <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#64748b" }}>●</span>
            <span><strong>Gray</strong> — Track is missing in the main face. Create it first.</span>
          </li>
        </ul>
      </div>
    ),
  },
};

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
    error,
    clearError,
    loadFromFile,
    bundle: loadedBundle,
    updateBundle,
  } = loader;

  const [secondFaceFileToLoad, setSecondFaceFileToLoad] = useState<File | null>(null);

  // Reference face state management
  const [refFaceIsLoading, setRefFaceIsLoading] = useState(false);
  const [refFaceIsLoaded, setRefFaceIsLoaded] = useState(false);
  const [refFaceStandardInputs, setRefFaceStandardInputs] = useState<StandardRigInput[]>([]);
  const [refFaceStandardInputsById, setRefFaceStandardInputsById] = useState<Map<string, StandardRigInput>>(new Map());
  const [refFaceInputIdsWithBindings, setRefFaceInputIdsWithBindings] = useState<Set<string>>(new Set());
  const [refFaceInputValues, setRefFaceInputValues] = useState<Record<string, number>>({});
  const refFaceAnimateValueRef = useRef<((path: string, value: number) => void) | undefined>(undefined);
  const mainFaceInputChangeRef = useRef<((inputId: string, value: number) => void) | undefined>(undefined);

  // Reset binding info when file is cleared
  useEffect(() => {
    if (!secondFaceFileToLoad) {
      setRefFaceInputIdsWithBindings(new Set());
    }
  }, [secondFaceFileToLoad]);

  // Handle bundle ready from ReferenceFaceRuntime - extract binding information
  const handleRefFaceBundleReady = useCallback(
    (bundle: VizijBundleExtension | null) => {
      if (!bundle) {
        setRefFaceInputIdsWithBindings(new Set());
        return;
      }
      const bindingInfo = extractBindingsFromBundle(bundle);
      const idsWithBindings = getInputIdsWithBindings(bindingInfo);
      setRefFaceInputIdsWithBindings(idsWithBindings);
    },
    [],
  );

  const handleRefFaceStandardInputsReady = useCallback(
    (inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setRefFaceStandardInputs(inputs);
      setRefFaceStandardInputsById(byId);
      // Initialize input values with defaults
      const initialValues: Record<string, number> = {};
      for (const input of inputs) {
        initialValues[input.id] = input.defaultValue;
      }
      setRefFaceInputValues(initialValues);
    },
    [],
  );

  const handleRefFaceLoadingStateChange = useCallback(
    (isLoading: boolean, isLoaded: boolean) => {
      setRefFaceIsLoading(isLoading);
      setRefFaceIsLoaded(isLoaded);
    },
    [],
  );

  const handleRefFaceAnimateValueReady = useCallback(
    (animateFn: ((path: string, value: number) => void) | undefined) => {
      refFaceAnimateValueRef.current = animateFn;
    },
    [],
  );

  const handleRefFaceInputValueChange = useCallback(
    (inputId: string, value: number) => {
      const input = refFaceStandardInputsById.get(inputId);
      if (!input) {
        console.warn(`[App] Unknown reference face input ID: ${inputId}`);
        return;
      }
      console.warn(`[App] Reference face input change: ${inputId} = ${value}`);
      setRefFaceInputValues((prev) => ({ ...prev, [inputId]: value }));

      // Animate the reference face - this will also trigger onStandardInputChange
      // which propagates to the main face
      const animateFn = refFaceAnimateValueRef.current;
      if (animateFn) {
        animateFn(input.path, value);
      }
    },
    [refFaceStandardInputsById],
  );

  const handleRefFaceResetAllInputValues = useCallback(() => {
    const resetValues: Record<string, number> = {};
    for (const input of refFaceStandardInputs) {
      resetValues[input.id] = input.defaultValue;
      // Animate the reference face - this will also trigger onStandardInputChange
      // which propagates to the main face
      refFaceAnimateValueRef.current?.(input.path, input.defaultValue);
    }
    setRefFaceInputValues(resetValues);
  }, [refFaceStandardInputs]);

  // Handler for when standard input values change on the reference face (from any source)
  // This is called from ReferenceFaceRuntime whenever animateFn is invoked
  const handleRefFaceStandardInputChange = useCallback(
    (inputId: string, value: number) => {
      // Propagate to the main face
      mainFaceInputChangeRef.current?.(inputId, value);
    },
    [],
  );

  const referenceFaceContextValue: ReferenceFaceState = useMemo(
    () => ({
      isLoaded: refFaceIsLoaded,
      isLoading: refFaceIsLoading,
      standardInputs: refFaceStandardInputs,
      standardInputsById: refFaceStandardInputsById,
      inputIdsWithBindings: refFaceInputIdsWithBindings,
      inputValues: refFaceInputValues,
      handleInputValueChange: handleRefFaceInputValueChange,
      handleResetAllInputValues: handleRefFaceResetAllInputValues,
    }),
    [
      refFaceIsLoaded,
      refFaceIsLoading,
      refFaceStandardInputs,
      refFaceStandardInputsById,
      refFaceInputIdsWithBindings,
      refFaceInputValues,
      handleRefFaceInputValueChange,
      handleRefFaceResetAllInputValues,
    ],
  );

  const faceId = useGraphRuntime((state) => state.faceId);
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const graphTimeSeconds = useGraphRuntime((state) => state.graphTimeSeconds);
  const graphFrameRate = useGraphRuntime((state) => state.graphFrameRate);
  const graphPlaybackState = useGraphRuntime(
    (state) => state.graphPlaybackState,
  );
  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const playGraph = useGraphRuntime((state) => state.playGraph);
  const pauseGraph = useGraphRuntime((state) => state.pauseGraph);
  const stopGraph = useGraphRuntime((state) => state.stopGraph);
  const stepGraph = useGraphRuntime((state) => state.stepGraph);
  const discrepancyReview = useGraphRuntime((state) => state.discrepancyReview);
  const resolveDiscrepancyReview = useGraphRuntime(
    (state) => state.resolveDiscrepancyReview,
  );
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);
  const handleClearSelection = useSelectionStore(
    (state) => state.handleClearSelection,
  );
  const handleResetAllInputs = useBindingAuthoring(
    (state) => state.handleResetAllInputValues,
  );
  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );

  // Keep the ref updated so handleRefFaceInputValueChange can access it
  useEffect(() => {
    mainFaceInputChangeRef.current = mainFaceHandleInputValueChange;
  }, [mainFaceHandleInputValueChange]);

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  const { activeWorkbench, activeRiggingTab, skipDiscrepancyCheck } = uiState;
  const { setRiggingTab } = uiActions;

  const poseRig = usePoseRig();

  const { alert: showAlert } = useDialogQueue();

  useEffect(() => {
    uiActions.setIncludeVizijBundle(true);
    const animationCount = loadedBundle?.animations?.length ?? 0;
    uiActions.setIncludeImportedAnimations(animationCount > 0);
  }, [loadedBundle, uiActions]);

  const applyPoseGraphImport = useCallback(
    async (graphSpec: GraphSpec, sourceNameHint: string) => {
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

  const handleWorkbenchChange = useCallback(
    (view: WorkbenchView) => {
      uiActions.setWorkbench(view);
    },
    [uiActions],
  );
  const handleRiggingTabChange = useCallback(
    (tab: RiggingTab) => setRiggingTab(tab),
    [setRiggingTab],
  );
  const showRiggingTabs = activeWorkbench === "scene-composer";

  const guideIdBase = useId();
  const workbenchGuideIds = useMemo(
    () => ({
      "import-export": `${guideIdBase}-import-export`,
      "scene-composer": `${guideIdBase}-scene-composer`,
      "pose-rig": `${guideIdBase}-pose-rig`,
      "std-feature-spaces": `${guideIdBase}-std-feature-spaces`,
    }),
    [guideIdBase],
  );
  const [workbenchGuideOpen, setWorkbenchGuideOpen] = useState<
    Record<WorkbenchView, boolean>
  >({
    "import-export": false,
    "scene-composer": false,
    "pose-rig": false,
    "std-feature-spaces": false,
  });
  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);

  useBundleSynchronizer({
    faceId,
    rootId,
    loadedBundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpec: handleImportGraphSpec,
    importPoseConfigFromData: poseRig.importPoseConfigFromData,
  });

  const canImportGraph = Boolean(rootId) && !isLoading;
  const canExport = canImportGraph;

  const statusMessage = useMemo(() => {
    if (isLoading) {
      return "Loading Vizij…";
    }
    if (error) {
      return `Failed to load Vizij: ${error}`;
    }
    if (rootId) {
      return `Loaded ${sourceName ?? "Vizij"}`;
    }
    return "Load a Vizij GLB to begin.";
  }, [error, isLoading, rootId, sourceName]);

  const activeOption = WORKBENCH_OPTIONS.find(
    (option) => option.id === activeWorkbench,
  );
  const activeGuide = WORKBENCH_GUIDES[activeWorkbench];
  const activeGuideIsOpen = workbenchGuideOpen[activeWorkbench] ?? false;
  const activeGuideContentId = workbenchGuideIds[activeWorkbench];
  const toggleActiveGuide = () => {
    if (!activeGuide) {
      return;
    }
    setWorkbenchGuideOpen((current) => ({
      ...current,
      [activeWorkbench]: !current[activeWorkbench],
    }));
  };

  const viewerElement = (
    <Viewer
      rootId={rootId}
      statusMessage={statusMessage}
      namespace={DEFAULT_NAMESPACE}
      onClearSelection={handleClearSelection}
      graphTimeSeconds={graphTimeSeconds}
      graphFrameRate={graphFrameRate}
      graphPlaybackState={graphPlaybackState}
      graphStatus={graphStatus}
      onPlayGraph={playGraph}
      onPauseGraph={pauseGraph}
      onStopGraph={stopGraph}
      onStepGraph={stepGraph}
      faceId={faceId}
      faceSegment={faceSegment}
      onFaceIdChange={handleFaceIdChange}
      onResetAllInputs={handleResetAllInputs}
    />
  );

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar sidebar--nav">
          <header className="sidebar__topbar">
            <h1 className="sidebar__title">
              Vizij Authoring Tool Pre-Alpha Preview
            </h1>
            <p className="sidebar__description">
              Load a Vizij scene, align the rig graph, tune poses, and export.
            </p>
          </header>

          <WorkbenchNav
            options={WORKBENCH_OPTIONS}
            activeWorkbench={activeWorkbench}
            onSelect={handleWorkbenchChange}
          />
        </aside>

        <div
          className={
            activeWorkbench === "std-feature-spaces"
              ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
              : "viewer-wrapper"
          }
        >
          {viewerElement}
          {activeWorkbench === "std-feature-spaces" && (
            <div className="viewer-split__placeholder">
              <OrchestratorProvider autostart={false}>
                <ReferenceFaceRuntime
                  file={secondFaceFileToLoad}
                  active={true}
                  visible={true}
                  driveOrchestrator={true}
                  onStandardInputsReady={handleRefFaceStandardInputsReady}
                  onLoadingStateChange={handleRefFaceLoadingStateChange}
                  onAnimateValueReady={handleRefFaceAnimateValueReady}
                  onStandardInputChange={handleRefFaceStandardInputChange}
                  onBundleReady={handleRefFaceBundleReady}
                  splitVertical={viewerSplitVertical}
                  onToggleSplit={() => setViewerSplitVertical((v) => !v)}
                />
              </OrchestratorProvider>
            </div>
          )}
        </div>

        <aside className={`sidebar sidebar--right${activeWorkbench === "std-feature-spaces" ? " sidebar--narrow" : ""}`}>
          <div className="workbench-panel__content">
            <div className="workbench-panel__body">
              {activeOption && (
                <header className="workbench-panel__header">
                  {activeGuide ? (
                    <>
                      <button
                        type="button"
                        className="workbench-panel__header-trigger"
                        onClick={toggleActiveGuide}
                        aria-expanded={activeGuideIsOpen}
                        aria-controls={activeGuideContentId}
                      >
                        <div className="workbench-panel__title-group">
                          <h1 className="sidebar__title">
                            {activeOption.label}
                          </h1>
                          <p className="workbench-panel__description">
                            {activeOption.description}
                          </p>
                        </div>
                        <span
                          className="workbench-panel__chevron"
                          aria-hidden="true"
                        >
                          {activeGuideIsOpen ? "▾" : "▸"}
                        </span>
                      </button>
                      <div
                        id={activeGuideContentId}
                        className="workbench-panel__instructions"
                        aria-hidden={!activeGuideIsOpen}
                        style={{ display: activeGuideIsOpen ? "flex" : "none" }}
                        data-open={activeGuideIsOpen ? "true" : undefined}
                      >
                        <p className="workbench-panel__instructions-label">
                          {activeGuide.label}
                        </p>
                        <p className="workbench-panel__instructions-summary">
                          {activeGuide.summary}
                        </p>
                        <div className="workbench-panel__instructions-body">
                          {activeGuide.content}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="workbench-panel__title-group">
                      <h1 className="sidebar__title">{activeOption.label}</h1>
                      <p className="workbench-panel__description">
                        {activeOption.description}
                      </p>
                    </div>
                  )}
                </header>
              )}

              {activeWorkbench === "import-export" && (
                <ImportExportWorkbench
                  isLoading={isLoading}
                  error={error}
                  loadFromFile={loadFromFile}
                  onClearError={clearError}
                  canImportGraph={canImportGraph}
                  canExport={canExport}
                  onImportPoseGraph={handleImportPoseGraphFile}
                  rootId={rootId}
                  sourceName={sourceName}
                  loadedBundle={loadedBundle}
                  updateBundle={updateBundle}
                />
              )}

              {showRiggingTabs && (
                <RiggingTabs
                  activeTab={activeRiggingTab}
                  onSelect={handleRiggingTabChange}
                />
              )}

              {activeWorkbench === "scene-composer" &&
                activeRiggingTab === "rigging" && <SceneComposerWorkbench />}

              {activeWorkbench === "scene-composer" &&
                activeRiggingTab === "face" && (
                  <SceneRiggingSection
                    showCoverage={false}
                    showMissingList={false}
                    allowEditActions={false}
                    allowNodeActions
                    showMaterials
                    showDrivers={false}
                    showBindings={false}
                    showFeatures
                    hiddenMode="none"
                    showHideControls={false}
                  />
                )}

              {activeWorkbench === "pose-rig" && (
                <Panel className="sidebar__panel--pose">
                  <PoseRigWorkbench
                    onImportPoseGraph={handleImportPoseGraphFile}
                  />
                </Panel>
              )}

              {activeWorkbench === "std-feature-spaces" && (
                <ReferenceFaceProvider value={referenceFaceContextValue}>
                  <StdFeatureSpacesEditor
                    onSelectFile={setSecondFaceFileToLoad}
                  />
                </ReferenceFaceProvider>
              )}
            </div>
          </div>
        </aside>
      </div>

      {discrepancyReview ? (
        <DiscrepancyWizard
          key={discrepancyReview.id}
          state={discrepancyReview}
          onResolve={resolveDiscrepancyReview}
        />
      ) : null}
      {poseGraphRemap ? (
        <PoseGraphRemapWizard
          autoRows={poseGraphRemap.autoRows}
          rows={poseGraphRemap.reviewRows}
          standardInputs={standardInputs}
          onApply={handlePoseGraphRemapApply}
          onCancel={handlePoseGraphRemapCancel}
        />
      ) : null}
    </>
  );
}

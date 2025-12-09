import { useCallback, useEffect, useMemo, useState, useId } from "react";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { useDialogQueue } from "@vizij/authoring-shared";
import { ImportExportWorkbench } from "./components/app/ImportExportWorkbench";
import { Viewer } from "./components/app/Viewer";
import { WorkbenchNav } from "./components/app/WorkbenchNav";
import { SceneComposerWorkbench } from "./components/scene-composer";
import { PoseRigWorkbench } from "./poseRig/components";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
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
import { Panel } from "./components/ui";
import { RiggingTabs } from "./components/app/RiggingTabs";
import { SceneRiggingSection } from "./components/scene-composer/SceneRiggingSection";

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
  "std-face-mapper": {
    label: "Standard Face Mapping workflow",
    summary: "Map your face to a standard feature space",
    content: (
      <div>
        <p>
        The Standard Face Mapper allows you to align your face to predefined
        feature spaces. This enables consistent facial rigging and animation
        across different models by providing a common reference frame.
        </p>
        <p>
          There is no single Standard feature space. Instead we refer to A Standard,
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

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  const { activeWorkbench, activeRiggingTab } = uiState;
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
      "std-face-mapper": `${guideIdBase}-std-face-mapper`,
    }),
    [guideIdBase],
  );
  const [workbenchGuideOpen, setWorkbenchGuideOpen] = useState<
    Record<WorkbenchView, boolean>
  >({
    "import-export": false,
    "scene-composer": false,
    "pose-rig": false,
    "std-face-mapper": false,
  });
  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);

  useBundleSynchronizer({
    faceId,
    rootId,
    loadedBundle,
    standardInputCount,
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

        {activeWorkbench === "std-face-mapper" ? (
          <div
            className={`viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`}
          >
            {viewerElement}
            <div className="viewer-split__placeholder">
              <button
                type="button"
                className="viewer-split__toggle"
                title={viewerSplitVertical ? "Switch to horizontal split" : "Switch to vertical split"}
                onClick={() => setViewerSplitVertical((v) => !v)}
              >
                {viewerSplitVertical ? "⬌" : "⬍"}
              </button>
              Placeholder
            </div>
          </div>
        ) : (
          viewerElement
        )}

        <aside className="sidebar sidebar--right">
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

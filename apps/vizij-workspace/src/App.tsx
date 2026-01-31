import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useId,
  useRef,
} from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle
} from "react-resizable-panels";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { useDialogQueue } from "@vizij/authoring-shared";
import { OrchestratorProvider } from "@vizij/orchestrator-react";
import type { VizijBundleExtension } from "@vizij/render";
import { loadGLTFFromBlobWithBundle } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { Tabs, type TabItem } from "./components/ui/Tabs";

import { useWorkspaceStore } from "./state/workspaceStore";
import { MenuBar, Menu, MenuItem, MenuSeparator, MenuCheckboxItem, MenuLabel } from "./components/ui/MenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { TreePanel } from "./components/panels/TreePanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import { StudioPanel } from "./components/ui/StudioPanel";
import { Chip, Switch, Button } from "./components/ui"; // Importing UI components for Inspector

import { Viewer } from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ExportDialog } from "./components/app/ExportDialog";
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
import { StdFeatureSpacesEditor } from "./components/app/StdFeatureSpacesEditor";
import { ReferenceFaceRuntime } from "./components/app/ReferenceFaceRuntime";
import {
  ReferenceFaceProvider,
  type ReferenceFaceState,
} from "./state/ReferenceFaceContext";
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
          The Standard Feature Spaces Editor allows you to align your face to
          predefined feature spaces. This enables consistent facial rigging and
          animation across different models by providing a common reference
          frame.
        </p>
        <p>
          There is no single Standard Feature Space. Instead we refer to a
          Standard, which may be developed by the community or specific
          entities. By mapping your face to a given Standard, your face complies
          with its feature space, and thus supports being controlled by rigs and
          animations built for that Standard.
        </p>
        <ol>
          <li>
            Load your face model and a Standard model which you will use as
            reference.
          </li>
          <li>
            Your face model should already be rigged with the Vizij rigging
            system.
          </li>
          <li>
            The reference model can be any face that is already rigged to the
            Standard feature space.
          </li>
          <li>
            Use the reference controls to set features on the reference model.
          </li>
          <li>
            By viewing them side by side, adjust the mapping controls to align
            your face model so that it matches the reference model's features as
            close as as possible.
          </li>
          <li>
            Once you are satisfied with the mapping, save the mapping
            configuration into your Vizij bundle for future use.
          </li>
        </ol>
        <p className="mt-4 font-bold text-slate-200">
          Mapping Editor Status Indicators:
        </p>
        <ul className="mt-2 space-y-1">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-slate-300">
              <strong className="text-slate-200">Green</strong> — Track exists and has a binding
              configured. Ready to use.
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-slate-300">
              <strong className="text-slate-200">Blue</strong> — Track exists but has no binding. Configure
              a binding to drive features.
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-slate-300">
              <strong className="text-slate-200">Gray</strong> — Track is missing in the main face. Create
              it first.
            </span>
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

  const [secondFaceFileToLoad, setSecondFaceFileToLoad] = useState<File | null>(
    null,
  );

  // Highlighting State (moved from Viewer)
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);

  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleLoadAssetFromUrl = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url} `);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: 'model/gltf-binary' });

      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true)
      );
    } catch (err) {
      console.error("Failed to load asset from URL:", err);
    }
  }, [loadFromFile]);

  const handleLoadQuori = useCallback(() => {
    handleLoadAssetFromUrl("/assets/Quori_Latest_Rigged.glb", "Quori_Latest_Rigged.glb");
  }, [handleLoadAssetFromUrl]);

  const handleLoadHugo = useCallback(() => {
    handleLoadAssetFromUrl("/assets/Hugo_Latest_Rigged.glb", "Hugo_Latest_Rigged.glb");
  }, [handleLoadAssetFromUrl]);

  // Reference face state management
  const [refFaceIsLoading, setRefFaceIsLoading] = useState(false);
  const [refFaceIsLoaded, setRefFaceIsLoaded] = useState(false);
  const [refFaceStandardInputs, setRefFaceStandardInputs] = useState<
    StandardRigInput[]
  >([]);
  const [refFaceStandardInputsById, setRefFaceStandardInputsById] = useState<
    Map<string, StandardRigInput>
  >(new Map());
  const [refFaceInputIdsWithBindings, setRefFaceInputIdsWithBindings] =
    useState<Set<string>>(new Set());
  const [refFaceInputValues, setRefFaceInputValues] = useState<
    Record<string, number>
  >({});
  const refFaceAnimateValueRef = useRef<
    ((path: string, value: number) => void) | undefined
  >(undefined);
  const mainFaceInputChangeRef = useRef<
    ((inputId: string, value: number) => void) | undefined
  >(undefined);

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
        console.warn(`[App] Unknown reference face input ID: ${inputId} `);
        return;
      }
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
      isPlaying: false,
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

  // Graph Runtime Hook
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
  const setFaceId = useGraphRuntime((state) => state.handleFaceIdChange);
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
      "import-export": `${guideIdBase} -import -export `,
      "scene-composer": `${guideIdBase} - scene - composer`,
      "pose-rig": `${guideIdBase} - pose - rig`,
      "std-feature-spaces": `${guideIdBase} - std - feature - spaces`,
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
      return `Failed to load Vizij: ${error} `;
    }
    if (rootId) {
      return `Loaded ${sourceName ?? "Vizij"} `;
    }
    return "Load a Vizij GLB to begin.";
  }, [error, isLoading, rootId, sourceName]);

  const activeOption = WORKBENCH_OPTIONS.find(
    (option) => option.id === activeWorkbench,
  );
  const activeGuide = activeOption ? WORKBENCH_GUIDES[activeOption.id] : null;
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

  const {
    panels,
    togglePanel,
    setPanelVisibility
  } = useWorkspaceStore();

  // File Import Logic
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipNextDiscrepancyCheck = useRef(false);

  const handleNewClick = useCallback(() => {
    loader.reset();
  }, [loader]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (skipNextDiscrepancyCheck.current) {
      uiActions.setSkipDiscrepancyCheck(true);
      skipNextDiscrepancyCheck.current = false;
    } else {
      uiActions.setSkipDiscrepancyCheck(false);
    }

    await loadFromFile(file, () =>
      loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true)
    );
    // Switch to scene-composer after load to view it? Or stick to current view.
    // If not in a useful view, maybe switch.
    // Let's reset the input value so the same file handles change event again if needed.
    event.target.value = '';
  }, [loadFromFile, uiActions]);

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = false;
    fileInputRef.current?.click();
  }, []);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = true;
    fileInputRef.current?.click();
  }, []);

  const menuBar = (
    <MenuBar>
      <Menu label="File">
        <MenuItem onSelect={handleNewClick}>New</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={handleImportClick}>Import...</MenuItem>
        <MenuItem onSelect={handleImportSkipChecksClick}>Import (Skip Checks)...</MenuItem>
        <MenuItem onSelect={() => setShowExportDialog(true)}>Export...</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => { }} disabled>Save</MenuItem>
        <MenuItem onSelect={() => { }} disabled>Save As...</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => { }}>Exit</MenuItem>
      </Menu>
      <Menu label="Edit">
        <MenuItem>Undo</MenuItem>
        <MenuItem>Redo</MenuItem>
      </Menu>
      <Menu label="View">
        <MenuLabel>Left Panel</MenuLabel>
        <MenuCheckboxItem checked={panels.tree.isVisible} onCheckedChange={() => togglePanel("tree")}>
          Explorer
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={panels.hierarchy.isVisible} onCheckedChange={() => togglePanel("hierarchy")}>
          Hierarchy
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={panels.variables.isVisible} onCheckedChange={() => togglePanel("variables")}>
          Variables
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Center Panel</MenuLabel>
        <MenuCheckboxItem checked={panels.animation.isVisible} onCheckedChange={() => togglePanel("animation")}>
          Timeline
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Right Panel</MenuLabel>
        <MenuCheckboxItem checked={panels.inspector.isVisible} onCheckedChange={() => togglePanel("inspector")}>
          Inspector
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={panels.debug.isVisible} onCheckedChange={() => togglePanel("debug")}>
          Debug
        </MenuCheckboxItem>
      </Menu>
    </MenuBar>
  );

  const viewerContent = (
    <div
      className={
        activeWorkbench === "std-feature-spaces"
          ? `viewer - split ${viewerSplitVertical ? "viewer-split--vertical" : ""} `
          : "viewer-wrapper"
      }
      style={{ height: '100%', width: '100%' }}
    >
      <Viewer
        rootId={rootId}
        namespace={DEFAULT_NAMESPACE}
        onClearSelection={handleClearSelection}
        showSelectionGlow={showSelectionGlow} // Updated Prop
        onImportClick={handleImportClick}
        onLoadQuori={handleLoadQuori}
        onLoadHugo={handleLoadHugo}
      />
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
  );

  const workbenchTabs: TabItem[] = useMemo(() => [
    { id: "scene-composer", label: "Rigging" },
    { id: "pose-rig", label: "Posing" },
    { id: "std-feature-spaces", label: "Standards" },
  ], []);

  const renderWorkbenchTab = useCallback((id: string) => {
    switch (id) {
      case "scene-composer":
        return (
          <div className="flex flex-col gap-4 p-4 h-full">
            {showRiggingTabs && (
              <RiggingTabs
                activeTab={activeRiggingTab}
                onSelect={handleRiggingTabChange}
              />
            )}
            {activeRiggingTab === "rigging" && <SceneComposerWorkbench />}
            {activeRiggingTab === "face" && (
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
          </div>
        );
      case "pose-rig":
        return (
          <div className="sidebar__panel--pose p-4 h-full">
            <PoseRigWorkbench onImportPoseGraph={handleImportPoseGraphFile} />
          </div>
        );
      case "std-feature-spaces":
        return (
          <ReferenceFaceProvider value={referenceFaceContextValue}>
            <div className="p-4 h-full">
              <StdFeatureSpacesEditor onSelectFile={setSecondFaceFileToLoad} />
            </div>
          </ReferenceFaceProvider>
        );
      default:
        return null;
    }
  }, [showRiggingTabs, activeRiggingTab, handleRiggingTabChange, handleImportPoseGraphFile, referenceFaceContextValue, setSecondFaceFileToLoad]);

  return (
    <>
      <WorkspaceLayout
        menuBar={menuBar}
        // Left
        leftTopVisible={panels.hierarchy.isVisible}
        leftTopPanel={
          <HierarchyPanel
            showSelectionGlow={showSelectionGlow}
            onToggleSelectionGlow={setShowSelectionGlow}
          />
        }
        leftBottomVisible={panels.variables.isVisible}
        leftBottomPanel={
          <VariablesPanel />
        }

        // Center
        topPanel={
          <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-slate-900/50">
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Select</Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Move</Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Rotate</Button>
            <div className="ml-auto flex items-center gap-4 text-slate-500 font-medium tracking-wide uppercase text-[10px]">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />Grid: On</span>
              <span className="w-px h-3 bg-slate-800" />
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500/50" />Snap: Off</span>
            </div>
          </div>
        }
        viewport={viewerContent}
        bottomVisible={panels.animation.isVisible}
        bottomPanel={<AnimationPanel />}

        // Right
        rightTopVisible={panels.inspector.isVisible}
        rightTopPanel={
          <Tabs
            items={workbenchTabs}
            value={activeWorkbench}
            onValueChange={(v) => handleWorkbenchChange(v as WorkbenchView)}
            renderPanel={renderWorkbenchTab}
            className="h-full flex flex-col"
            panelClassName="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
            listClassName="px-4 pt-2"
          />
        }
        rightBottomVisible={panels.debug.isVisible}
        rightBottomPanel={<DebugPanel
          rootId={loader.rootId}
          sourceName={loader.sourceName}
          loadedBundle={loader.bundle}
          updateBundle={loader.updateBundle}
          isLoading={loader.isLoading}
          error={loader.error}
        />}

      />

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
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        rootId={rootId}
        sourceName={sourceName}
        loadedBundle={loadedBundle}
        canExport={canExport}
        onImportPoseGraph={handleImportPoseGraphFile}
      />

      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".glb,.gltf"
        onChange={(e) => void handleFileChange(e)}
      />
    </>
  );
}

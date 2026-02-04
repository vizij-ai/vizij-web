import { useCallback, useEffect, useState, useRef } from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { loadGLTFFromBlobWithBundle } from "@vizij/render";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { useWorkspaceStore } from "./state/workspaceStore";
import { AppMenuBar } from "./components/app/AppMenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import { Viewer } from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { MaterialsPanel } from "./components/panels/MaterialsPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { ExportDialog } from "./components/app/ExportDialog";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
import { AppWizards } from "./components/app/AppWizards";
import {
  type StandardRigInput,
} from "@vizij/utils";
import type { VizijBundleExtension } from "@vizij/render";
import {
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "./utils/standardInputBindings";
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
import { ReferenceFaceProvider } from "./state/ReferenceFaceContext";
import { useReferenceFaceState } from "./hooks/useReferenceFaceState";
import { useUnifiedSelection } from "./hooks/useUnifiedSelection";

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

  // Reference Face State
  const [refFaceStandardInputs, setRefFaceStandardInputs] = useState<StandardRigInput[]>([]);
  const [refFaceStandardInputsById, setRefFaceStandardInputsById] = useState<Map<string, StandardRigInput>>(new Map());
  const [refFaceIsLoading, setRefFaceIsLoading] = useState(false);
  const [refFaceIsLoaded, setRefFaceIsLoaded] = useState(false);
  const [refFaceInputIdsWithBindings, setRefFaceInputIdsWithBindings] = useState<Set<string>>(new Set());
  const [refFaceInputValues, setRefFaceInputValues] = useState<Record<string, number>>({});
  const refFaceAnimateValueRef = useRef<((path: string, value: number) => void) | undefined>(undefined);

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

  const referenceFaceContextValue = useReferenceFaceState(
    mainFaceHandleInputValueChange,
  );

  // Graph Runtime Hook
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const discrepancyReview = useGraphRuntime((state) => state.discrepancyReview);
  const resolveDiscrepancyReview = useGraphRuntime(
    (state) => state.resolveDiscrepancyReview,
  );

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

  const {
    selectedRigId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    handleClearSelection,
  } = useUnifiedSelection();

  const menuBar = (
    <AppMenuBar
      onNew={handleNewClick}
      onImport={handleImportClick}
      onImportSkipChecks={handleImportSkipChecksClick}
      onImportReferenceFace={handleImportReferenceFaceClick}
      onExport={() => setShowExportDialog(true)}
    />
  );

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
        leftBottomVisible={panels.variables.isVisible}
        leftBottomPanel={
          <VariablesPanel
            selectedRigId={selectedRigId}
            onSelectRig={handleSelectRig}
            onSelectPose={handleSelectPose}
          />
        }
        leftMiddleVisible={panels.materials.isVisible}
        leftMiddlePanel={<MaterialsPanel />}
        // Center
        topPanel={
          <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-bg-panel/50 border-b border-border-default"></div>
        }
        viewport={viewerContent}
        bottomVisible={panels.animation.isVisible}
        bottomPanel={<AnimationPanel />}
        // Right
        rightTopVisible={panels.inspector.isVisible}
        rightTopPanel={<InspectorPanel />}
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

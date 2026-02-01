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
import type { VizijBundleExtension } from "@vizij/render";
import { loadGLTFFromBlobWithBundle } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { useWorkspaceStore } from "./state/workspaceStore";
import { MenuBar, Menu, MenuItem, MenuSeparator, MenuCheckboxItem, MenuLabel } from "./components/ui/MenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { TreePanel } from "./components/panels/TreePanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import { Viewer } from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { ExportDialog } from "./components/app/ExportDialog";
import { PoseRigWorkbench } from "./poseRig/components";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
import {
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
} from "./state/AuthoringUiProvider";
import { PoseRigProvider, usePoseRig } from "./state/PoseRigProvider";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { ReferenceFaceRuntime } from "./components/app/ReferenceFaceRuntime";
import { ReferenceFaceProvider } from "./state/ReferenceFaceContext";
import { useReferenceFaceState } from "./hooks/useReferenceFaceState";



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
    error,
    loadFromFile,
    bundle: loadedBundle,
  } = loader;




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
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );

  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);

  const canExport = Boolean(rootId) && !isLoading;



  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);
  const handleClearSelection = useSelectionStore(
    (state) => state.handleClearSelection,
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


  const {
    panels,
    togglePanel,
    setPanelVisibility
  } = useWorkspaceStore();

  // Reference Face Import
  const refFaceFileInputRef = useRef<HTMLInputElement>(null);
  const handleRefFaceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      referenceFaceContextValue.setFile(file);
      event.target.value = "";
    },
    [referenceFaceContextValue]
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
        <MenuItem onSelect={handleImportReferenceFaceClick}>Import Reference Face...</MenuItem>
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
        <MenuCheckboxItem checked={panels.referenceFace.isVisible} onCheckedChange={() => togglePanel("referenceFace")}>
          Reference Face
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
          ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
          : "viewer-wrapper relative w-full h-full"
      }
      style={{ height: '100%', width: '100%' }}
    >
      {panels.referenceFace.isVisible ? (
        <PanelGroup orientation={viewerSplitVertical ? "horizontal" : "vertical"}>
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
          <PanelResizeHandle className={viewerSplitVertical ? "w-1 bg-slate-800 hover:bg-blue-500 transition-colors" : "h-1 bg-slate-800 hover:bg-blue-500 transition-colors"} />
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
      {/* activeWorkbench === "std-feature-spaces" logic replaced by ReferenceFacePanel */}

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



  // Inspector Logic 
  const selectedRigId = useBindingAuthoring((state) => state.selectedRigId);
  const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);
  const selectedId = useSelectionStore((state) => state.selectionStack[0]?.id);
  const { selectedPoseId, selectPose } = poseRig;

  // Derived Inspector Mode
  const inspectorMode = useMemo(() => {
    if (selectedId) return "scene";
    if (selectedPoseId) return "pose";
    if (selectedRigId) return "rig";
    return "default";
  }, [selectedId, selectedPoseId, selectedRigId]);

  // Unified Selection Clearing Effect (Mutual Exclusivity)
  // This ensures that only one type of item is selected at a time across different systems.
  useEffect(() => {
    // If scene object is selected, clear variables
    if (selectedId) {
      if (selectedPoseId) selectPose("");
      if (selectedRigId) handleSelectRig(null);
    }
  }, [selectedId, selectedPoseId, selectedRigId, selectPose, handleSelectRig]);

  useEffect(() => {
    // If pose is selected, clear scene and rig
    if (selectedPoseId) {
      if (selectedId) handleClearSelection();
      if (selectedRigId) handleSelectRig(null);
    }
  }, [selectedPoseId, selectedId, selectedRigId, handleClearSelection, handleSelectRig]);

  useEffect(() => {
    // If rig is selected, clear scene and pose
    if (selectedRigId) {
      if (selectedId) handleClearSelection();
      if (selectedPoseId) selectPose("");
    }
  }, [selectedRigId, selectedId, selectedPoseId, handleClearSelection, selectPose]);

  // Variables Panel Props
  const handleSelectRigAction = useCallback((id: string | null) => {
    handleSelectRig(id);
  }, [handleSelectRig]);


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
          />
        }
        leftBottomVisible={panels.variables.isVisible}
        leftBottomPanel={
          <VariablesPanel
            selectedRigId={selectedRigId}
            onSelectRig={handleSelectRigAction}
          />
        }

        // Center
        topPanel={
          <div className="h-full flex items-center px-4 gap-1 text-xs select-none bg-slate-900/50">
            {/* <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Select</Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Move</Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 font-normal">Rotate</Button>
            <div className="ml-auto flex items-center gap-4 text-slate-500 font-medium tracking-wide uppercase text-[10px]">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />Grid: On</span>
              <span className="w-px h-3 bg-slate-800" />
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500/50" />Snap: Off</span>
            </div> */}
          </div>
        }
        viewport={viewerContent}
        bottomVisible={panels.animation.isVisible}
        bottomPanel={<AnimationPanel />}

        // Right
        rightTopVisible={panels.inspector.isVisible}
        rightTopPanel={<InspectorPanel />}
        rightBottomVisible={panels.debug.isVisible}
        rightBottomPanel={<DebugPanel
          rootId={loader.rootId}
          loadedBundle={loader.bundle}
          updateBundle={loader.updateBundle}
          isLoading={loader.isLoading}
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
    </ReferenceFaceProvider>
  );
}

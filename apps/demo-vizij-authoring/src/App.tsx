import { useCallback, useMemo, useState } from "react";
import {
  loadGLTF,
  loadGLTFFromBlob,
  exportScene,
  useVizijStore,
  type Group,
} from "@vizij/render";
import { AnimatableValuesPanel } from "./components/AnimatableValuesPanel";
import { AssetLoaderPanel } from "./components/app/AssetLoaderPanel";
import { ExportPanel } from "./components/app/ExportPanel";
import { Viewer } from "./components/app/Viewer";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { useRigController } from "./hooks/useRigController";
import { waitForNextFrame } from "./utils/frame";
import { downloadBlob } from "./utils/download";
import { applyDefaultsToRobotData } from "./utils/robotData";
import { buildRigGraphSpec } from "./rig/graphBuilder";
import { alertDialog } from "./utils/dialogs";

export default function App() {
  const [graphFileName, setGraphFileName] = useState("vizij-export.graph.json");
  const [exportFileName, setExportFileName] = useState("vizij-export.glb");

  const {
    rootId,
    sourceName,
    assetUrl,
    setAssetUrl,
    isLoading,
    error,
    clearError,
    loadFromFile,
    loadFromUrl,
  } = useVizijAssetLoader();

  const {
    faceId,
    handleFaceIdChange,
    graphStatus,
    graphError,
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
    standardInputs,
    standardInputsById,
    inputValues,
    bindings,
    animatableComponents,
    selectionStack,
    handleInputValueChange,
    handleBindingInputChange,
    handleBindingRemapChange,
    handleResetBinding,
    handleToggleStandardInput,
    handleCreateCustomStandardInput,
    handleUpdateStandardInput,
    handleDeleteCustomStandardInput,
    handleSelectStandardInputRoots,
    handleFocusSelectionIndex,
    handleClearSelection,
    setStoreState,
    collectAnimatableExportState,
    world,
    animatables,
    values,
  } = useRigController({
    namespace: DEFAULT_NAMESPACE,
    rootId,
    sourceName,
  });

  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );

  const rootRenderable = rootId
    ? (world[rootId] as Group | undefined)
    : undefined;

  const handleSelectFile = useCallback(
    async (file: File) => {
      await loadFromFile(file, () =>
        loadGLTFFromBlob(file, [DEFAULT_NAMESPACE], true),
      );
    },
    [loadFromFile],
  );

  const handleLoadFromUrl = useCallback(async () => {
    const trimmed = assetUrl.trim();
    if (!trimmed) {
      return;
    }
    await loadFromUrl(trimmed, () =>
      loadGLTF(trimmed, [DEFAULT_NAMESPACE], true),
    );
  }, [assetUrl, loadFromUrl]);

  const handleExportGraph = useCallback(() => {
    const trimmedName = graphFileName.trim();
    const desiredName =
      trimmedName.length > 0 ? trimmedName : "vizij-export.graph.json";
    const fileName = desiredName.toLowerCase().endsWith(".json")
      ? desiredName
      : `${desiredName}.json`;

    const { effectiveAnimatables } = collectAnimatableExportState();

    const graphResult = buildRigGraphSpec({
      faceId,
      animatables: effectiveAnimatables,
      components: animatableComponents,
      bindings,
      inputsById: standardInputsById,
    });

    const baseName = fileName.replace(/\.json$/i, "");
    const base = baseName.length > 0 ? baseName : "vizij-export.graph";
    const specFileName = `${base}.json`;
    const summaryFileName = `${base}.summary.json`;

    const graphBlob = new Blob([JSON.stringify(graphResult.spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(graphBlob, specFileName);

    const summaryBlob = new Blob(
      [JSON.stringify(graphResult.summary, null, 2)],
      {
        type: "application/json",
      },
    );
    downloadBlob(summaryBlob, summaryFileName);
  }, [
    animatableComponents,
    bindings,
    collectAnimatableExportState,
    faceId,
    graphFileName,
    standardInputsById,
  ]);

  const handleExportGlb = useCallback(async () => {
    const trimmedName = exportFileName.trim();
    const desiredName =
      trimmedName.length > 0 ? trimmedName : "vizij-export.glb";
    const downloadName = desiredName.toLowerCase().endsWith(".glb")
      ? desiredName
      : `${desiredName}.glb`;

    const originalAnimatables = animatables;
    const originalValues = values;
    const {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables,
    } = collectAnimatableExportState();

    if (appliedOverrides) {
      setStoreState((prev) => ({
        ...prev,
        animatables: nextAnimatables,
        values: nextValues,
      }));
    }

    await waitForNextFrame();

    const bodies = getExportableBodies(rootId ? [rootId] : undefined);
    if (!bodies.length) {
      alertDialog("Load a Vizij asset before exporting.");
      if (appliedOverrides) {
        setStoreState((prev) => ({
          ...prev,
          animatables: originalAnimatables,
          values: originalValues,
        }));
      }
      return;
    }

    applyDefaultsToRobotData(bodies, effectiveAnimatables);

    exportScene(bodies[0], downloadName);

    if (appliedOverrides) {
      setStoreState((prev) => ({
        ...prev,
        animatables: originalAnimatables,
        values: originalValues,
      }));
    }
  }, [
    animatables,
    collectAnimatableExportState,
    exportFileName,
    getExportableBodies,
    rootId,
    setStoreState,
    values,
  ]);

  const canExport = Boolean(rootId) && !isLoading;

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>Vizij Renderer</h1>
          <p>Load a Vizij GLB, explore its structure, and export it again.</p>
        </header>

        <AssetLoaderPanel
          assetUrl={assetUrl}
          isLoading={isLoading}
          error={error}
          onAssetUrlChange={setAssetUrl}
          onLoadFromUrl={handleLoadFromUrl}
          onSelectFile={handleSelectFile}
          onClearError={clearError}
        />

        <ExportPanel
          graphFileName={graphFileName}
          onGraphFileNameChange={setGraphFileName}
          exportFileName={exportFileName}
          onExportFileNameChange={setExportFileName}
          canExport={canExport}
          onExportGraph={handleExportGraph}
          onExportGlb={() => {
            void handleExportGlb();
          }}
        />
      </aside>

      <Viewer
        rootId={rootId}
        rootRenderable={rootRenderable}
        sourceName={sourceName}
        statusMessage={statusMessage}
        namespace={DEFAULT_NAMESPACE}
        onClearSelection={handleClearSelection}
      />

      <aside className="sidebar sidebar--right">
        <AnimatableValuesPanel
          namespace={DEFAULT_NAMESPACE}
          faceId={faceId}
          onFaceIdChange={handleFaceIdChange}
          graphStatus={graphStatus}
          graphError={graphError}
          selectionStack={selectionStack}
          onFocusSelectionIndex={handleFocusSelectionIndex}
          onClearSelection={handleClearSelection}
          components={animatableComponents}
          bindings={bindings}
          onBindingInputChange={handleBindingInputChange}
          onBindingRemapChange={handleBindingRemapChange}
          onResetBinding={handleResetBinding}
          inputValues={inputValues}
          onInputValueChange={handleInputValueChange}
          managedStandardInputs={managedStandardInputs}
          standardInputs={standardInputs}
          standardInputRoots={standardInputRoots}
          selectedStandardInputRoots={selectedStandardInputRoots}
          onSelectedStandardInputRootsChange={handleSelectStandardInputRoots}
          onToggleStandardInput={handleToggleStandardInput}
          onCreateCustomStandardInput={handleCreateCustomStandardInput}
          onUpdateStandardInput={handleUpdateStandardInput}
          onDeleteCustomStandardInput={handleDeleteCustomStandardInput}
        />
      </aside>
    </div>
  );
}

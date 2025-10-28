import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { GraphImportPanel } from "./components/app/GraphImportPanel";
import { PoseRigImportExportPanel } from "./components/app/PoseRigImportExportPanel";
import { Viewer } from "./components/app/Viewer";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import { useRigController } from "./hooks/useRigController";
import { usePoseRigAuthoring } from "./poseRig/usePoseRigAuthoring";
import { waitForNextFrame } from "./utils/frame";
import { downloadBlob } from "./utils/download";
import { applyDefaultsToRobotData } from "./utils/robotData";
import { buildRigGraphSpec } from "./rig/graphBuilder";
import { alertDialog } from "./utils/dialogs";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";

function faceSlug(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "vizij";
  }
  return trimmed.replace(/\s+/g, "_");
}

export default function App() {
  const [graphFileName, setGraphFileName] = useState("");
  const [exportFileName, setExportFileName] = useState("");
  const graphFileTouchedRef = useRef(false);
  const exportFileTouchedRef = useRef(false);
  const prevFaceIdRef = useRef<string | null>(null);

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
    bindingIssues,
    featureLabelOverrides,
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    standardInputs,
    standardInputsById,
    inputValues,
    bindings,
    inputBindings,
    animatableComponents,
    selectionStack,
    handleInputValueChange,
    applyStandardInputBatch,
    handleResetAllInputValues,
    handleClearCachedState,
    handleBindingInputChange,
    handleBindingRemapChange,
    handleResetBinding,
    handleCreateCustomStandardInput,
    handleRenameGroup,
    handleLinkChildInput,
    handleUnlinkChildInput,
    handleUpdateStandardInput,
    handleDeleteCustomStandardInput,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleEnsureParentBinding,
    handleParentBindingInputChange,
    handleParentBindingRemapChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentResetBinding,
    handleUpdateFeatureLabel,
    handleSelectStandardInputRoots,
    handleSelectStandardInputSubgroups,
    handleFocusSelectionIndex,
    handleClearSelection,
    setStoreState,
    collectAnimatableExportState,
    handleImportGraphSpec,
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

  const poseRig = usePoseRigAuthoring({
    faceId,
    rootId,
    standardInputs,
    inputValues,
    onInputValueChange: handleInputValueChange,
    applyInputBatch: applyStandardInputBatch,
  });

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

  useEffect(() => {
    const slug = faceSlug(faceId);
    const defaultGraphName = `${slug}_rig.json`;
    const defaultGlbName = `${slug}_vizij.glb`;

    if (prevFaceIdRef.current !== faceId) {
      prevFaceIdRef.current = faceId;
      graphFileTouchedRef.current = false;
      exportFileTouchedRef.current = false;
    }

    if (!graphFileTouchedRef.current && graphFileName !== defaultGraphName) {
      setGraphFileName(defaultGraphName);
    }
    if (!exportFileTouchedRef.current && exportFileName !== defaultGlbName) {
      setExportFileName(defaultGlbName);
    }
  }, [faceId, graphFileName, exportFileName]);

  const handleGraphFileNameChange = useCallback((value: string) => {
    graphFileTouchedRef.current = true;
    setGraphFileName(value);
  }, []);

  const handleExportFileNameChange = useCallback((value: string) => {
    exportFileTouchedRef.current = true;
    setExportFileName(value);
  }, []);

  const handleImportGraphFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const normalised = await normalizeGraphSpec(parsed);
        await handleImportGraphSpec(normalised);
      } catch (error) {
        alertDialog(
          `Failed to import rig graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [handleImportGraphSpec],
  );

  const handleExportGraph = useCallback(() => {
    const trimmedName = graphFileName.trim();
    const slug = faceSlug(faceId);
    const desiredName =
      trimmedName.length > 0 ? trimmedName : `${slug}_rig.json`;
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
      inputBindings,
    });

    const baseName = fileName.replace(/\.json$/i, "");
    const base = baseName.length > 0 ? baseName : `${slug}_rig`;
    const specFileName = `${base}.json`;

    const graphBlob = new Blob([JSON.stringify(graphResult.spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(graphBlob, specFileName);
  }, [
    animatableComponents,
    bindings,
    collectAnimatableExportState,
    inputBindings,
    faceId,
    graphFileName,
    standardInputsById,
  ]);

  const handleExportGlb = useCallback(async () => {
    const trimmedName = exportFileName.trim();
    const slug = faceSlug(faceId);
    const desiredName =
      trimmedName.length > 0 ? trimmedName : `${slug}_vizij.glb`;
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

    applyDefaultsToRobotData(
      bodies,
      effectiveAnimatables,
      featureLabelOverrides,
    );

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
    featureLabelOverrides,
    rootId,
    setStoreState,
    values,
  ]);

  const handleExportPoseGraphFile = useCallback(() => {
    const spec = poseRig.poseGraphSpec;
    if (!spec) {
      alertDialog("Build the pose rig graph before exporting.");
      return;
    }
    const trimmed = poseRig.poseGraphFileName.trim();
    const fileName =
      trimmed.length > 0 ? trimmed : `${faceSlug(faceId)}_pose_graph.json`;
    const normalized = fileName.toLowerCase().endsWith(".json")
      ? fileName
      : `${fileName}.json`;
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, normalized);
  }, [faceId, poseRig.poseGraphFileName, poseRig.poseGraphSpec]);

  const handleExportPoseConfigFile = useCallback(() => {
    const config = poseRig.poseConfigDraft;
    if (!config) {
      alertDialog("Capture a neutral pose or add pose data before exporting.");
      return;
    }
    const trimmed = poseRig.poseConfigFileName.trim();
    const fileName =
      trimmed.length > 0 ? trimmed : `${faceSlug(faceId)}_pose_config.json`;
    const normalized = fileName.toLowerCase().endsWith(".json")
      ? fileName
      : `${fileName}.json`;
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, normalized);
  }, [faceId, poseRig.poseConfigDraft, poseRig.poseConfigFileName]);

  const handleImportPoseConfigFile = useCallback(
    async (file: File) => {
      try {
        await poseRig.importPoseConfig(file);
      } catch (error) {
        alertDialog(
          `Failed to import pose config: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [poseRig],
  );

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>Vizij Rig Authoring</h1>
          <h3>**Pre-Pre-Pre-Alpha Demo**</h3>
          <p>Load a GLB, rig a structure, pose it, and export it.</p>
          <p>UI and workflow improvements coming soon.</p>
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

        <GraphImportPanel
          onSelectGraphFile={(file) => {
            void handleImportGraphFile(file);
          }}
          disabled={!canImportGraph}
        />

        <PoseRigImportExportPanel
          rigName={poseRig.rigName}
          onRigNameChange={poseRig.setRigName}
          poseGraphFileName={poseRig.poseGraphFileName}
          onPoseGraphFileNameChange={poseRig.setPoseGraphFileName}
          poseConfigFileName={poseRig.poseConfigFileName}
          onPoseConfigFileNameChange={poseRig.setPoseConfigFileName}
          onExportPoseGraph={handleExportPoseGraphFile}
          onExportPoseConfig={handleExportPoseConfigFile}
          onImportPoseConfig={handleImportPoseConfigFile}
          poseConfigWarnings={poseRig.poseConfigWarnings}
          disabled={!poseRig.ready}
        />

        <ExportPanel
          graphFileName={graphFileName}
          onGraphFileNameChange={handleGraphFileNameChange}
          exportFileName={exportFileName}
          onExportFileNameChange={handleExportFileNameChange}
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
        poseRig={poseRig}
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
          inputBindings={inputBindings}
          bindingIssues={bindingIssues}
          featureLabelOverrides={featureLabelOverrides}
          onBindingInputChange={handleBindingInputChange}
          onBindingRemapChange={handleBindingRemapChange}
          onResetBinding={handleResetBinding}
          inputValues={inputValues}
          onInputValueChange={handleInputValueChange}
          managedStandardInputs={managedStandardInputs}
          standardInputs={standardInputs}
          standardInputRoots={standardInputRoots}
          selectedStandardInputRoots={selectedStandardInputRoots}
          selectedStandardInputSubgroups={selectedStandardInputSubgroups}
          onSelectedStandardInputRootsChange={handleSelectStandardInputRoots}
          onSelectedStandardInputSubgroupsChange={
            handleSelectStandardInputSubgroups
          }
          onRenameGroup={handleRenameGroup}
          onCreateCustomStandardInput={handleCreateCustomStandardInput}
          onResetAllInputs={handleResetAllInputValues}
          onClearCachedState={handleClearCachedState}
          onLinkChildInput={handleLinkChildInput}
          onUnlinkChildInput={handleUnlinkChildInput}
          onEnsureParentBinding={handleEnsureParentBinding}
          onUpdateStandardInput={handleUpdateStandardInput}
          onDeleteCustomStandardInput={handleDeleteCustomStandardInput}
          onAddBindingSlot={handleAddBindingSlot}
          onRemoveBindingSlot={handleRemoveBindingSlot}
          onBindingExpressionChange={handleUpdateBindingExpression}
          onBindingSlotAliasChange={handleUpdateBindingSlotAlias}
          onParentBindingInputChange={handleParentBindingInputChange}
          onParentBindingRemapChange={handleParentBindingRemapChange}
          onParentAddBindingSlot={handleParentAddBindingSlot}
          onParentRemoveBindingSlot={handleParentRemoveBindingSlot}
          onParentBindingExpressionChange={handleParentBindingExpressionChange}
          onParentBindingSlotAliasChange={handleParentBindingSlotAliasChange}
          onParentResetBinding={handleParentResetBinding}
          onFeatureLabelChange={(entry, value) =>
            handleUpdateFeatureLabel(entry.id, entry.defaultLabel, value)
          }
        />
      </aside>
    </div>
  );
}

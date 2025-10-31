import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadGLTFFromBlob,
  exportScene,
  useVizijStore,
  type Group,
} from "@vizij/render";
import { AnimatableValuesPanel } from "./components/AnimatableValuesPanel";
import { ImportExportWorkbench } from "./components/app/ImportExportWorkbench";
import { Viewer } from "./components/app/Viewer";
import { PoseRigWorkbench } from "./poseRig/components";
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

type WorkbenchView = "import-export" | "drivers" | "properties" | "pose-rig";

const WORKBENCH_OPTIONS: ReadonlyArray<{
  id: WorkbenchView;
  label: string;
  description: string;
}> = [
  {
    id: "import-export",
    label: "Import & Export",
    description: "Load Vizij assets and package outputs.",
  },
  {
    id: "drivers",
    label: "Drivers",
    description: "Author and manage rig drivers and bindings.",
  },
  {
    id: "properties",
    label: "Properties",
    description: "Map scene properties to rig inputs.",
  },
  {
    id: "pose-rig",
    label: "Pose Rig",
    description: "Capture neutral poses and build pose libraries.",
  },
];

export default function App() {
  const [graphFileName, setGraphFileName] = useState("");
  const [exportFileName, setExportFileName] = useState("");
  const [activeWorkbench, setActiveWorkbench] =
    useState<WorkbenchView>("import-export");
  const graphFileTouchedRef = useRef(false);
  const exportFileTouchedRef = useRef(false);
  const prevFaceIdRef = useRef<string | null>(null);

  const { rootId, sourceName, isLoading, error, clearError, loadFromFile } =
    useVizijAssetLoader();

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
    handleLinkChildInput,
    handleUnlinkChildInput,
    handleRenameShape,
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

  useEffect(() => {
    const defaultGraphName = `rig.graph.json`;
    const defaultGlbName = `face.glb`;

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

  const handleCapturePoseFromDrivers = useCallback(
    (name: string) => {
      poseRig.createPoseFromSnapshot(name.trim());
    },
    [poseRig],
  );

  const renderAnimatablePanel = (
    sections?: { drivers?: boolean; properties?: boolean },
    extraProps?: {
      onCapturePoseFromDrivers?: (name: string) => void;
      capturePoseDisabled?: boolean;
    },
  ) => (
    <AnimatableValuesPanel
      namespace={DEFAULT_NAMESPACE}
      faceId={faceId}
      onFaceIdChange={handleFaceIdChange}
      visibleSections={sections}
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
      onCreateCustomStandardInput={handleCreateCustomStandardInput}
      onRenameShape={handleRenameShape}
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
      {...extraProps}
    />
  );

  const activeOption = WORKBENCH_OPTIONS.find(
    (option) => option.id === activeWorkbench,
  );

  return (
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

        <nav className="workbench-nav">
          {WORKBENCH_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`workbench-nav__button${
                option.id === activeWorkbench ? " is-active" : ""
              }`}
              onClick={() => setActiveWorkbench(option.id)}
            >
              <span className="workbench-nav__label">{option.label}</span>
              <span className="workbench-nav__description">
                {option.description}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <Viewer
        rootId={rootId}
        rootRenderable={rootRenderable}
        statusMessage={statusMessage}
        namespace={DEFAULT_NAMESPACE}
        onClearSelection={handleClearSelection}
      />

      <aside className="sidebar sidebar--right">
        <div className="workbench-panel__content">
          {activeOption && (
            <header className="workbench-panel__header">
              <h1 className="sidebar__title">{activeOption.label}</h1>
              <p className="workbench-panel__description">
                {activeOption.description}
              </p>
            </header>
          )}

          <div className="workbench-panel__body">
            {activeWorkbench === "import-export" && (
              <ImportExportWorkbench
                isLoading={isLoading}
                error={error}
                onSelectFile={handleSelectFile}
                onClearError={clearError}
                onImportGraph={handleImportGraphFile}
                canImportGraph={canImportGraph}
                onImportPoseConfig={handleImportPoseConfigFile}
                poseConfigWarnings={poseRig.poseConfigWarnings}
                poseRigReady={poseRig.ready}
                graphFileName={graphFileName}
                onGraphFileNameChange={handleGraphFileNameChange}
                exportFileName={exportFileName}
                onExportFileNameChange={handleExportFileNameChange}
                canExport={canExport}
                onExportGraph={handleExportGraph}
                onExportGlb={handleExportGlb}
                rigName={poseRig.rigName}
                onRigNameChange={poseRig.setRigName}
                poseGraphFileName={poseRig.poseGraphFileName}
                onPoseGraphFileNameChange={poseRig.setPoseGraphFileName}
                poseConfigFileName={poseRig.poseConfigFileName}
                onPoseConfigFileNameChange={poseRig.setPoseConfigFileName}
                onExportPoseGraph={handleExportPoseGraphFile}
                onExportPoseConfig={handleExportPoseConfigFile}
              />
            )}

            {activeWorkbench === "drivers" &&
              renderAnimatablePanel(
                { drivers: true },
                {
                  onCapturePoseFromDrivers: handleCapturePoseFromDrivers,
                  capturePoseDisabled: !poseRig.ready,
                },
              )}

            {activeWorkbench === "properties" &&
              renderAnimatablePanel({ properties: true })}

            {activeWorkbench === "pose-rig" && (
              <div className="sidebar__panel sidebar__panel--pose">
                <PoseRigWorkbench state={poseRig} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

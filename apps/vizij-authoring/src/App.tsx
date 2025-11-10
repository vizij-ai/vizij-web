import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadGLTFFromBlobWithBundle,
  exportScene,
  useVizijStore,
  type Group,
  type VizijBundleExtension,
  type VizijBundleGraphEntry,
  type VizijPoseRigConfig,
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
import {
  buildRigGraphSpec,
  buildMachineReport,
  compileIrGraph,
  type IrGraph,
} from "@vizij/node-graph-authoring";
import { alertDialog } from "./utils/dialogs";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import { computeObjectHash } from "./utils/hash";
import type { VizijBundleSummary } from "./components/app/VizijBundleSummaryPanel";

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
  const appliedBundleFingerprintRef = useRef<string | null>(null);
  const rigImportedRef = useRef(false);
  const [includeVizijBundle, setIncludeVizijBundle] = useState(true);
  const [includeImportedAnimations, setIncludeImportedAnimations] =
    useState(false);

  const {
    rootId,
    sourceName,
    isLoading,
    error,
    clearError,
    loadFromFile,
    bundle: loadedBundle,
  } = useVizijAssetLoader();

  const {
    faceId,
    handleFaceIdChange,
    graphStatus,
    graphError,
    bindingIssues,
    featureLabelOverrides,
    featureFlags,
    getGraphIr,
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    standardInputs,
    standardInputsById,
    graphInputDefaults,
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
    handleDisableStandardInput,
    handleEnableStandardInput,
    handleDeleteCustomStandardInput,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleBindingOperatorToggle,
    handleBindingOperatorParamChange,
    handleEnsureParentBinding,
    handleBindingSlotValueTypeChange,
    handleParentBindingInputChange,
    handleParentBindingRemapChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentBindingOperatorToggle,
    handleParentBindingOperatorParamChange,
    handleParentResetBinding,
    handleUpdateFeatureLabel,
    handleFeatureFlagChange,
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
    graphTimeSeconds,
    graphPlaybackState,
    playGraph,
    pauseGraph,
    stopGraph,
    stepGraph,
    graphInsights,
    graphMachineReport,
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

  useEffect(() => {
    setIncludeVizijBundle(true);
    const animationCount = loadedBundle?.animations?.length ?? 0;
    setIncludeImportedAnimations(animationCount > 0);
  }, [loadedBundle]);

  const bundleSummary = useMemo<VizijBundleSummary>(() => {
    if (!loadedBundle) {
      return {
        present: false,
        version: undefined,
        exportedAt: null,
        graphCount: 0,
        poseCount: 0,
        animationCount: 0,
        metadataKeys: [],
      };
    }
    const poseCount = (loadedBundle.poses?.config?.poses ?? []).length;
    return {
      present: true,
      version: loadedBundle.version,
      exportedAt: loadedBundle.exportedAt ?? null,
      graphCount: loadedBundle.graphs?.length ?? 0,
      poseCount,
      animationCount: loadedBundle.animations?.length ?? 0,
      metadataKeys: Object.keys(loadedBundle.metadata ?? {}),
    };
  }, [loadedBundle]);

  const standardInputCount = poseRig.standardInputs.length;

  const handleIncludeBundleToggle = useCallback(
    (value: boolean) => {
      setIncludeVizijBundle(value);
      if (!value) {
        setIncludeImportedAnimations(false);
      } else if (bundleSummary.animationCount > 0) {
        setIncludeImportedAnimations(true);
      }
    },
    [bundleSummary.animationCount],
  );

  const handleIncludeAnimationsToggle = useCallback((value: boolean) => {
    setIncludeImportedAnimations(value);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyBundleState = async () => {
      if (!rootId) {
        return;
      }
      if (!loadedBundle) {
        appliedBundleFingerprintRef.current = null;
        rigImportedRef.current = false;
        return;
      }

      const fingerprintPayload = {
        version: loadedBundle.version,
        graphs: loadedBundle.graphs ?? [],
        poses: loadedBundle.poses?.config ?? null,
      };

      let fingerprint: string | null = null;
      try {
        fingerprint = await computeObjectHash(fingerprintPayload);
      } catch (error) {
        console.warn(
          "[vizij-authoring] Failed to hash bundle for import.",
          error,
        );
        fingerprint = JSON.stringify({
          version: loadedBundle.version,
          exportedAt: loadedBundle.exportedAt ?? null,
        });
      }

      if (cancelled) {
        return;
      }
      if (fingerprint && appliedBundleFingerprintRef.current === fingerprint) {
        return;
      }

      if (fingerprint && appliedBundleFingerprintRef.current !== fingerprint) {
        rigImportedRef.current = false;
      }

      const rigEntry =
        loadedBundle.graphs?.find(
          (entry) => entry.kind?.toLowerCase?.() === "rig",
        ) ?? loadedBundle.graphs?.[0];

      if (!rigImportedRef.current && rigEntry?.spec) {
        try {
          await handleImportGraphSpec(rigEntry.spec as any);
          rigImportedRef.current = true;
        } catch (err) {
          console.warn(
            "[vizij-authoring] Failed to import rig graph from bundle.",
            err,
          );
        }
        if (cancelled) {
          return;
        }
      }

      if (standardInputCount === 0) {
        return;
      }

      if (loadedBundle.poses?.config) {
        try {
          poseRig.importPoseConfigFromData(loadedBundle.poses.config as any);
        } catch (err) {
          console.warn(
            "[vizij-authoring] Failed to import pose rig config from bundle.",
            err,
          );
        }
        if (cancelled) {
          return;
        }
      }

      if (fingerprint) {
        appliedBundleFingerprintRef.current = fingerprint;
      }
    };

    void applyBundleState();

    return () => {
      cancelled = true;
    };
  }, [
    loadedBundle,
    rootId,
    standardInputCount,
    poseRig.importPoseConfigFromData,
    handleImportGraphSpec,
    computeObjectHash,
  ]);

  const handleSelectFile = useCallback(
    async (file: File) => {
      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
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
        const prepared = prepareSpecForImport(parsed);
        const normalised = await normalizeGraphSpec(prepared);
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

    const diagnostics = {
      machineReport: cloneSerializable(buildMachineReport(graphResult)),
      irGraph: graphResult.ir?.graph
        ? cloneSerializable(graphResult.ir.graph)
        : undefined,
    };
    const enrichedSpec = attachGraphDiagnostics(graphResult.spec, diagnostics);

    const baseName = fileName.replace(/\.json$/i, "");
    const base = baseName.length > 0 ? baseName : `${slug}_rig`;
    const specFileName = `${base}.json`;

    const graphBlob = new Blob([JSON.stringify(enrichedSpec, null, 2)], {
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

    let bundle: VizijBundleExtension | null = null;

    if (includeVizijBundle) {
      const exportTimestamp = new Date().toISOString();

      const rigGraphResult = buildRigGraphSpec({
        faceId,
        animatables: effectiveAnimatables,
        components: animatableComponents,
        bindings,
        inputsById: standardInputsById,
        inputBindings,
      });
      const rigDiagnostics = {
        machineReport: cloneSerializable(buildMachineReport(rigGraphResult)),
        irGraph: rigGraphResult.ir?.graph
          ? cloneSerializable(rigGraphResult.ir.graph)
          : undefined,
      };
      const rigSpec = attachGraphDiagnostics(
        rigGraphResult.spec,
        rigDiagnostics,
      );

      const poseGraphSpec = poseRig.poseGraphSpec
        ? (cloneSerializable(poseRig.poseGraphSpec) as Record<string, unknown>)
        : null;

      const poseConfig: VizijPoseRigConfig | null = poseRig.poseConfigDraft
        ? (cloneSerializable(
            poseRig.poseConfigDraft,
          ) as unknown as VizijPoseRigConfig)
        : null;

      const [rigHash, poseGraphHash, poseConfigHash] = await Promise.all([
        computeObjectHash(rigSpec).catch(() => undefined),
        poseGraphSpec
          ? computeObjectHash(poseGraphSpec).catch(() => undefined)
          : Promise.resolve(undefined),
        poseConfig
          ? computeObjectHash(poseConfig).catch(() => undefined)
          : Promise.resolve(undefined),
      ]);

      const graphs: VizijBundleGraphEntry[] = [
        {
          id: rigGraphResult.summary.faceId ?? faceSlug(faceId),
          kind: "rig",
          label: `${faceSlug(faceId)} rig`,
          spec: rigSpec,
          metadata: {
            hash: rigHash,
            exportedAt: exportTimestamp,
            faceId: faceId ?? undefined,
            issues:
              rigGraphResult.issues.fatal.length > 0
                ? rigGraphResult.issues
                : undefined,
          },
        },
      ];

      if (poseGraphSpec) {
        graphs.push({
          id: poseRig.poseGraphFileName || `${faceSlug(faceId)}_pose_graph`,
          kind: "pose-driver",
          label: poseRig.poseGraphFileName || "pose graph",
          spec: poseGraphSpec,
          metadata: {
            hash: poseGraphHash,
            exportedAt: exportTimestamp,
          },
        });
      }

      const inheritedAnimations =
        includeImportedAnimations && Array.isArray(loadedBundle?.animations)
          ? cloneSerializable(loadedBundle.animations)
          : [];

      const bundleMetadata: Record<string, unknown> = {
        faceId: faceId ?? null,
        source: sourceName ?? null,
        exporter: "vizij-authoring",
      };

      if (loadedBundle) {
        bundleMetadata.previousBundleVersion = loadedBundle.version;
        if (loadedBundle.exportedAt) {
          bundleMetadata.previousExportedAt = loadedBundle.exportedAt;
        }
      }

      if (!includeImportedAnimations) {
        bundleMetadata.inheritedAnimations = false;
      }

      bundle = {
        version: 1,
        exportedAt: exportTimestamp,
        graphs,
        poses: poseConfig
          ? {
              config: poseConfig,
              metadata: {
                hash: poseConfigHash,
                exportedAt: exportTimestamp,
              },
            }
          : null,
        animations: inheritedAnimations,
        metadata: bundleMetadata,
      };
    }

    exportScene(
      bodies[0],
      bundle
        ? {
            fileName: downloadName,
            bundle,
          }
        : { fileName: downloadName },
    );

    if (appliedOverrides) {
      setStoreState((prev) => ({
        ...prev,
        animatables: originalAnimatables,
        values: originalValues,
      }));
    }
  }, [
    animatableComponents,
    animatables,
    bindings,
    collectAnimatableExportState,
    exportFileName,
    faceId,
    getExportableBodies,
    featureLabelOverrides,
    inputBindings,
    poseRig.poseConfigDraft,
    poseRig.poseGraphFileName,
    poseRig.poseGraphSpec,
    rootId,
    setStoreState,
    loadedBundle,
    includeVizijBundle,
    includeImportedAnimations,
    sourceName,
    standardInputsById,
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
      graphInputDefaults={graphInputDefaults}
      graphTimeSeconds={graphTimeSeconds}
      graphPlaybackState={graphPlaybackState}
      onGraphPlay={playGraph}
      onGraphPause={pauseGraph}
      onGraphStop={stopGraph}
      onGraphStep={stepGraph}
      bindings={bindings}
      inputBindings={inputBindings}
      bindingIssues={bindingIssues}
      featureLabelOverrides={featureLabelOverrides}
      featureFlags={featureFlags}
      onFeatureFlagChange={handleFeatureFlagChange}
      graphInsights={graphInsights}
      graphMachineReport={graphMachineReport}
      getGraphIr={getGraphIr}
      values={values}
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
      onDisableStandardInput={handleDisableStandardInput}
      onEnableStandardInput={handleEnableStandardInput}
      onDeleteCustomStandardInput={handleDeleteCustomStandardInput}
      onAddBindingSlot={handleAddBindingSlot}
      onRemoveBindingSlot={handleRemoveBindingSlot}
      onBindingExpressionChange={handleUpdateBindingExpression}
      onBindingSlotAliasChange={handleUpdateBindingSlotAlias}
      onBindingSlotValueTypeChange={handleBindingSlotValueTypeChange}
      onBindingOperatorToggle={handleBindingOperatorToggle}
      onBindingOperatorParamChange={handleBindingOperatorParamChange}
      onParentBindingInputChange={handleParentBindingInputChange}
      onParentBindingRemapChange={handleParentBindingRemapChange}
      onParentAddBindingSlot={handleParentAddBindingSlot}
      onParentRemoveBindingSlot={handleParentRemoveBindingSlot}
      onParentBindingExpressionChange={handleParentBindingExpressionChange}
      onParentBindingSlotAliasChange={handleParentBindingSlotAliasChange}
      onParentBindingSlotValueTypeChange={
        handleParentBindingSlotValueTypeChange
      }
      onParentBindingOperatorToggle={handleParentBindingOperatorToggle}
      onParentBindingOperatorParamChange={
        handleParentBindingOperatorParamChange
      }
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
                bundleSummary={bundleSummary}
                includeBundle={includeVizijBundle}
                onIncludeBundleChange={handleIncludeBundleToggle}
                includeAnimations={includeImportedAnimations}
                onIncludeAnimationsChange={handleIncludeAnimationsToggle}
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
                <PoseRigWorkbench state={poseRig} faceId={faceId} />
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function attachGraphDiagnostics(
  spec: GraphSpec,
  diagnostics: { machineReport?: unknown; irGraph?: unknown },
): Record<string, unknown> {
  const cloned = cloneSerializable(spec) as Record<string, unknown>;
  if (!diagnostics.machineReport && !diagnostics.irGraph) {
    return cloned;
  }
  const metadata =
    cloned.metadata && typeof cloned.metadata === "object"
      ? { ...(cloned.metadata as Record<string, unknown>) }
      : {};
  const vizij =
    metadata.vizij && typeof metadata.vizij === "object"
      ? { ...(metadata.vizij as Record<string, unknown>) }
      : {};
  if (diagnostics.machineReport) {
    vizij.machineReport = diagnostics.machineReport;
  }
  if (diagnostics.irGraph) {
    vizij.irGraph = diagnostics.irGraph;
  }
  metadata.vizij = vizij;
  cloned.metadata = metadata;
  return cloned;
}

function extractVizijMetadataSection(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const metadata = (payload as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const vizij = (metadata as { vizij?: unknown }).vizij;
  if (!vizij || typeof vizij !== "object") {
    return null;
  }
  return cloneSerializable(vizij as Record<string, unknown>);
}

function extractIrGraphFromPayload(payload: unknown): IrGraph | null {
  const vizijMetadata = extractVizijMetadataSection(payload);
  if (
    vizijMetadata &&
    "irGraph" in vizijMetadata &&
    vizijMetadata.irGraph &&
    typeof vizijMetadata.irGraph === "object"
  ) {
    return cloneSerializable(vizijMetadata.irGraph as IrGraph);
  }
  if (payload && typeof payload === "object") {
    const direct = (payload as { irGraph?: unknown }).irGraph;
    if (direct && typeof direct === "object") {
      return cloneSerializable(direct as IrGraph);
    }
  }
  return null;
}

function prepareSpecForImport(payload: unknown): unknown {
  const irGraph = extractIrGraphFromPayload(payload);
  if (!irGraph) {
    return payload;
  }
  const compiled = compileIrGraph(irGraph, { preferLegacySpec: false });
  const vizijMetadata = extractVizijMetadataSection(payload);
  if (!vizijMetadata) {
    return compiled.spec;
  }
  const enriched = cloneSerializable(compiled.spec) as Record<string, unknown>;
  const metadata =
    enriched.metadata && typeof enriched.metadata === "object"
      ? { ...(enriched.metadata as Record<string, unknown>) }
      : {};
  metadata.vizij = vizijMetadata;
  enriched.metadata = metadata;
  return enriched;
}

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  loadGLTFFromBlobWithBundle,
  useVizijStore,
  type LoadedVizijAsset,
} from "@vizij/render";
import { AssetLoaderPanel } from "./AssetLoaderPanel";
import { GraphImportPanel } from "./GraphImportPanel";
import { PoseRigImportPanel, PoseRigExportPanel } from "./PoseRigPanels";
import { ExportPanel } from "./ExportPanel";
import { RigGraphExportPanel } from "./RigGraphExportPanel";
import type { VizijBundleSummary } from "./VizijBundleSummaryPanel";
import { VizijBundleAuditPanel } from "./VizijBundleAuditPanel";
import { RobotDataAuditPanel } from "./RobotDataAuditPanel";
import { useRobotDataAuditRunner } from "../../hooks/useRobotDataAuditRunner";
import { useBundleAudit } from "../../hooks/useBundleAudit";
import {
  useAuthoringUiActions,
  useAuthoringUiState,
} from "../../state/AuthoringUiProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { useDialogQueue, readJsonFile } from "@vizij/authoring-shared";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { VizijBundleExtension } from "@vizij/render";
import { cloneSerializable } from "../../utils/serialization";
import { useAuthoringFileNames } from "../../hooks/useAuthoringFileNames";
import { useVizijExport } from "../../hooks/useVizijExport";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  extractGraphFaceId,
  prepareSpecForImport,
  remapGraphSpecFace,
} from "../../utils/graphImport";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import { GraphDiagnosticsPanel } from "./GraphDiagnosticsPanel";
import { InstructionCallout } from "../common/InstructionCallout";
import { SidebarSection } from "../common/SidebarSection";
import { Tabs } from "../ui";

interface ImportExportWorkbenchProps {
  isLoading: boolean;
  error: string | null;
  loadFromFile: (
    file: File,
    loader: () => Promise<LoadedVizijAsset>,
  ) => Promise<void>;
  onClearError: () => void;
  canImportGraph: boolean;
  canExport: boolean;
  onImportPoseGraph: (file: File) => Promise<void>;
  rootId: string | null;
  sourceName: string | null;
  loadedBundle: VizijBundleExtension | null;
  updateBundle: (
    updater:
      | VizijBundleExtension
      | null
      | ((
          previous: VizijBundleExtension | null,
        ) => VizijBundleExtension | null),
  ) => void;
}

/**
 * Houses the GLB / rig import-export workflows, keeping the main app shell
 * lean while still exposing every optional tool for power users.
 */
type HealthTabId =
  | "robot-audit"
  | "bundle-audit"
  | "diagnostics"
  | "maintenance";

const HEALTH_TABS: ReadonlyArray<{ id: HealthTabId; label: string }> = [
  { id: "robot-audit", label: "RobotData" },
  { id: "bundle-audit", label: "Bundle Graphs" },
  { id: "diagnostics", label: "Graph Diagnostics" },
  { id: "maintenance", label: "Rig Maintenance" },
];

export function ImportExportWorkbench({
  isLoading,
  error,
  loadFromFile,
  onClearError,
  canImportGraph,
  canExport,
  onImportPoseGraph,
  rootId,
  sourceName,
  loadedBundle,
  updateBundle,
}: ImportExportWorkbenchProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [activeHealthTab, setActiveHealthTab] =
    useState<HealthTabId>("robot-audit");

  const faceId = useGraphRuntime((state) => state.faceId);
  const world = useGraphRuntime((state) => state.world);
  const animatables = useGraphRuntime((state) => state.animatables);
  const values = useGraphRuntime((state) => state.values);
  const setStoreState = useGraphRuntime((state) => state.setStoreState);
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );

  const animatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const bindings = useBindingAuthoring((state) => state.bindings);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const handleClearCachedState = useBindingAuthoring(
    (state) => state.handleClearCachedState,
  );
  const featureLabelOverrides = useBindingAuthoring(
    (state) => state.featureLabelOverrides,
  );
  const collectAnimatableExportState = useBindingAuthoring(
    (state) => state.collectAnimatableExportState,
  );
  const validOutputTargets = useBindingAuthoring(
    (state) => state.validOutputTargets,
  );

  const {
    graphFileName,
    exportFileName,
    handleGraphFileNameChange,
    handleExportFileNameChange,
  } = useAuthoringFileNames({ faceId });
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  const { includeVizijBundle, includeImportedAnimations, skipDiscrepancyCheck } =
    uiState;

  const {
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt,
  } = useDialogQueue();
  const poseRig = usePoseRig();

  const robotAudit = useRobotDataAuditRunner({
    namespace: DEFAULT_NAMESPACE,
    world,
    animatables,
    enabled: Boolean(rootId),
  });
  const canRunRobotDataAudit = Boolean(rootId) && !isLoading;

  const handleSelectFile = useCallback(
    async (file: File) => {
      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
      );
    },
    [loadFromFile],
  );

  const handleImportGraphFile = useCallback(
    async (file: File) => {
      try {
        const parsed = await readJsonFile<GraphSpec>(file);
        let workingPayload: unknown = parsed;
        const importedFaceId = extractGraphFaceId(parsed);
        if (faceId && importedFaceId && importedFaceId !== faceId) {
          const shouldRemap = await showConfirm(
            `Rig graph targets face "${importedFaceId}" but the loaded asset uses "${faceId}". Remap the graph to the current face? Click Cancel to import it as-is.`,
          );
          if (shouldRemap) {
            workingPayload = remapGraphSpecFace(parsed, faceId, {
              previousFaceId: importedFaceId,
            });
          }
        }
        const prepared = prepareSpecForImport(workingPayload);
        const normalised = await normalizeGraphSpec(prepared);
        await handleImportGraphSpec(normalised);
      } catch (error) {
        await showAlert(
          `Failed to import rig graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [faceId, handleImportGraphSpec, showAlert, showConfirm],
  );

  const handleImportPoseConfig = useCallback(
    async (file: File) => {
      await poseRig.importPoseConfig(file);
    },
    [poseRig],
  );

  const {
    exportGraph,
    exportGlb,
    exportPoseGraphFile,
    exportPoseConfigFile,
    importPoseConfigFile,
  } = useVizijExport({
    faceId,
    graphFileName,
    exportFileName,
    rootId,
    sourceName,
    includeVizijBundle,
    includeImportedAnimations,
    loadedBundle,
    animatableComponents,
    animatables,
    values,
    bindings,
    inputBindings,
    standardInputsById,
    featureLabelOverrides,
    collectAnimatableExportState,
    setStoreState,
    getExportableBodies,
    alertDialog: showAlert,
    poseRig: {
      poseGraphSpec: poseRig.poseGraphSpec,
      poseGraphFileName: poseRig.poseGraphFileName,
      poseConfigDraft: poseRig.poseConfigDraft,
      poseConfigFileName: poseRig.poseConfigFileName,
      importPoseConfig: handleImportPoseConfig,
    },
  });

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

  const handleIncludeBundleChange = useCallback(
    (value: boolean) => {
      uiActions.setIncludeVizijBundle(value);
      if (value && bundleSummary.animationCount > 0) {
        uiActions.setIncludeImportedAnimations(true);
      }
    },
    [bundleSummary.animationCount, uiActions],
  );

  const handleIncludeAnimationsChange = useCallback(
    (value: boolean) => {
      uiActions.setIncludeImportedAnimations(value);
    },
    [uiActions],
  );

  const {
    bundleAudit,
    bundleAuditError,
    bundleAuditStatus,
    refreshBundleAudit,
  } = useBundleAudit(loadedBundle, validOutputTargets);

  const bundleAuditPanelStatus =
    bundleAuditStatus === "running"
      ? "running"
      : bundleAuditError
        ? "error"
        : "idle";

  const handleClearCachedRig = useCallback(async () => {
    const confirmed = await showConfirm(
      "Clear cached rig data for this asset? This removes saved inputs, bindings, and overrides.",
    );
    if (!confirmed) {
      return;
    }
    handleClearCachedState();
    await showAlert("Cached rig data cleared.");
  }, [handleClearCachedState, showAlert, showConfirm]);

  const handleOverwriteBundleGraph = useCallback(
    async (graphId: string) => {
      if (!bundleAudit) {
        await showAlert(
          "Unable to find audit data. Run the bundle audit again and retry.",
        );
        return;
      }
      const target = bundleAudit.find((entry) => entry.id === graphId);
      if (!target) {
        await showAlert(
          "Unable to find audit entry for the selected graph. Run the audit again and retry.",
        );
        return;
      }
      if (!target.compiledSpec) {
        await showAlert(
          "This graph did not produce a compiled IR spec, so it cannot be overwritten automatically.",
        );
        return;
      }
      updateBundle((previous) => {
        if (!previous?.graphs?.length) {
          return previous;
        }
        const graphs = previous.graphs.map((graph) => {
          if (graph.id !== graphId) {
            return graph;
          }
          return {
            ...graph,
            spec: cloneSerializable(target.compiledSpec as GraphSpec) as Record<
              string,
              unknown
            >,
            metadata: {
              ...(graph.metadata ?? {}),
              reconciledAt: new Date().toISOString(),
            },
          };
        });
        return {
          ...previous,
          graphs,
        };
      });
    },
    [bundleAudit, showAlert, updateBundle],
  );

  const handleRenameBundleOutput = useCallback(
    async (graphId: string, nodeId: string, currentPath: string | null) => {
      const targetGraph = loadedBundle?.graphs?.find(
        (graph) => graph.id === graphId,
      );
      if (!targetGraph) {
        await showAlert("Unable to locate the selected graph in the bundle.");
        return;
      }
      if (!targetGraph.ir) {
        await showAlert("This graph has no IR payload to edit.");
        return;
      }
      const nextPath = await showPrompt(
        "Enter the new output path for this node (e.g., rig/face/eyes/blink)",
        currentPath ?? "",
      );
      if (nextPath === null) {
        return;
      }
      const trimmed = nextPath.trim();
      if (!trimmed) {
        await showAlert("Output path cannot be empty.");
        return;
      }
      const nextIr = cloneSerializable(targetGraph.ir) as unknown as IrGraph;
      const targetNode = nextIr.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        await showAlert("Unable to find the output node inside the IR graph.");
        return;
      }
      targetNode.params = { ...(targetNode.params ?? {}), path: trimmed };
      const compiled = compileIrGraph(nextIr, { preferLegacySpec: false });
      updateBundle((previous) => {
        if (!previous?.graphs?.length) {
          return previous;
        }
        const graphs = previous.graphs.map((graph) => {
          if (graph.id !== graphId) {
            return graph;
          }
          return {
            ...graph,
            spec: cloneSerializable(compiled.spec) as Record<string, unknown>,
            ir: cloneSerializable(nextIr) as unknown as Record<string, unknown>,
          };
        });
        return {
          ...previous,
          graphs,
        };
      });
    },
    [loadedBundle, showAlert, showPrompt, updateBundle],
  );

  const hasLoadedAsset = Boolean(rootId || loadedBundle);

  useEffect(() => {
    if (!hasLoadedAsset) {
      setActiveHealthTab("robot-audit");
    }
  }, [hasLoadedAsset]);

  const renderHealthTab = () => {
    switch (activeHealthTab) {
      case "robot-audit":
        return (
          <div className="sidebar__stack">
            <InstructionCallout
              label="RobotData audit tips"
              summary="Catch node drift after edits or merges"
              size="compact"
            >
              <ul>
                <li>
                  Run the audit whenever meshes, skeletons, or RobotData sources
                  are edited outside Vizij.
                </li>
                <li>
                  Results become stale after a new GLB load—rerun before
                  exporting so you compare current data.
                </li>
                <li>
                  Use the per-node errors to jump directly to problem objects in
                  the scene composer.
                </li>
              </ul>
            </InstructionCallout>
            <RobotDataAuditPanel
              result={robotAudit.result}
              status={robotAudit.status}
              progress={robotAudit.progress}
              isStale={robotAudit.isResultStale}
              error={robotAudit.error}
              canRun={canRunRobotDataAudit}
              onRun={robotAudit.runAudit}
              onCancel={robotAudit.cancelAudit}
            />
          </div>
        );
      case "bundle-audit":
        return (
          <div className="sidebar__stack">
            <InstructionCallout
              label="Bundle graph checklist"
              summary="Keep GraphSpecs + IR aligned"
              size="compact"
            >
              <ol>
                <li>Click Refresh to rebuild graphs and record diffs.</li>
                <li>
                  Use Overwrite to push compiled specs back into the bundle so
                  future loads stay clean.
                </li>
                <li>
                  Rename outputs inline to keep downstream rig paths predictable
                  before exporting.
                </li>
              </ol>
            </InstructionCallout>
            <VizijBundleAuditPanel
              audits={bundleAudit}
              status={bundleAuditPanelStatus}
              error={bundleAuditError}
              onRefresh={refreshBundleAudit}
              onOverwrite={handleOverwriteBundleGraph}
              onRenameOutput={handleRenameBundleOutput}
            />
          </div>
        );
      case "diagnostics":
        return (
          <div className="sidebar__stack">
            <InstructionCallout
              label="Graph diagnostics primer"
              summary="Capture machine reports + IR snapshots"
              size="compact"
            >
              <ol>
                <li>
                  Generate a machine report after large binding changes to
                  capture slot metadata.
                </li>
                <li>
                  Download IR snapshots to diff builds or attach to bug reports.
                </li>
                <li>
                  Use quick links to copy CLI commands for Vizij IR diffs.
                </li>
              </ol>
            </InstructionCallout>
            <GraphDiagnosticsPanel />
          </div>
        );
      case "maintenance":
        return (
          <div className="sidebar__stack">
            <InstructionCallout
              label="Rig cache maintenance"
              summary="Clear overrides when authoring feels stale"
              size="compact"
            >
              <ul>
                <li>
                  Clear cached data if bindings or driver states stop matching
                  what the bundle reports after a reload.
                </li>
                <li>
                  The action wipes stored inputs, bindings, and overrides for
                  the current asset only.
                </li>
                <li>
                  Re-run audits and exports afterward to repopulate the cache
                  with up-to-date data.
                </li>
              </ul>
            </InstructionCallout>
            <div className="asset-card">
              <div className="asset-card__body asset-card__body--compact">
                <p className="asset-card__hint">
                  Clears stored overrides for the currently loaded Vizij asset.
                </p>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    void handleClearCachedRig();
                  }}
                >
                  Clear cached rig data
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="workbench-panel__scroll">
      <SidebarSection
        title="Importing"
        description="Load a raw GLB or previously exported Vizij file."
        instructions={{
          label: "GLB workflow refresher",
          summary: "Load assets, confirm what was detected, then iterate",
          size: "compact",
          content: (
            <ol>
              <li>
                Use the loader or drop a GLB anywhere in the app—the pipeline
                preserves Vizij bundle metadata.
              </li>
              <li>
                Verify the bundle summary matches expectdations before moving
                on; a mismatch usually means a stale bundle or missing
                dependencies.
              </li>
              <li>
                Once things look right, continue with audits/export to keep the
                asset in sync.
              </li>
            </ol>
          ),
        }}
      >
        <div className="sidebar__stack">
          <AssetLoaderPanel
            isLoading={isLoading}
            error={error}
            onSelectFile={handleSelectFile}
            onClearError={onClearError}
            skipDiscrepancyCheck={skipDiscrepancyCheck}
            onSkipDiscrepancyCheckChange={uiActions.setSkipDiscrepancyCheck}
          />

          {/* <VizijBundleSummaryPanel summary={bundleSummary} /> */}
        </div>
      </SidebarSection>

      <SidebarSection
        title="Exporting"
        description="Package Vizij outputs for tooling or runtime hand-off."
        instructions={{
          label: "Export best practices",
          summary: "Name files clearly and trim payloads as needed",
          size: "compact",
          content: (
            <ul>
              <li>
                Name exports after milestones (e.g.{" "}
                <code>robot_v2_audit.glb</code>) so downstream teams know what
                changed.
              </li>
              <li>
                Disable Vizij bundle or animation payloads when you only need
                the base GLB mesh for DCC review.
              </li>
              <li>
                Exports always reflect the current in-memory bundle, so re-run
                audits if anything upstream changed.
              </li>
            </ul>
          ),
        }}
      >
        <div className="sidebar__stack">
          <ExportPanel
            exportFileName={exportFileName}
            onExportFileNameChange={handleExportFileNameChange}
            canExport={canExport}
            onExportGlb={() => {
              void exportGlb();
            }}
            animationCount={bundleSummary.animationCount}
            includeBundle={includeVizijBundle}
            onIncludeBundleChange={handleIncludeBundleChange}
            includeAnimations={includeImportedAnimations}
            onIncludeAnimationsChange={handleIncludeAnimationsChange}
            blendMode={poseRig.blendMode}
            onBlendModeChange={poseRig.setBlendMode}
          />
          <div className="sidebar__stack">
            <div className="asset-card">
              <div className="asset-card__body asset-card__body--compact">
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => setIsAdvancedOpen((current) => !current)}
                  aria-expanded={isAdvancedOpen}
                  aria-controls="vizij-advanced-import-export"
                >
                  {isAdvancedOpen
                    ? "Hide optional imports & exports"
                    : "Show optional imports & exports"}
                </button>
                <p className="asset-card__hint asset-card__hint--muted">
                  Legacy rig graph and pose rig files remain available when
                  required.
                </p>
              </div>
            </div>

            {isAdvancedOpen ? (
              <div
                id="vizij-advanced-import-export"
                className="sidebar__stack"
                style={{ marginTop: "0.75rem" }}
              >
                <GraphImportPanel
                  onSelectGraphFile={(file) => {
                    void handleImportGraphFile(file);
                  }}
                  disabled={!canImportGraph}
                />

                <RigGraphExportPanel
                  graphFileName={graphFileName}
                  onGraphFileNameChange={handleGraphFileNameChange}
                  canExport={canExport}
                  onExportGraph={exportGraph}
                />

                <PoseRigImportPanel
                  onImportPoseConfig={importPoseConfigFile}
                  onImportPoseGraph={onImportPoseGraph}
                  poseConfigWarnings={poseRig.poseConfigWarnings}
                  disabled={!poseRig.ready}
                />

                <PoseRigExportPanel
                  rigName={poseRig.rigName}
                  onRigNameChange={poseRig.setRigName}
                  poseGraphFileName={poseRig.poseGraphFileName}
                  onPoseGraphFileNameChange={(name) =>
                    poseRig.setPoseGraphFileName(name)
                  }
                  poseConfigFileName={poseRig.poseConfigFileName}
                  onPoseConfigFileNameChange={(name) =>
                    poseRig.setPoseConfigFileName(name)
                  }
                  onExportPoseGraph={exportPoseGraphFile}
                  onExportPoseConfig={exportPoseConfigFile}
                  disabled={!poseRig.ready}
                />
              </div>
            ) : null}
          </div>
        </div>
      </SidebarSection>

      {hasLoadedAsset ? (
        <SidebarSection
          title="Health & Diagnostics"
          description="Audit RobotData, reconcile bundle graphs, inspect diagnostics, or clear cached rig data without leaving this workbench."
        >
          <Tabs
            value={activeHealthTab}
            onValueChange={(id) => setActiveHealthTab(id as HealthTabId)}
            items={HEALTH_TABS}
            renderPanel={() => renderHealthTab()}
            className="health-tabs"
            listClassName="health-tabs__button-row"
            panelClassName="health-tabs__panel"
            size="sm"
            variant="pill"
          />
        </SidebarSection>
      ) : null}
    </div>
  );
}

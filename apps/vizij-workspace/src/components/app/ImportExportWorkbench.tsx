import { useCallback, useMemo, useState } from "react";
import {
  loadGLTFFromBlobWithBundle,
  useVizijStore,
  type LoadedVizijAsset,
} from "@vizij/render";
import { useDialogQueue, readJsonFile } from "@vizij/authoring-shared";
import { type IrGraph } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { VizijBundleExtension } from "@vizij/render";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import {
  useAuthoringUiActions,
  useAuthoringUiState,
} from "../../state/AuthoringUiProvider";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { useAuthoringFileNames } from "../../hooks/useAuthoringFileNames";
import { useVizijExport } from "../../hooks/useVizijExport";
import { usePoseRig } from "../../state/PoseRigProvider";
import {
  extractGraphFaceId,
  prepareSpecForImport,
  remapGraphSpecFace,
} from "../../utils/graphImport";
import { SidebarSection } from "../common/SidebarSection";
import { AssetLoaderPanel } from "./AssetLoaderPanel";

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

  const faceId = useGraphRuntime((state) => state.faceId);
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
  const {
    includeVizijBundle,
    includeImportedAnimations,
    skipDiscrepancyCheck,
  } = uiState;

  const {
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt,
  } = useDialogQueue();
  const poseRig = usePoseRig();


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
          `Failed to import rig graph: ${error instanceof Error ? error.message : String(error)
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

  const bundleSummary = useMemo(() => {
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

  const hasLoadedAsset = Boolean(rootId || loadedBundle);

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

      {/* Exporting section moved to dialog */}
    </div>
  );
}

import { useState, useMemo, useCallback, useEffect } from "react";
import { useVizijStore } from "@vizij/render";
import { useDialogQueue } from "@vizij/authoring-shared";
import type { VizijBundleExtension } from "@vizij/render";
import { ChevronRight } from "lucide-react";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useAuthoringFileNames } from "../../hooks/useAuthoringFileNames";
import { useVizijExport } from "../../hooks/useVizijExport";
import { usePoseRig } from "../../state/PoseRigProvider";
import { Modal } from "../ui/Modal";
import { InstructionCallout } from "../common/InstructionCallout";
import {
  useAuthoringUiActions,
  useAuthoringUiState,
} from "../../state/AuthoringUiProvider";
import { cn } from "../../utils/cn";
import { resolveExportBodiesFromWorld } from "../../utils/exportBodies";
import type { AnimationClipIR } from "../../types/animationClipIr";
import { ExportPanel } from "./ExportPanel";
import { RigGraphExportPanel } from "./RigGraphExportPanel";
import { PoseRigExportPanel, PoseRigImportPanel } from "./PoseRigPanels";
import type { VizijBundleSummary } from "./VizijBundleSummaryPanel";

interface RuntimeExportBodies {
  rootFilteredBodies: unknown[];
  anyBodies: unknown[];
  runtimeRootId: string | null;
}

interface AuthoredMotionGraphExportEntry {
  id: string;
  label: string;
  spec: { nodes: unknown[]; edges: unknown[] };
}

function normalizeRootId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface PoseRigIrCapabilities {
  poseIrDraft?: unknown | null;
  poseIrFileName?: string;
  setPoseIrFileName?: (value: string) => void;
  importPoseIr?: (file: File) => Promise<void> | void;
  exportPoseIrData?: () => Promise<unknown> | unknown;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  rootId: string | null;
  exportSceneRoot: unknown;
  sourceName: string | null;
  loadedBundle: VizijBundleExtension | null;
  authoredAnimationClips: AnimationClipIR[];
  authoredProceduralPrograms: AuthoredMotionGraphExportEntry[];
  activeMotionGraphId?: string | null;
  canExport: boolean;
  onImportPoseGraph: (file: File) => Promise<void>;
  runtimeExportBodies?: RuntimeExportBodies;
  onExportGlbComplete?: () => void;
  registerGlbExportHandler?: (handler: (() => Promise<void>) | null) => void;
}

export function ExportDialog({
  open,
  onClose,
  rootId,
  exportSceneRoot,
  sourceName,
  loadedBundle,
  authoredAnimationClips,
  authoredProceduralPrograms,
  activeMotionGraphId,
  canExport,
  onImportPoseGraph,
  runtimeExportBodies,
  onExportGlbComplete,
  registerGlbExportHandler,
}: ExportDialogProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const faceId = useGraphRuntime((state) => state.faceId);
  const values = useGraphRuntime((state) => state.values);
  const animatables = useGraphRuntime((state) => state.animatables);
  const setStoreState = useGraphRuntime((state) => state.setStoreState);

  const animatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const bindings = useBindingAuthoring((state) => state.bindings);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const pipelineMetadataV1 = useBindingAuthoring(
    (state) => state.pipelineMetadataV1,
  );
  const pipelineConfigByInputId = useBindingAuthoring(
    (state) => state.pipelineConfigByInputId,
  );
  const validOutputTargets = useBindingAuthoring(
    (state) => state.validOutputTargets,
  );
  const featureLabelOverrides = useBindingAuthoring(
    (state) => state.featureLabelOverrides,
  );
  const collectAnimatableExportState = useBindingAuthoring(
    (state) => state.collectAnimatableExportState,
  );

  const {
    graphFileName,
    exportFileName,
    handleGraphFileNameChange,
    handleExportFileNameChange,
  } = useAuthoringFileNames({ faceId });
  const runtimeWorld = useVizijStore((state) => state.world);
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );
  const normalizedRootId = useMemo(() => normalizeRootId(rootId), [rootId]);
  const runtimeSnapshotRootId = useMemo(
    () => normalizeRootId(runtimeExportBodies?.runtimeRootId ?? null),
    [runtimeExportBodies?.runtimeRootId],
  );
  const canUseRuntimeSnapshot =
    Boolean(normalizedRootId) &&
    runtimeSnapshotRootId === normalizedRootId &&
    Boolean(runtimeExportBodies);
  const getExportableBodiesForExport = useCallback(
    (filterIds?: string[]) => {
      if (canUseRuntimeSnapshot && filterIds && filterIds.length > 0) {
        if (
          runtimeExportBodies &&
          runtimeExportBodies.rootFilteredBodies.length
        ) {
          return runtimeExportBodies.rootFilteredBodies;
        }
      } else if (
        canUseRuntimeSnapshot &&
        runtimeExportBodies &&
        runtimeExportBodies.anyBodies.length > 0
      ) {
        return runtimeExportBodies.anyBodies;
      }
      const fromStore = getExportableBodies(filterIds);
      if (fromStore.length > 0) {
        return fromStore;
      }
      return resolveExportBodiesFromWorld(runtimeWorld, filterIds);
    },
    [
      canUseRuntimeSnapshot,
      getExportableBodies,
      runtimeExportBodies,
      runtimeWorld,
    ],
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  const { includeVizijBundle, includeImportedAnimations } = uiState;
  const { alert: showAlert } = useDialogQueue();
  const poseRig = usePoseRig();
  const poseRigWithIr = poseRig as typeof poseRig & PoseRigIrCapabilities;
  const [fallbackPoseIrFileName, setFallbackPoseIrFileName] =
    useState("pose_ir.json");
  const poseIrFileName = poseRigWithIr.poseIrFileName ?? fallbackPoseIrFileName;
  const setPoseIrFileName = poseRigWithIr.setPoseIrFileName;

  const handlePoseIrFileNameChange = useCallback(
    (name: string) => {
      if (typeof setPoseIrFileName === "function") {
        setPoseIrFileName(name);
        return;
      }
      setFallbackPoseIrFileName(name);
    },
    [setPoseIrFileName],
  );
  const {
    exportGraph,
    exportGlb,
    exportPoseGraphFile,
    exportPoseConfigFile,
    exportPoseIrFile,
    importPoseConfigFile,
    importPoseIrFile,
    canExportPoseIr,
    canImportPoseIr,
    poseIrSupportHint,
  } = useVizijExport({
    faceId,
    graphFileName,
    exportFileName,
    rootId,
    sourceName,
    includeVizijBundle,
    includeImportedAnimations,
    loadedBundle,
    authoredAnimationClips,
    animatableComponents,
    animatables,
    values,
    world: runtimeWorld,
    bindings,
    inputBindings,
    standardInputsById,
    pipelineMetadataV1,
    pipelineConfigByInputId,
    validOutputTargets,
    featureLabelOverrides,
    collectAnimatableExportState,
    setStoreState,
    getExportableBodies: getExportableBodiesForExport,
    fallbackExportBody: exportSceneRoot,
    alertDialog: showAlert,
    poseRig: {
      poseGraphSpec: poseRig.poseGraphSpec,
      poseGraphFileName: poseRig.poseGraphFileName,
      poseConfigDraft: poseRig.poseConfigDraft,
      poseConfigFileName: poseRig.poseConfigFileName,
      poseDiagnostics: poseRig.poseDiagnostics,
      importPoseConfig: poseRig.importPoseConfig,
      poseIrDraft: poseRigWithIr.poseIrDraft,
      poseIrFileName,
      importPoseIr: poseRigWithIr.importPoseIr,
      exportPoseIrData: poseRigWithIr.exportPoseIrData,
      blendMode: poseRig.blendMode,
      crossGroupBlendMode: poseRig.crossGroupBlendMode,
    },
    authoredMotionGraphs: authoredProceduralPrograms,
    activeMotionGraphId,
    onExportGlbComplete,
  });

  useEffect(() => {
    registerGlbExportHandler?.(exportGlb);
    return () => {
      registerGlbExportHandler?.(null);
    };
  }, [exportGlb, registerGlbExportHandler]);

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

  return (
    <Modal open={open} onClose={onClose} title="Export Settings" maxWidth="2xl">
      <div data-testid="export-dialog" className="space-y-6">
        <div className="space-y-4">
          <InstructionCallout
            label="Export best practices"
            summary="Name files clearly and trim payloads as needed"
            size="compact"
          >
            <ul className="list-disc pl-4 text-[11px] text-text-muted space-y-1 font-medium">
              <li>
                Name exports after milestones (e.g.{" "}
                <code className="text-accent">robot_v2_audit.glb</code>).
              </li>
              <li>
                Disable Vizij bundle or animation payloads when you only need
                the base GLB mesh.
              </li>
              <li>Exports always reflect the current in-memory bundle.</li>
            </ul>
          </InstructionCallout>

          <ExportPanel
            exportFileName={exportFileName}
            onExportFileNameChange={handleExportFileNameChange}
            canExport={canExport}
            onExportGlb={() => {
              // eslint-disable-next-line no-console -- export smoke-test diagnostics
              console.log("[vizij-export-ui]", { event: "export-click" });
              void exportGlb();
            }}
            animationCount={bundleSummary.animationCount}
            includeBundle={includeVizijBundle}
            onIncludeBundleChange={handleIncludeBundleChange}
            includeAnimations={includeImportedAnimations}
            onIncludeAnimationsChange={handleIncludeAnimationsChange}
            blendMode={poseRig.blendMode}
            onBlendModeChange={poseRig.setBlendMode}
            crossGroupBlendMode={poseRig.crossGroupBlendMode}
            onCrossGroupBlendModeChange={poseRig.setCrossGroupBlendMode}
          />
        </div>

        <div className="pt-2 border-t border-border-default/50">
          <button
            data-testid="export-advanced-toggle"
            type="button"
            className="w-full flex items-center justify-between p-3 rounded-xl bg-bg-input/50 hover:bg-bg-input border border-border-default/50 transition-all group"
            onClick={() => setIsAdvancedOpen((current) => !current)}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center bg-bg-secondary text-text-muted transition-transform duration-200",
                  isAdvancedOpen && "rotate-90",
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-text-secondary group-hover:text-text-primary uppercase tracking-wider">
                Advanced Export Options
              </span>
            </div>
            {isAdvancedOpen && (
              <span className="text-[10px] font-medium text-text-muted">
                Legacy formats
              </span>
            )}
          </button>

          {isAdvancedOpen && (
            <div
              data-testid="export-advanced-panel"
              className="mt-4 p-4 rounded-xl bg-bg-input/30 border border-border-default/50 space-y-6 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 w-1 h-1 rounded-full bg-accent shrink-0" />
                <p className="text-[11px] leading-relaxed text-text-muted font-medium">
                  Legacy rig graph and pose rig files (including Pose IR when
                  supported by core APIs) remain available for compatibility and
                  specialized pipelines.
                </p>
              </div>

              <RigGraphExportPanel
                graphFileName={graphFileName}
                onGraphFileNameChange={handleGraphFileNameChange}
                canExport={canExport}
                onExportGraph={exportGraph}
              />

              <div className="h-px bg-border-default/50" />

              <PoseRigImportPanel
                onImportPoseConfig={(file) => importPoseConfigFile(file)}
                onImportPoseGraph={(file) => onImportPoseGraph(file)}
                onImportPoseIr={(file) => importPoseIrFile(file)}
                poseConfigWarnings={poseRig.poseConfigWarnings}
                poseDiagnostics={poseRig.poseDiagnostics}
                poseIrEnabled={canImportPoseIr}
                poseIrSupportHint={poseIrSupportHint}
                disabled={!poseRig.ready}
              />

              <div className="h-px bg-border-default/50" />

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
                poseIrFileName={poseIrFileName}
                onPoseIrFileNameChange={handlePoseIrFileNameChange}
                onExportPoseIr={() => {
                  void exportPoseIrFile();
                }}
                poseDiagnostics={poseRig.poseDiagnostics}
                poseIrEnabled={canExportPoseIr}
                poseIrSupportHint={poseIrSupportHint}
                disabled={!poseRig.ready}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

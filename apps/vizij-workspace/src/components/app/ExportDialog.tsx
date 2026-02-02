import { useState, useMemo, useCallback } from "react";
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
import { ExportPanel } from "./ExportPanel";
import { RigGraphExportPanel } from "./RigGraphExportPanel";
import { PoseRigExportPanel } from "./PoseRigPanels";
import type { VizijBundleSummary } from "./VizijBundleSummaryPanel";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  rootId: string | null;
  sourceName: string | null;
  loadedBundle: VizijBundleExtension | null;
  canExport: boolean;
  onImportPoseGraph: (file: File) => Promise<void>;
}

export function ExportDialog({
  open,
  onClose,
  rootId,
  sourceName,
  loadedBundle,
  canExport,
  onImportPoseGraph,
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
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();
  const { includeVizijBundle, includeImportedAnimations } = uiState;
  const { alert: showAlert } = useDialogQueue();
  const poseRig = usePoseRig();

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

  return (
    <Modal open={open} onClose={onClose} title="Export Settings" maxWidth="2xl">
      <div className="space-y-6">
        <div className="space-y-4">
          <InstructionCallout
            label="Export best practices"
            summary="Name files clearly and trim payloads as needed"
            size="compact"
          >
            <ul className="list-disc pl-4 text-[11px] text-slate-400 space-y-1 font-medium">
              <li>
                Name exports after milestones (e.g.{" "}
                <code className="text-blue-400">robot_v2_audit.glb</code>).
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
        </div>

        <div className="pt-2 border-t border-white/5">
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-950 border border-white/5 transition-all group"
            onClick={() => setIsAdvancedOpen((current) => !current)}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center bg-slate-800 text-slate-400 transition-transform duration-200",
                  isAdvancedOpen && "rotate-90",
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-200 uppercase tracking-wider">
                Advanced Export Options
              </span>
            </div>
            {isAdvancedOpen && (
              <span className="text-[10px] font-medium text-slate-500">
                Legacy formats
              </span>
            )}
          </button>

          {isAdvancedOpen && (
            <div className="mt-4 p-4 rounded-xl bg-slate-950/30 border border-white/5 space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <div className="mt-1 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                  Legacy rig graph and pose rig files remain available when
                  required for backward compatibility or specialized pipelines.
                </p>
              </div>

              <RigGraphExportPanel
                graphFileName={graphFileName}
                onGraphFileNameChange={handleGraphFileNameChange}
                canExport={canExport}
                onExportGraph={exportGraph}
              />

              <div className="h-px bg-white/5" />

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
          )}
        </div>
      </div>
    </Modal>
  );
}

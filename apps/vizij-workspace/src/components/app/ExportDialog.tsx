import { useState, useMemo, useCallback } from "react";
import { useVizijStore } from "@vizij/render";
import { useDialogQueue } from "@vizij/authoring-shared";
import type { VizijBundleExtension } from "@vizij/render";
import {
    useBindingAuthoring,
    useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useAuthoringFileNames } from "../../hooks/useAuthoringFileNames";
import { useVizijExport } from "../../hooks/useVizijExport";
import { usePoseRig } from "../../state/PoseRigProvider";
import { Dialog } from "../ui/Dialog";
import { ExportPanel } from "./ExportPanel";
import { RigGraphExportPanel } from "./RigGraphExportPanel";
import { PoseRigExportPanel } from "./PoseRigPanels";
import { InstructionCallout } from "../common/InstructionCallout";
import { useAuthoringUiActions, useAuthoringUiState } from "../../state/AuthoringUiProvider";
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
    onImportPoseGraph
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
        <Dialog open={open} onClose={onClose} title="Export">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <InstructionCallout
                        label="Export best practices"
                        summary="Name files clearly and trim payloads as needed"
                        size="compact"
                    >
                        <ul className="list-disc pl-4 text-xs text-[var(--color-slate-400)] space-y-1">
                            <li>
                                Name exports after milestones (e.g.{" "}
                                <code>robot_v2_audit.glb</code>).
                            </li>
                            <li>
                                Disable Vizij bundle or animation payloads when you only need
                                the base GLB mesh.
                            </li>
                            <li>
                                Exports always reflect the current in-memory bundle.
                            </li>
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

                <div className="border-t border-[var(--border-subtle)] pt-4">
                    <button
                        type="button"
                        className="text-xs text-[var(--color-slate-500)] hover:text-[var(--color-slate-300)] flex items-center gap-2 mb-4"
                        onClick={() => setIsAdvancedOpen((current) => !current)}
                    >
                        {isAdvancedOpen ? "▼" : "▶"} {isAdvancedOpen ? "Hide Advanced Options" : "Show Advanced Options"}
                    </button>

                    {isAdvancedOpen && (
                        <div className="flex flex-col gap-4">
                            <p className="text-xs text-[var(--color-slate-500)] mb-2">
                                Legacy rig graph and pose rig files remain available when required.
                            </p>
                            <RigGraphExportPanel
                                graphFileName={graphFileName}
                                onGraphFileNameChange={handleGraphFileNameChange}
                                canExport={canExport}
                                onExportGraph={exportGraph}
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
                    )}
                </div>
            </div>
        </Dialog>
    );
}

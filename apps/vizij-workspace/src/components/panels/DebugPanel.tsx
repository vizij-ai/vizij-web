import { useCallback, useEffect, useMemo, useState } from "react";
import { StudioPanel } from "../ui/StudioPanel";
import { useGraphRuntime, useBindingAuthoring } from "../../state/RigControllerProvider";
import { Tabs, Chip, Button } from "../ui";
import type { VizijBundleExtension, LoadedVizijAsset } from "@vizij/render";
import { InstructionCallout } from "../common/InstructionCallout";
import { RobotDataAuditPanel } from "../app/RobotDataAuditPanel";
import { VizijBundleAuditPanel } from "../app/VizijBundleAuditPanel";
import { GraphDiagnosticsPanel } from "../app/GraphDiagnosticsPanel";
import { useRobotDataAuditRunner } from "../../hooks/useRobotDataAuditRunner";
import { useBundleAudit } from "../../hooks/useBundleAudit";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { useDialogQueue } from "@vizij/authoring-shared";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import { cloneSerializable } from "../../utils/serialization";
import type { GraphSpec } from "@vizij/node-graph-wasm";

type HealthTabId =
    | "playback"
    | "robot-audit"
    | "bundle-audit"
    | "diagnostics"
    | "maintenance";

const HEALTH_TABS: ReadonlyArray<{ id: HealthTabId; label: string }> = [
    { id: "playback", label: "Playback" },
    { id: "robot-audit", label: "RobotData" },
    { id: "bundle-audit", label: "Bundle Graphs" },
    { id: "diagnostics", label: "Graph Diagnostics" },
    { id: "maintenance", label: "Rig Maintenance" },
];

interface DebugPanelProps {
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
    isLoading: boolean;
    error: string | null;
}

export function DebugPanel({
    rootId,
    sourceName,
    loadedBundle,
    updateBundle,
    isLoading,
    error
}: DebugPanelProps) {
    const [activeTab, setActiveTab] = useState<HealthTabId>("playback");

    // Graph Runtime Hook
    const graphStatus = useGraphRuntime((state) => state.graphStatus);
    const faceId = useGraphRuntime((state) => state.faceId);
    const faceSegment = useGraphRuntime((state) => state.faceSegment);
    const handleFaceIdChange = useGraphRuntime((state) => state.handleFaceIdChange);
    const graphTimeSeconds = useGraphRuntime((state) => state.graphTimeSeconds);
    const graphFrameRate = useGraphRuntime((state) => state.graphFrameRate);
    const graphPlaybackState = useGraphRuntime((state) => state.graphPlaybackState);
    const playGraph = useGraphRuntime((state) => state.playGraph);
    const pauseGraph = useGraphRuntime((state) => state.pauseGraph);
    const stopGraph = useGraphRuntime((state) => state.stopGraph);
    const stepGraph = useGraphRuntime((state) => state.stepGraph);
    const world = useGraphRuntime((state) => state.world);
    const animatables = useGraphRuntime((state) => state.animatables);

    // Binding Authoring Hook
    const validOutputTargets = useBindingAuthoring((state) => state.validOutputTargets);
    const handleClearCachedState = useBindingAuthoring((state) => state.handleClearCachedState);
    const handleResetAllInputs = useBindingAuthoring((state) => state.handleResetAllInputValues);

    const {
        alert: showAlert,
        confirm: showConfirm,
        prompt: showPrompt,
    } = useDialogQueue();

    // Robot Data Audit Logic
    const robotAudit = useRobotDataAuditRunner({
        namespace: DEFAULT_NAMESPACE,
        world,
        animatables,
        enabled: Boolean(rootId),
    });
    const canRunRobotDataAudit = Boolean(rootId) && !isLoading;

    // Bundle Audit Logic
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

    // Callbacks for Bundle Audit
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


    // Playback Logic
    const formattedGraphTime = useMemo(
        () => formatGraphClock(graphTimeSeconds),
        [graphTimeSeconds],
    );

    const formattedFrameRate = useMemo(() => {
        return graphFrameRate > 0 ? `${graphFrameRate.toFixed(1)} fps` : "— fps";
    }, [graphFrameRate]);

    const handleTogglePlayback = () => {
        if (graphPlaybackState === "playing") {
            pauseGraph();
        } else {
            playGraph();
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case "playback":
                return (
                    <div className="flex flex-col gap-4 text-xs font-mono p-1">
                        {/* Status Section */}
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Status</span>
                                <span className={graphStatus === "ready" ? "text-green-400" : "text-yellow-400"}>
                                    {graphStatus}
                                </span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Face ID</span>
                                    <input
                                        className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded px-2 py-1 text-sm w-32"
                                        value={faceId}
                                        onChange={(e) => handleFaceIdChange(e.target.value)}
                                    />
                                </div>
                                {faceSegment && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500">Segment</span>
                                        <Chip tone="info">{faceSegment}</Chip>
                                    </div>
                                )}
                                <Button
                                    variant="secondary"
                                    onClick={handleResetAllInputs}
                                    className="w-full mt-1 h-6"
                                    size="sm"
                                >
                                    Reset Inputs
                                </Button>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="pt-4 border-t border-[var(--border-default)] space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">Graph Time</span>
                                <span className="text-slate-200 font-bold">{formattedGraphTime}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400">FPS</span>
                                <span>{formattedFrameRate}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <button
                                    onClick={handleTogglePlayback}
                                    className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                                    disabled={graphStatus !== "ready"}
                                >
                                    {graphPlaybackState === "playing" ? "Pause" : "Play"}
                                </button>
                                <button
                                    onClick={stopGraph}
                                    className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                                    disabled={graphStatus !== "ready"}
                                >
                                    Stop
                                </button>
                                <button
                                    onClick={stepGraph}
                                    className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                                    disabled={graphStatus !== "ready"}
                                >
                                    Step
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case "robot-audit":
                return (
                    <div className="flex flex-col gap-4">
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
                    <div className="flex flex-col gap-4">
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
                    <div className="flex flex-col gap-4">
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
                    <div className="flex flex-col gap-4">
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
        <StudioPanel title="Debug Panel">
            <div className="flex flex-col h-full overflow-hidden">
                <div className="p-2 border-b border-[var(--border-default)] bg-[var(--bg-panel-header)]">
                    <Tabs
                        value={activeTab}
                        onValueChange={(id) => setActiveTab(id as HealthTabId)}
                        items={HEALTH_TABS}
                        className="health-tabs"
                        listClassName="health-tabs__button-row w-full grid grid-cols-5 gap-1"
                        panelClassName="health-tabs__panel mt-0"
                        renderPanel={() => null}
                        size="sm"
                        variant="pill"
                    />
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {renderTabContent()}
                </div>
            </div>
        </StudioPanel>
    );
}

function formatGraphClock(value: number): string {
    if (!Number.isFinite(value)) {
        return "00:00.00";
    }
    const seconds = Math.max(value, 0);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${remaining
        .toFixed(2)
        .padStart(5, "0")}`;
}

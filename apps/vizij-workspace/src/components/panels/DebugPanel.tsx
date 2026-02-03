import { useCallback, useMemo, useState } from "react";
import type { VizijBundleExtension } from "@vizij/render";
import { useDialogQueue } from "@vizij/authoring-shared";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  Activity,
  Play,
  Pause,
  Square,
  Bug,
  FileCheck,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { Panel } from "../ui/Panel";
import {
  useGraphRuntime,
  useBindingAuthoring,
} from "../../state/RigControllerProvider";
import { Tabs, Chip, Button } from "../ui";
import { InstructionCallout } from "../common/InstructionCallout";
import { RobotDataAuditPanel } from "../app/RobotDataAuditPanel";
import { VizijBundleAuditPanel } from "../app/VizijBundleAuditPanel";
import { GraphDiagnosticsPanel } from "../app/GraphDiagnosticsPanel";
import { useRobotDataAuditRunner } from "../../hooks/useRobotDataAuditRunner";
import { useBundleAudit } from "../../hooks/useBundleAudit";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { cn } from "../../utils/cn";
import { cloneSerializable } from "../../utils/serialization";

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
}

export function DebugPanel({
  rootId,
  loadedBundle,
  updateBundle,
  isLoading,
}: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<HealthTabId>("playback");

  // Graph Runtime Hook
  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const faceId = useGraphRuntime((state) => state.faceId);
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );
  const graphTimeSeconds = useGraphRuntime((state) => state.graphTimeSeconds);
  const graphFrameRate = useGraphRuntime((state) => state.graphFrameRate);
  const graphPlaybackState = useGraphRuntime(
    (state) => state.graphPlaybackState,
  );
  const playGraph = useGraphRuntime((state) => state.playGraph);
  const pauseGraph = useGraphRuntime((state) => state.pauseGraph);
  const stopGraph = useGraphRuntime((state) => state.stopGraph);
  const stepGraph = useGraphRuntime((state) => state.stepGraph);
  const world = useGraphRuntime((state) => state.world);
  const animatables = useGraphRuntime((state) => state.animatables);

  // Binding Authoring Hook
  const validOutputTargets = useBindingAuthoring(
    (state) => state.validOutputTargets,
  );
  const handleClearCachedState = useBindingAuthoring(
    (state) => state.handleClearCachedState,
  );
  const handleResetAllInputs = useBindingAuthoring(
    (state) => state.handleResetAllInputValues,
  );

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

  return (
    <Panel
      title="Debug Panel"
      description="Monitor status, playback, and rig health."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      badge={
        graphStatus === "ready" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
            <Activity className="w-3 h-3" /> READY
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col h-full overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(id) => setActiveTab(id as HealthTabId)}
          items={HEALTH_TABS}
          className="flex flex-col h-full overflow-hidden gap-0"
          listClassName="flex-none px-1 pb-2 border-b border-border-default bg-bg-panel pt-1"
          panelClassName="flex-1 overflow-y-auto p-4 custom-scrollbar bg-bg-secondary/20"
          size="sm"
          variant="underline"
          renderPanel={(tabId) => {
            switch (tabId) {
              case "playback":
                return (
                  <div className="flex flex-col gap-5 text-xs font-mono">
                    {/* Status Detail */}
                    <div className="p-4 rounded-xl bg-bg-panel border border-border-default space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-border-default">
                        <span className="text-text-muted font-medium">
                          Engine Status
                        </span>
                        <span
                          className={cn(
                            "font-bold uppercase tracking-wider text-[10px]",
                            graphStatus === "ready"
                              ? "text-green-400"
                              : "text-yellow-400",
                          )}
                        >
                          {graphStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase text-text-muted font-bold">
                            Face ID
                          </span>
                          <input
                            className="w-full bg-bg-input border border-border-default rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent font-mono text-center"
                            value={faceId}
                            onChange={(e) => handleFaceIdChange(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase text-text-muted font-bold">
                            Segment
                          </span>
                          <div className="h-[29px] flex items-center">
                            {faceSegment ? (
                              <Chip
                                tone="info"
                                className="w-full justify-center"
                              >
                                {faceSegment}
                              </Chip>
                            ) : (
                              <span className="text-text-muted italic px-2">
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        onClick={handleResetAllInputs}
                        className="w-full h-8 text-xs font-medium"
                        size="sm"
                      >
                        Reset All Inputs
                      </Button>
                    </div>

                    {/* Playback Controls */}
                    <div className="p-4 rounded-xl bg-bg-panel border border-border-default space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1 items-center p-3 rounded-lg bg-bg-secondary/30 border border-border-default">
                          <span className="text-[10px] uppercase text-text-muted font-bold">
                            Runtime
                          </span>
                          <span className="text-text-primary font-bold text-lg font-mono tracking-tight">
                            {formattedGraphTime}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 items-center p-3 rounded-lg bg-bg-secondary/30 border border-border-default">
                          <span className="text-[10px] uppercase text-text-muted font-bold">
                            Performance
                          </span>
                          <span className="text-text-secondary font-bold text-lg font-mono tracking-tight">
                            {formattedFrameRate}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant={
                            graphPlaybackState === "playing"
                              ? "secondary"
                              : "primary"
                          }
                          onClick={handleTogglePlayback}
                          disabled={graphStatus !== "ready"}
                          size="sm"
                          className="flex-1 h-9 font-bold"
                        >
                          {graphPlaybackState === "playing" ? (
                            <>
                              <Pause className="w-3.5 h-3.5 mr-2 fill-current" />{" "}
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 mr-2 fill-current" />{" "}
                              Play
                            </>
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={stepGraph}
                          disabled={graphStatus !== "ready"}
                          size="sm"
                          className="h-9 px-4 font-medium"
                          title="Step Frame"
                        >
                          <span className="sr-only">Step</span>
                          Step
                        </Button>
                        <Button
                          variant="danger"
                          onClick={stopGraph}
                          disabled={graphStatus !== "ready"}
                          size="sm"
                          className="h-9 px-4 font-medium"
                          title="Stop"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              case "robot-audit":
                return (
                  <div className="flex flex-col gap-4">
                    <InstructionCallout
                      label="RobotData Audit"
                      summary="Catch node drift after edits or merges"
                      size="compact"
                      icon={<Bug className="w-4 h-4 text-amber-500" />}
                    >
                      <ul className="list-disc pl-4 space-y-1 text-text-secondary text-[11px] leading-relaxed">
                        <li>
                          Run the audit whenever meshes, skeletons, or RobotData
                          sources are edited outside Vizij.
                        </li>
                        <li>
                          Results become stale after a new GLB load—rerun before
                          exporting so you compare current data.
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
                      label="Bundle Graphs"
                      summary="Keep GraphSpecs + IR aligned"
                      size="compact"
                      icon={<FileCheck className="w-4 h-4 text-accent" />}
                    >
                      <ol className="list-decimal pl-4 space-y-1 text-text-secondary text-[11px] leading-relaxed">
                        <li>
                          Click Refresh to rebuild graphs and record diffs.
                        </li>
                        <li>
                          Use Overwrite to push compiled specs back into the
                          bundle so future loads stay clean.
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
                      label="Graph Diagnostics"
                      summary="Capture machine reports + IR snapshots"
                      size="compact"
                      icon={<Stethoscope className="w-4 h-4 text-green-500" />}
                    >
                      <ol className="list-decimal pl-4 space-y-1 text-text-secondary text-[11px] leading-relaxed">
                        <li>
                          Generate a machine report after large binding changes
                          to capture slot metadata.
                        </li>
                        <li>
                          Download IR snapshots to diff builds or attach to bug
                          reports.
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
                      label="Rig Maintenance"
                      summary="Clear overrides and cache"
                      size="compact"
                      icon={<Wrench className="w-4 h-4 text-text-muted" />}
                    >
                      <ul className="list-disc pl-4 space-y-1 text-text-secondary text-[11px] leading-relaxed">
                        <li>
                          Clear cached data if bindings or driver states stop
                          matching.
                        </li>
                        <li>
                          This wipes stored inputs, bindings, and overrides for
                          the current asset only.
                        </li>
                      </ul>
                    </InstructionCallout>
                    <div className="p-4 bg-bg-panel border border-border-default rounded-xl space-y-3">
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Clears stored overrides for the currently loaded Vizij
                        asset. This is useful if authoring states become
                        desynced.
                      </p>
                      <Button
                        variant="danger"
                        className="w-full"
                        size="sm"
                        onClick={() => {
                          void handleClearCachedRig();
                        }}
                      >
                        Clear cached rig data
                      </Button>
                    </div>
                  </div>
                );
              default:
                return null;
            }
          }}
        />
      </div>
    </Panel>
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

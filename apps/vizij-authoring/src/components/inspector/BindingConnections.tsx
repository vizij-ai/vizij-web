import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link as LinkIcon,
  Box,
  Sparkles,
  Route,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  useBindingAuthoring,
  useSelectionStore,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { usePoseRig } from "../../state/PoseRigProvider";
import { usePoseRigStore } from "../../poseRig/store";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Button, Chip } from "../ui";
import {
  buildPoseRigFaceTrace,
  buildPoseRigTraversalPaths,
  findPoseRigTraversalNode,
  movePoseRigTraversalSelection,
  resolvePoseRigTraversalSelection,
  selectSafePoseRigTraceSuggestions,
  summarizeTraceConnections,
  type PoseRigTraceSuggestion,
  type PoseRigTraversalNode,
  type PoseRigTraversalSelection,
  type PoseRigSourceKind,
  type PoseRigFaceTraceTarget,
} from "./rigConnections";

const poseSourceKindLabels: Record<string, string> = {
  "pose-entry": "Pose entry",
  "pose-group-output": "Pose group output",
  "pose-aggregate-output": "Pose aggregate output",
};

const traversalStageLabels: Record<PoseRigTraversalNode["kind"], string> = {
  pose: "Pose",
  rig: "Rig",
  autorig: "Autorig",
  animatable: "Animatable",
};

interface BindingConnectionsProps {
  node: SceneObjectNode;
  onSelectPose?: (poseId: string) => void;
  onSelectRig?: (rigId: string, sourceKind?: PoseRigSourceKind) => void;
  onSelectTarget?: (targetId: string) => void;
}

export function BindingConnections({
  node,
  onSelectPose,
  onSelectRig,
  onSelectTarget,
}: BindingConnectionsProps) {
  const bindings = useBindingAuthoring((state) => state.bindings);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const animatables = useGraphRuntime((state) => state.animatables);
  const handleCreateParentDriverBinding = useBindingAuthoring(
    (state) => state.handleCreateParentDriverBinding,
  );
  const handleUnlinkChildInput = useBindingAuthoring(
    (state) => state.handleUnlinkChildInput,
  );

  const { selectPose, updatePoseValue, removePoseInput } = usePoseRig();
  const poses = usePoseRigStore((state) => state.poses);
  const neutralInputs = usePoseRigStore((state) => state.neutralInputs);

  const { handleClearSelection } = useSelectionStore();
  const { objects } = useSceneComposer();

  const trace = useMemo(
    () =>
      buildPoseRigFaceTrace({
        node,
        objects,
        bindings,
        inputBindings,
        poses,
        neutralInputs,
        standardInputsById,
      }),
    [
      bindings,
      inputBindings,
      neutralInputs,
      node,
      objects,
      poses,
      standardInputsById,
    ],
  );

  const connections = useMemo(
    () => summarizeTraceConnections(trace.targets, standardInputsById),
    [standardInputsById, trace.targets],
  );
  const traversalPaths = useMemo(
    () =>
      buildPoseRigTraversalPaths({
        traceTargets: trace.targets,
        standardInputsById,
      }),
    [standardInputsById, trace.targets],
  );
  const [traversalSelection, setTraversalSelection] =
    useState<PoseRigTraversalSelection | null>(() =>
      resolvePoseRigTraversalSelection(traversalPaths, null),
    );
  const activeTraversalPath = useMemo(() => {
    const resolved = resolvePoseRigTraversalSelection(
      traversalPaths,
      traversalSelection,
    );
    if (!resolved) {
      return null;
    }
    return (
      traversalPaths.find((path) => path.targetId === resolved.targetId) ?? null
    );
  }, [traversalPaths, traversalSelection]);
  const activeTraversalNode = useMemo(
    () => findPoseRigTraversalNode(traversalPaths, traversalSelection),
    [traversalPaths, traversalSelection],
  );
  const activeTraversalNodeIndex = useMemo(() => {
    if (!activeTraversalPath || !activeTraversalNode) {
      return -1;
    }
    return activeTraversalPath.nodes.findIndex(
      (node) => node.id === activeTraversalNode.id,
    );
  }, [activeTraversalNode, activeTraversalPath]);

  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewSuggestionId, setPreviewSuggestionId] = useState<string | null>(
    null,
  );
  const [lastUndoAction, setLastUndoAction] = useState<{
    appliedIds: string[];
    label: string;
    rollback: () => void;
  } | null>(null);
  const [traceFeedback, setTraceFeedback] = useState<string | null>(null);

  const [expandedPoseIds, setExpandedPoseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedRigIds, setExpandedRigIds] = useState<Set<string>>(
    () => new Set(),
  );

  const getPrimaryRigSourceKind = useCallback(
    (sourceKinds: PoseRigSourceKind[]) => {
      if (sourceKinds.includes("pose-aggregate-output")) {
        return "pose-aggregate-output";
      }
      if (sourceKinds.includes("pose-group-output")) {
        return "pose-group-output";
      }
      return "pose-entry";
    },
    [],
  );

  const getTargetRigSourceKind = useCallback(
    (target: PoseRigFaceTraceTarget, rigId: string): PoseRigSourceKind => {
      const aggregateRigInputId =
        target.upstreamRigInputIds.length > 0
          ? target.upstreamRigInputIds[target.upstreamRigInputIds.length - 1]
          : null;
      if (target.directRigInputIds.includes(rigId)) {
        return "pose-entry";
      }
      if (target.upstreamRigInputIds.includes(rigId)) {
        if (
          aggregateRigInputId === rigId &&
          target.directRigInputIds.length > 0
        ) {
          return "pose-aggregate-output";
        }
        return "pose-group-output";
      }
      return "pose-group-output";
    },
    [],
  );

  const togglePoseExpansion = useCallback((id: string) => {
    setExpandedPoseIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRigExpansion = useCallback((id: string) => {
    setExpandedRigIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyTraceSuggestion = useCallback(
    (suggestion: PoseRigTraceSuggestion) => {
      if (suggestion.kind === "link-parent-binding") {
        handleCreateParentDriverBinding(
          suggestion.childInputId,
          suggestion.upstreamInputId,
        );
        handleSelectRig(suggestion.childInputId);
        handleClearSelection();
        return {
          applied: true,
          rollback: () => {
            handleUnlinkChildInput(
              suggestion.upstreamInputId,
              suggestion.childInputId,
            );
          },
          label: `${suggestion.poseName}: ${suggestion.upstreamInputId} -> ${suggestion.childInputId}`,
        };
      }

      const pose = poses.find((entry) => entry.id === suggestion.poseId);
      if (!pose) {
        return { applied: false };
      }
      const currentValue = pose.values[suggestion.fromInputId];
      if (currentValue === undefined) {
        return { applied: false };
      }
      const previousTargetValue = pose.values[suggestion.toInputId];
      const fromNeutral = neutralInputs[suggestion.fromInputId] ?? 0;
      const toNeutral = neutralInputs[suggestion.toInputId] ?? 0;
      const remappedValue = toNeutral + (currentValue - fromNeutral);
      updatePoseValue(suggestion.poseId, suggestion.toInputId, remappedValue);
      removePoseInput(suggestion.poseId, suggestion.fromInputId);
      selectPose(suggestion.poseId);
      handleClearSelection();
      return {
        applied: true,
        rollback: () => {
          updatePoseValue(
            suggestion.poseId,
            suggestion.fromInputId,
            currentValue,
          );
          if (previousTargetValue === undefined) {
            removePoseInput(suggestion.poseId, suggestion.toInputId);
          } else {
            updatePoseValue(
              suggestion.poseId,
              suggestion.toInputId,
              previousTargetValue,
            );
          }
        },
        label: `${suggestion.poseName}: ${suggestion.fromInputId} -> ${suggestion.toInputId}`,
      };
    },
    [
      handleClearSelection,
      handleCreateParentDriverBinding,
      handleUnlinkChildInput,
      handleSelectRig,
      neutralInputs,
      poses,
      removePoseInput,
      selectPose,
      updatePoseValue,
    ],
  );

  useEffect(() => {
    const liveIds = new Set(
      trace.suggestedFixes.map((suggestion) => suggestion.id),
    );
    setAppliedSuggestionIds((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
    setIgnoredSuggestionIds((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
    if (previewSuggestionId && !liveIds.has(previewSuggestionId)) {
      setPreviewSuggestionId(null);
    }
  }, [previewSuggestionId, trace.suggestedFixes]);

  useEffect(() => {
    setTraversalSelection((current) =>
      resolvePoseRigTraversalSelection(traversalPaths, current),
    );
  }, [traversalPaths]);

  useEffect(() => {
    if (!traceFeedback) {
      return;
    }
    const timer = window.setTimeout(() => setTraceFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [traceFeedback]);

  const visibleSuggestions = useMemo(
    () =>
      trace.suggestedFixes.filter(
        (suggestion) => !ignoredSuggestionIds.has(suggestion.id),
      ),
    [ignoredSuggestionIds, trace.suggestedFixes],
  );

  const previewSuggestion = useMemo(
    () =>
      visibleSuggestions.find(
        (suggestion) => suggestion.id === previewSuggestionId,
      ) ?? null,
    [previewSuggestionId, visibleSuggestions],
  );

  const suggestionsByKind = useMemo(
    () => ({
      linkParent: visibleSuggestions.filter(
        (suggestion) => suggestion.kind === "link-parent-binding",
      ),
      retarget: visibleSuggestions.filter(
        (suggestion) => suggestion.kind === "retarget-pose-output",
      ),
    }),
    [visibleSuggestions],
  );

  const safeBulkSuggestions = useMemo(
    () => selectSafePoseRigTraceSuggestions(visibleSuggestions, 0.6),
    [visibleSuggestions],
  );

  const unappliedSafeBulkSuggestions = useMemo(
    () =>
      safeBulkSuggestions.filter(
        (suggestion) => !appliedSuggestionIds.has(suggestion.id),
      ),
    [appliedSuggestionIds, safeBulkSuggestions],
  );

  const handleApplySuggestion = useCallback(
    (suggestion: PoseRigTraceSuggestion) => {
      const result = applyTraceSuggestion(suggestion);
      if (!result.applied) {
        setTraceFeedback(
          `Suggestion no longer applies: ${suggestion.poseName} ${suggestion.kind}`,
        );
        return;
      }
      setAppliedSuggestionIds((current) => {
        const next = new Set(current);
        next.add(suggestion.id);
        return next;
      });
      if (result.rollback) {
        setLastUndoAction({
          appliedIds: [suggestion.id],
          label: result.label ?? suggestion.id,
          rollback: result.rollback,
        });
      }
      setPreviewSuggestionId(null);
      setTraceFeedback(
        suggestion.kind === "link-parent-binding"
          ? `Applied link: ${suggestion.upstreamInputId} -> ${suggestion.childInputId}`
          : `Applied retarget: ${suggestion.fromInputId} -> ${suggestion.toInputId}`,
      );
    },
    [applyTraceSuggestion],
  );

  const handleApplySafeSuggestions = useCallback(() => {
    if (unappliedSafeBulkSuggestions.length === 0) {
      setTraceFeedback("No unapplied safe suggestions available.");
      return;
    }
    let appliedCount = 0;
    let skippedCount = 0;
    const appliedIds: string[] = [];
    const rollbackStack: Array<() => void> = [];
    unappliedSafeBulkSuggestions.forEach((suggestion) => {
      const result = applyTraceSuggestion(suggestion);
      if (result.applied) {
        appliedCount += 1;
        appliedIds.push(suggestion.id);
        if (result.rollback) {
          rollbackStack.push(result.rollback);
        }
      } else {
        skippedCount += 1;
      }
    });
    if (appliedIds.length > 0) {
      setAppliedSuggestionIds((current) => {
        const next = new Set(current);
        appliedIds.forEach((id) => next.add(id));
        return next;
      });
    }
    if (appliedCount > 0) {
      if (rollbackStack.length > 0) {
        setLastUndoAction({
          appliedIds,
          label: `Bulk safe apply (${appliedCount})`,
          rollback: () => {
            for (let index = rollbackStack.length - 1; index >= 0; index -= 1) {
              rollbackStack[index]?.();
            }
          },
        });
      }
      setTraceFeedback(
        skippedCount > 0
          ? `Applied ${appliedCount} safe fixes (${skippedCount} skipped as stale).`
          : `Applied ${appliedCount} safe fixes.`,
      );
      return;
    }
    setTraceFeedback("Safe suggestions were stale and could not be applied.");
  }, [applyTraceSuggestion, unappliedSafeBulkSuggestions]);

  const handleIgnoreSuggestion = useCallback(
    (suggestionId: string) => {
      setIgnoredSuggestionIds((current) => {
        const next = new Set(current);
        next.add(suggestionId);
        return next;
      });
      if (previewSuggestionId === suggestionId) {
        setPreviewSuggestionId(null);
      }
    },
    [previewSuggestionId],
  );

  const handleUndoLast = useCallback(() => {
    if (!lastUndoAction) {
      return;
    }
    lastUndoAction.rollback();
    setAppliedSuggestionIds((current) => {
      let changed = false;
      const next = new Set(current);
      lastUndoAction.appliedIds.forEach((id) => {
        if (next.delete(id)) {
          changed = true;
        }
      });
      if (!changed) {
        return current;
      }
      return next;
    });
    setTraceFeedback(`Undid: ${lastUndoAction.label}`);
    setLastUndoAction(null);
  }, [lastUndoAction]);

  const routeTraversalNode = useCallback(
    (node: PoseRigTraversalNode) => {
      if (node.kind === "pose" && node.poseId) {
        if (onSelectPose) {
          onSelectPose(node.poseId);
        } else {
          selectPose(node.poseId);
          handleClearSelection();
        }
        return;
      }
      if ((node.kind === "rig" || node.kind === "autorig") && node.rigId) {
        const sourceKind: PoseRigSourceKind =
          node.kind === "rig" ? "pose-group-output" : "pose-entry";
        if (onSelectRig) {
          onSelectRig(node.rigId, sourceKind);
        } else {
          handleSelectRig(node.rigId);
          handleClearSelection();
        }
        return;
      }
      if (node.kind === "animatable" && node.targetId && onSelectTarget) {
        onSelectTarget(node.targetId);
      }
    },
    [
      handleClearSelection,
      handleSelectRig,
      onSelectPose,
      onSelectRig,
      onSelectTarget,
      selectPose,
    ],
  );

  const handleSetTraversalTarget = useCallback(
    (targetId: string) => {
      setTraversalSelection((current) => {
        const targetPath = traversalPaths.find(
          (path) => path.targetId === targetId,
        );
        if (!targetPath) {
          return resolvePoseRigTraversalSelection(traversalPaths, current);
        }
        if (current) {
          const matchingNode = targetPath.nodes.find(
            (node) => node.id === current.nodeId,
          );
          if (matchingNode) {
            return {
              targetId,
              nodeId: matchingNode.id,
            };
          }
        }
        const fallbackNode =
          targetPath.nodes[targetPath.nodes.length - 1] ??
          targetPath.nodes[0] ??
          null;
        return fallbackNode
          ? {
              targetId,
              nodeId: fallbackNode.id,
            }
          : null;
      });
    },
    [traversalPaths],
  );

  const handleTraverseDirection = useCallback(
    (direction: "upstream" | "downstream") => {
      setTraversalSelection((current) => {
        const next = movePoseRigTraversalSelection(
          traversalPaths,
          current,
          direction,
        );
        const nextNode = findPoseRigTraversalNode(traversalPaths, next);
        if (nextNode) {
          routeTraversalNode(nextNode);
        }
        return next;
      });
    },
    [routeTraversalNode, traversalPaths],
  );

  if (
    connections.rigs.length === 0 &&
    connections.poses.length === 0 &&
    trace.targets.length === 0 &&
    trace.unmatchedPoseOutputs.length === 0 &&
    trace.suggestedFixes.length === 0
  )
    return null;

  return (
    <div className="flex flex-col gap-3 p-2 mt-2 border-t border-border-default/50">
      <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
        <LinkIcon size={10} />
        My Driver Chain
      </label>

      {traversalPaths.length > 0 &&
        activeTraversalPath &&
        activeTraversalNode && (
          <div className="rounded border border-border-default/50 bg-bg-panel/30 px-2 py-1.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide">
                Traversal
              </span>
              {traversalPaths.length > 1 ? (
                <select
                  className="text-[9px] rounded border border-border-default/50 bg-bg-panel/40 px-1 py-0.5"
                  value={activeTraversalPath.targetId}
                  onChange={(event) =>
                    handleSetTraversalTarget(event.target.value)
                  }
                  data-testid="binding-traversal-target-select"
                >
                  {traversalPaths.map((path) => (
                    <option key={path.targetId} value={path.targetId}>
                      {path.targetLabel}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[9px] px-2"
                disabled={activeTraversalNodeIndex <= 0}
                onClick={() => handleTraverseDirection("upstream")}
                data-testid="binding-traversal-upstream"
              >
                Upstream
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[9px] px-2"
                disabled={
                  activeTraversalNodeIndex < 0 ||
                  activeTraversalNodeIndex >=
                    activeTraversalPath.nodes.length - 1
                }
                onClick={() => handleTraverseDirection("downstream")}
                data-testid="binding-traversal-downstream"
              >
                Downstream
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {activeTraversalPath.nodes.map((node) => (
                <button
                  key={`${activeTraversalPath.targetId}:${node.id}`}
                  type="button"
                  className="px-1.5 py-0.5 rounded border text-[9px] text-left transition-colors border-border-default/40 bg-bg-panel/20 hover:border-accent/50 hover:text-accent"
                  data-active={
                    node.id === activeTraversalNode.id ? "true" : undefined
                  }
                  onClick={() => {
                    setTraversalSelection({
                      targetId: activeTraversalPath.targetId,
                      nodeId: node.id,
                    });
                    routeTraversalNode(node);
                  }}
                >
                  <span className="font-semibold">
                    {traversalStageLabels[node.kind]}
                  </span>
                  <span className="opacity-80"> · {node.label}</span>
                </button>
              ))}
            </div>
            <div className="text-[9px] text-text-muted">
              Current stage:{" "}
              <span
                className="font-semibold text-text-primary"
                data-testid="binding-traversal-current-kind"
              >
                {traversalStageLabels[activeTraversalNode.kind]}
              </span>{" "}
              <code data-testid="binding-traversal-current-label">
                {activeTraversalNode.label}
              </code>
            </div>
          </div>
        )}

      <div className="flex flex-col gap-1.5">
        {/* Poses First as they are higher level */}
        {connections.poses.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-600 font-medium px-1">
              POSES
            </span>
            {connections.poses.map((pose) => {
              const isExpanded = expandedPoseIds.has(pose.id);
              const affectedTargets = trace.targets.filter((t) =>
                t.matchedPoseOutputs.some((o) => o.poseId === pose.id),
              );

              return (
                <div key={pose.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1 group/pose">
                    <button
                      onClick={() => togglePoseExpansion(pose.id)}
                      className="p-0.5 hover:bg-purple-500/10 rounded transition-colors text-purple-400 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-auto py-1 text-[10px] px-2 bg-purple-900/10 hover:bg-purple-600/20 hover:text-purple-300 border-purple-500/20 hover:border-purple-500/40 transition-colors justify-start flex-1"
                      onClick={() => {
                        if (onSelectPose) {
                          onSelectPose(pose.id);
                          return;
                        }
                        selectPose(pose.id);
                        handleClearSelection();
                      }}
                    >
                      <div className="flex flex-col items-start gap-0.5 w-full">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Sparkles size={10} className="text-purple-400" />
                          {pose.label}
                        </div>
                        <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                          affects: {pose.features.slice(0, 3).join(", ")}
                          {pose.features.length > 3 ? "..." : ""}
                        </span>
                      </div>
                    </Button>
                  </div>
                  {isExpanded && affectedTargets.length > 0 && (
                    <div className="flex flex-col gap-1 ml-4 mt-0.5 pb-1 last:pb-0">
                      {affectedTargets.map((target) => {
                        const output = target.matchedPoseOutputs.find(
                          (o) => o.poseId === pose.id,
                        );
                        if (!output) return null;
                        const anim = animatables[target.targetId];
                        const constraints = anim?.constraints as any;
                        const range =
                          constraints &&
                          typeof constraints.min === "number" &&
                          typeof constraints.max === "number"
                            ? `${constraints.min.toFixed(2)} - ${constraints.max.toFixed(2)}`
                            : null;

                        return (
                          <div
                            key={target.targetId}
                            className="flex items-baseline gap-2 text-[9px] text-purple-200/70 cursor-pointer group/item hover:text-purple-300 transition-colors"
                            onClick={() => onSelectTarget?.(target.targetId)}
                          >
                            <span className="truncate font-medium flex-1">
                              {target.targetLabel}
                            </span>
                            <div className="flex gap-1.5 items-center shrink-0">
                              <span className="font-mono text-purple-400">
                                {output.value.toFixed(3)}
                              </span>
                              {range && (
                                <span className="opacity-50 text-[8px] italic">
                                  ({range})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Rigs */}
        {connections.rigs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-muted font-medium px-1">
              RIGS
            </span>
            {connections.rigs.map((rig) => {
              const isExpanded = expandedRigIds.has(rig.id);
              const affectedTargets = trace.targets.filter((t) =>
                t.upstreamRigInputIds.includes(rig.id),
              );

              return (
                <div key={rig.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1 group/rig">
                    <button
                      onClick={() => toggleRigExpansion(rig.id)}
                      className="p-0.5 hover:bg-accent-subtle rounded transition-colors text-text-muted cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-auto py-1 text-[10px] px-2 bg-bg-panel/30 hover:bg-accent-subtle hover:text-accent border-border-default/50 hover:border-accent/30 transition-colors justify-start flex-1"
                      onClick={() => {
                        if (onSelectRig) {
                          onSelectRig(
                            rig.id,
                            getPrimaryRigSourceKind(rig.sourceKinds),
                          );
                          return;
                        }
                        handleSelectRig(rig.id);
                        handleClearSelection();
                      }}
                    >
                      <div className="flex flex-col items-start gap-0.5 w-full">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Box size={10} className="text-accent" />
                          {rig.label}
                        </div>
                        {rig.sourceKinds.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {rig.sourceKinds.map((kind) => (
                              <Chip key={`${rig.id}:${kind}`} tone="default">
                                {poseSourceKindLabels[kind] ?? kind}
                              </Chip>
                            ))}
                          </div>
                        )}
                        <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                          affects: {rig.features.join(", ")}
                        </span>
                      </div>
                    </Button>
                  </div>
                  {isExpanded && affectedTargets.length > 0 && (
                    <div className="flex flex-col gap-1 ml-4 mt-0.5 pb-1 last:pb-0">
                      {affectedTargets.map((target) => {
                        const val = inputValues[rig.id] ?? 0;
                        const anim = animatables[target.targetId];
                        const constraints = anim?.constraints as any;
                        const range =
                          constraints &&
                          typeof constraints.min === "number" &&
                          typeof constraints.max === "number"
                            ? `${constraints.min.toFixed(2)} - ${constraints.max.toFixed(2)}`
                            : null;

                        return (
                          <div
                            key={target.targetId}
                            className="flex items-baseline gap-2 text-[9px] text-text-muted cursor-pointer group/item hover:text-accent transition-colors"
                            onClick={() => onSelectTarget?.(target.targetId)}
                          >
                            <span className="truncate font-medium flex-1">
                              {target.targetLabel}
                            </span>
                            <div className="flex gap-1.5 items-center shrink-0">
                              <span className="font-mono text-accent">
                                {val.toFixed(3)}
                              </span>
                              {range && (
                                <span className="opacity-50 text-[8px] italic">
                                  ({range})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t border-border-default/40">
        <label className="text-[10px] font-bold text-text-secondary uppercase flex items-center gap-1">
          <Route size={10} />
          Pose-Rig-Face Trace
        </label>

        {trace.targets.length === 0 ? (
          <p className="text-[10px] text-text-muted italic px-1">
            {trace.diagnostics[0] ??
              "No traceable pose/rig path for this selection."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {trace.targets.map((target) => (
              <div
                key={target.targetId}
                className="rounded border border-border-default/50 bg-bg-panel/30 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  {onSelectTarget ? (
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-text-primary truncate hover:text-accent transition-colors"
                      onClick={() => onSelectTarget(target.targetId)}
                      title={`Inspect ${target.targetLabel}`}
                    >
                      {target.targetLabel}
                    </button>
                  ) : (
                    <div className="text-[10px] font-semibold text-text-primary truncate">
                      {target.targetLabel}
                    </div>
                  )}
                  {!onSelectTarget && <Chip tone="default">Read-only</Chip>}
                </div>
                <div className="text-[9px] text-text-muted mt-1">
                  Rig chain:
                </div>
                {target.upstreamRigInputIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {target.upstreamRigInputIds.map((rigId) =>
                      onSelectRig ? (
                        <button
                          key={rigId}
                          type="button"
                          className="px-1.5 py-0.5 rounded border border-border-default/40 bg-bg-panel/40 hover:border-accent/50 hover:text-accent transition-colors text-[9px] font-mono"
                          onClick={() =>
                            onSelectRig(
                              rigId,
                              getTargetRigSourceKind(target, rigId),
                            )
                          }
                          title={`Inspect rig input ${rigId}`}
                        >
                          {rigId}
                        </button>
                      ) : (
                        <span
                          key={rigId}
                          className="px-1.5 py-0.5 rounded border border-border-default/40 bg-bg-panel/20 text-[9px] font-mono"
                        >
                          {rigId}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="text-[9px] text-text-muted/70 mt-0.5">
                    none
                  </div>
                )}
                <div className="text-[9px] text-text-muted mt-1">
                  Pose outputs:
                </div>
                {target.matchedPoseOutputs.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {target.matchedPoseOutputs.map((output) => {
                      const label = `${output.poseName} (${output.inputId}=${output.value.toFixed(3)})`;
                      return onSelectPose ? (
                        <button
                          key={`${output.poseId}:${output.inputId}`}
                          type="button"
                          className="px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 hover:text-purple-200 transition-colors text-[9px]"
                          onClick={() => onSelectPose(output.poseId)}
                          title={`Inspect pose ${output.poseName}`}
                        >
                          {label}
                        </button>
                      ) : (
                        <span
                          key={`${output.poseId}:${output.inputId}`}
                          className="px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/5 text-[9px]"
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[9px] text-text-muted/70 mt-0.5">
                    none
                  </div>
                )}
                {!onSelectRig && !onSelectPose && (
                  <div className="text-[9px] text-text-muted/70 mt-1 italic">
                    Trace links are read-only in this context.
                  </div>
                )}
                <div className="text-[9px] text-text-muted mt-0.5">
                  Target id: {target.targetId}
                </div>
                {target.diagnostics.length > 0 && (
                  <div className="text-[9px] text-warning mt-1">
                    {target.diagnostics.join(" ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {trace.unmatchedPoseOutputs.length > 0 && (
          <div className="rounded border border-warning/40 bg-warning-subtle/20 px-2 py-1.5">
            <div className="text-[9px] font-semibold text-warning uppercase tracking-wide">
              Unmatched Pose Outputs
            </div>
            <div className="text-[9px] text-warning mt-1">
              {trace.unmatchedPoseOutputs
                .map(
                  (output) =>
                    `${output.poseName} -> ${output.inputId}=${output.value.toFixed(3)}`,
                )
                .join("; ")}
            </div>
          </div>
        )}

        {trace.suggestedFixes.length > 0 && (
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold text-emerald-300 uppercase tracking-wide">
                Suggested Fixes
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 text-[9px] px-2 bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-400/40 text-emerald-100"
                  disabled={unappliedSafeBulkSuggestions.length === 0}
                  onClick={handleApplySafeSuggestions}
                >
                  Apply Safe ({unappliedSafeBulkSuggestions.length})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 text-[9px] px-2"
                  disabled={!lastUndoAction}
                  onClick={handleUndoLast}
                >
                  Undo
                </Button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip tone="info">
                Link {suggestionsByKind.linkParent.length}
              </Chip>
              <Chip tone="warning">
                Retarget {suggestionsByKind.retarget.length}
              </Chip>
              <Chip tone="success">Safe {safeBulkSuggestions.length}</Chip>
              <Chip tone="default">Ignored {ignoredSuggestionIds.size}</Chip>
            </div>
            {traceFeedback && (
              <div className="text-[9px] text-emerald-200 mt-1">
                {traceFeedback}
              </div>
            )}
            {previewSuggestion && (
              <div className="mt-1 rounded border border-emerald-300/40 bg-emerald-900/20 px-2 py-1.5">
                <div className="text-[9px] font-semibold text-emerald-100 uppercase tracking-wide">
                  Preview
                </div>
                <div className="text-[9px] text-emerald-100 mt-0.5">
                  {previewSuggestion.kind === "link-parent-binding"
                    ? `${previewSuggestion.poseName}: link ${previewSuggestion.upstreamInputId} -> ${previewSuggestion.childInputId}`
                    : `${previewSuggestion.poseName}: retarget ${previewSuggestion.fromInputId} -> ${previewSuggestion.toInputId}`}
                </div>
                <div className="text-[9px] text-emerald-200/80 mt-0.5">
                  {previewSuggestion.reason}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[9px] px-2 bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-400/40 text-emerald-100"
                    onClick={() => handleApplySuggestion(previewSuggestion)}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[9px] px-2"
                    onClick={() => handleIgnoreSuggestion(previewSuggestion.id)}
                  >
                    Ignore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[9px] px-2"
                    onClick={() => setPreviewSuggestionId(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2 mt-1">
              {suggestionsByKind.linkParent.length > 0 && (
                <div className="text-[9px] uppercase tracking-wide text-emerald-200/80">
                  Link parent bindings
                </div>
              )}
              {suggestionsByKind.linkParent.map((suggestion) => {
                const isApplied = appliedSuggestionIds.has(suggestion.id);
                return (
                  <div
                    key={suggestion.id}
                    className="rounded border border-emerald-400/30 bg-slate-900/40 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] text-emerald-100 font-medium">
                        {`${suggestion.poseName}: link ${suggestion.upstreamInputId} -> ${suggestion.childInputId}`}
                      </div>
                      <Chip
                        tone={
                          suggestion.confidence >= 0.8
                            ? "success"
                            : suggestion.confidence >= 0.6
                              ? "info"
                              : "warning"
                        }
                      >
                        {(suggestion.confidence * 100).toFixed(0)}%
                      </Chip>
                    </div>
                    <div className="text-[9px] text-emerald-200/80 mt-0.5">
                      {suggestion.reason}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2"
                        onClick={() => setPreviewSuggestionId(suggestion.id)}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2"
                        disabled={isApplied}
                        onClick={() => handleIgnoreSuggestion(suggestion.id)}
                      >
                        Ignore
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2 bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-400/40 text-emerald-100"
                        disabled={isApplied}
                        onClick={() => handleApplySuggestion(suggestion)}
                      >
                        {isApplied ? "Applied" : "Apply Suggested Fix"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {suggestionsByKind.retarget.length > 0 && (
                <div className="text-[9px] uppercase tracking-wide text-emerald-200/80 mt-1">
                  Retarget pose outputs
                </div>
              )}
              {suggestionsByKind.retarget.map((suggestion) => {
                const isApplied = appliedSuggestionIds.has(suggestion.id);
                return (
                  <div
                    key={suggestion.id}
                    className="rounded border border-emerald-400/30 bg-slate-900/40 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] text-emerald-100 font-medium">
                        {`${suggestion.poseName}: retarget ${suggestion.fromInputId} -> ${suggestion.toInputId}`}
                      </div>
                      <Chip
                        tone={
                          suggestion.confidence >= 0.8
                            ? "success"
                            : suggestion.confidence >= 0.6
                              ? "info"
                              : "warning"
                        }
                      >
                        {(suggestion.confidence * 100).toFixed(0)}%
                      </Chip>
                    </div>
                    <div className="text-[9px] text-emerald-200/80 mt-0.5">
                      {suggestion.reason}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2"
                        onClick={() => setPreviewSuggestionId(suggestion.id)}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2"
                        disabled={isApplied}
                        onClick={() => handleIgnoreSuggestion(suggestion.id)}
                      >
                        Ignore
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[9px] px-2 bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-400/40 text-emerald-100"
                        disabled={isApplied}
                        onClick={() => handleApplySuggestion(suggestion)}
                      >
                        {isApplied ? "Applied" : "Apply Suggested Fix"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

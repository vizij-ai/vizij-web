import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as LinkIcon, Box, Sparkles, Route } from "lucide-react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  useBindingAuthoring,
  useSelectionStore,
} from "../../state/RigControllerProvider";
import { usePoseRig } from "../../state/PoseRigProvider";
import { usePoseRigStore } from "../../poseRig/store";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Button, Chip } from "../ui";
import {
  buildPoseRigFaceTrace,
  selectSafePoseRigTraceSuggestions,
  type PoseRigTraceSuggestion,
} from "./rigConnections";

interface BindingConnectionsProps {
  node: SceneObjectNode;
}

export function BindingConnections({ node }: BindingConnectionsProps) {
  const bindings = useBindingAuthoring((state) => state.bindings);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const handleSelectRig = useBindingAuthoring((state) => state.handleSelectRig);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const handleCreateParentDriverBinding = useBindingAuthoring(
    (state) => state.handleCreateParentDriverBinding,
  );

  const { selectPose, updatePoseValue, removePoseInput } = usePoseRig();
  const poses = usePoseRigStore((state) => state.poses);
  const neutralInputs = usePoseRigStore((state) => state.neutralInputs);

  const { handleClearSelection } = useSelectionStore();
  const { objects } = useSceneComposer();

  const connections = useMemo(() => {
    const rigDrivers = new Map<
      string,
      { id: string; label: string; features: string[] }
    >();
    const poseDrivers = new Map<
      string,
      { id: string; label: string; features: string[] }
    >();

    // 1. Find direct Rig drivers
    node.features.forEach((feature) => {
      feature.components.forEach((comp) => {
        const targetId = comp.targetId;
        if (targetId && bindings[targetId]) {
          bindings[targetId].slots.forEach((slot) => {
            const inputId = slot.inputId;
            if (inputId) {
              const input = standardInputsById.get(inputId);
              const label = input?.label || input?.path || inputId;

              if (!rigDrivers.has(inputId)) {
                rigDrivers.set(inputId, { id: inputId, label, features: [] });
              }

              const entry = rigDrivers.get(inputId)!;
              const featureName = feature.label || feature.key;
              if (!entry.features.includes(featureName)) {
                entry.features.push(featureName);
              }
            }
          });
        }
      });
    });

    // 2. Find Poses that drive these Rigs
    const drivenRigIds = Array.from(rigDrivers.keys());
    if (drivenRigIds.length > 0) {
      poses.forEach((pose) => {
        const drivenFeatures = new Set<string>();
        let isDriving = false;

        drivenRigIds.forEach((rigId) => {
          const poseValue = pose.values[rigId];
          const neutralValue = neutralInputs[rigId] ?? 0;

          // If pose has a non-neutral value for this rig, it's a driver
          if (poseValue !== undefined && poseValue !== neutralValue) {
            isDriving = true;
            rigDrivers
              .get(rigId)
              ?.features.forEach((f) => drivenFeatures.add(f));
          }
        });

        if (isDriving) {
          poseDrivers.set(pose.id, {
            id: pose.id,
            label: pose.name,
            features: Array.from(drivenFeatures),
          });
        }
      });
    }

    return {
      rigs: Array.from(rigDrivers.values()),
      poses: Array.from(poseDrivers.values()),
    };
  }, [node, bindings, standardInputsById, poses, neutralInputs]);

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

  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [traceFeedback, setTraceFeedback] = useState<string | null>(null);

  const applyTraceSuggestion = useCallback(
    (suggestion: PoseRigTraceSuggestion) => {
      if (suggestion.kind === "link-parent-binding") {
        handleCreateParentDriverBinding(
          suggestion.childInputId,
          suggestion.upstreamInputId,
        );
        handleSelectRig(suggestion.childInputId);
        handleClearSelection();
        return true;
      }

      const pose = poses.find((entry) => entry.id === suggestion.poseId);
      if (!pose) {
        return false;
      }
      const currentValue = pose.values[suggestion.fromInputId];
      if (currentValue === undefined) {
        return false;
      }
      const fromNeutral = neutralInputs[suggestion.fromInputId] ?? 0;
      const toNeutral = neutralInputs[suggestion.toInputId] ?? 0;
      const remappedValue = toNeutral + (currentValue - fromNeutral);
      updatePoseValue(suggestion.poseId, suggestion.toInputId, remappedValue);
      removePoseInput(suggestion.poseId, suggestion.fromInputId);
      selectPose(suggestion.poseId);
      handleClearSelection();
      return true;
    },
    [
      handleClearSelection,
      handleCreateParentDriverBinding,
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
  }, [trace.suggestedFixes]);

  useEffect(() => {
    if (!traceFeedback) {
      return;
    }
    const timer = window.setTimeout(() => setTraceFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [traceFeedback]);

  const suggestionsByKind = useMemo(
    () => ({
      linkParent: trace.suggestedFixes.filter(
        (suggestion) => suggestion.kind === "link-parent-binding",
      ),
      retarget: trace.suggestedFixes.filter(
        (suggestion) => suggestion.kind === "retarget-pose-output",
      ),
    }),
    [trace.suggestedFixes],
  );

  const safeBulkSuggestions = useMemo(
    () => selectSafePoseRigTraceSuggestions(trace.suggestedFixes, 0.6),
    [trace.suggestedFixes],
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
      const applied = applyTraceSuggestion(suggestion);
      if (!applied) {
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
    unappliedSafeBulkSuggestions.forEach((suggestion) => {
      if (applyTraceSuggestion(suggestion)) {
        appliedCount += 1;
        appliedIds.push(suggestion.id);
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
      setTraceFeedback(
        skippedCount > 0
          ? `Applied ${appliedCount} safe fixes (${skippedCount} skipped as stale).`
          : `Applied ${appliedCount} safe fixes.`,
      );
      return;
    }
    setTraceFeedback("Safe suggestions were stale and could not be applied.");
  }, [applyTraceSuggestion, unappliedSafeBulkSuggestions]);

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
        Connected To
      </label>

      <div className="flex flex-col gap-1.5">
        {/* Poses First as they are higher level */}
        {connections.poses.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-600 font-medium px-1">
              POSES
            </span>
            {connections.poses.map((pose) => (
              <Button
                key={pose.id}
                variant="secondary"
                size="sm"
                className="h-auto py-1 text-[10px] px-2 bg-purple-900/10 hover:bg-purple-600/20 hover:text-purple-300 border-purple-500/20 hover:border-purple-500/40 transition-colors justify-start"
                onClick={() => {
                  selectPose(pose.id);
                  handleClearSelection();
                }}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Sparkles size={10} className="text-purple-400" />
                    {pose.label}
                  </div>
                  <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                    drives: {pose.features.slice(0, 3).join(", ")}
                    {pose.features.length > 3 ? "..." : ""}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        )}

        {/* Rigs */}
        {connections.rigs.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-muted font-medium px-1">
              RIGS
            </span>
            {connections.rigs.map((rig) => (
              <Button
                key={rig.id}
                variant="secondary"
                size="sm"
                className="h-auto py-1 text-[10px] px-2 bg-bg-panel/30 hover:bg-accent-subtle hover:text-accent border-border-default/50 hover:border-accent/30 transition-colors justify-start"
                onClick={() => {
                  handleSelectRig(rig.id);
                  handleClearSelection();
                }}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Box size={10} className="text-accent" />
                    {rig.label}
                  </div>
                  <span className="text-[9px] opacity-50 truncate max-w-[160px]">
                    drives: {rig.features.join(", ")}
                  </span>
                </div>
              </Button>
            ))}
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
                <div className="text-[10px] font-semibold text-text-primary truncate">
                  {target.targetLabel}
                </div>
                <div className="text-[9px] text-text-muted mt-1">
                  Rig chain:{" "}
                  {target.upstreamRigInputIds.length > 0
                    ? target.upstreamRigInputIds.join(" -> ")
                    : "none"}
                </div>
                <div className="text-[9px] text-text-muted mt-0.5">
                  Pose outputs:{" "}
                  {target.matchedPoseOutputs.length > 0
                    ? target.matchedPoseOutputs
                        .map(
                          (output) =>
                            `${output.poseName} (${output.inputId}=${output.value.toFixed(3)})`,
                        )
                        .join("; ")
                    : "none"}
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
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[9px] px-2 bg-emerald-600/20 hover:bg-emerald-600/35 border-emerald-400/40 text-emerald-100"
                disabled={unappliedSafeBulkSuggestions.length === 0}
                onClick={handleApplySafeSuggestions}
              >
                Apply Safe ({unappliedSafeBulkSuggestions.length})
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip tone="info">
                Link {suggestionsByKind.linkParent.length}
              </Chip>
              <Chip tone="warning">
                Retarget {suggestionsByKind.retarget.length}
              </Chip>
              <Chip tone="success">Safe {safeBulkSuggestions.length}</Chip>
            </div>
            {traceFeedback && (
              <div className="text-[9px] text-emerald-200 mt-1">
                {traceFeedback}
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
                    <div className="mt-1">
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
                    <div className="mt-1">
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

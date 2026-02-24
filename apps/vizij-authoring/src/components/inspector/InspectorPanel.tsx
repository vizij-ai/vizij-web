import { useMemo } from "react";
import { RotateCcw, Activity } from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { EmptyState } from "../ui/EmptyState";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { PoseDefinition } from "../../poseRig/types";
import type { PoseGroupInspectorSelection } from "../../types/poseGroupInspector";
import { parsePoseWeightInputSourceId } from "../../poseRig/utils";
import { InspectorContent } from "./InspectorContent";

interface InspectorPanelProps {
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
  onSelectPoseGroup?: (selection: PoseGroupInspectorSelection | null) => void;
  hasReferenceFaceFile?: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function InspectorPanel({
  selectedPoseGroup = null,
  onSelectPoseGroup,
  hasReferenceFaceFile = false,
}: InspectorPanelProps) {
  const {
    poses,
    neutralInputs,
    poseConfigDraft,
    blendMode,
    setPoseGroupBlendMode,
    selectPose,
    selectedPoseId,
  } = usePoseRig();
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const poseLookup = useMemo(() => {
    const lookup = new Map<string, PoseDefinition>();
    poses.forEach((pose) => lookup.set(pose.id, pose));
    return lookup;
  }, [poses]);

  const activePoseGroupPoses = useMemo(() => {
    if (!selectedPoseGroup) {
      return [] as PoseDefinition[];
    }
    return selectedPoseGroup.poseIds
      .map((poseId) => poseLookup.get(poseId))
      .filter((pose): pose is PoseDefinition => Boolean(pose));
  }, [selectedPoseGroup, poseLookup]);

  const activePoseGroupBlendMode = useMemo(() => {
    if (!selectedPoseGroup?.groupId || !poseConfigDraft?.poseGroups) {
      return blendMode;
    }
    const configuredGroup = poseConfigDraft.poseGroups.find(
      (group) => group.id === selectedPoseGroup.groupId,
    );
    return configuredGroup?.blendMode ?? blendMode;
  }, [blendMode, poseConfigDraft?.poseGroups, selectedPoseGroup?.groupId]);

  const poseWeightInputIdByPoseId = useMemo(() => {
    const map = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const poseId = parsePoseWeightInputSourceId(entry.input.sourceId);
      if (!poseId || map.has(poseId)) {
        return;
      }
      map.set(poseId, entry.input.id);
    });
    return map;
  }, [managedStandardInputs]);

  const poseGroupWeights = useMemo(() => {
    if (!selectedPoseGroup) {
      return {} as Record<string, number>;
    }
    const next: Record<string, number> = {};
    selectedPoseGroup.poseIds.forEach((poseId) => {
      const inputId = poseWeightInputIdByPoseId.get(poseId);
      const stored = inputId ? inputValues[inputId] : undefined;
      if (typeof stored === "number" && Number.isFinite(stored)) {
        next[poseId] = clamp01(stored);
        return;
      }
      next[poseId] = selectedPoseId === poseId ? 1 : 0;
    });
    return next;
  }, [
    inputValues,
    poseWeightInputIdByPoseId,
    selectedPoseGroup,
    selectedPoseId,
  ]);

  const resolveNeutralValue = (inputId: string) => {
    const neutral = neutralInputs[inputId];
    if (typeof neutral === "number" && Number.isFinite(neutral)) {
      return neutral;
    }
    const fallback = standardInputsById.get(inputId)?.defaultValue;
    if (typeof fallback === "number" && Number.isFinite(fallback)) {
      return fallback;
    }
    return 0;
  };

  const clampInputValue = (inputId: string, value: number) => {
    const input = standardInputsById.get(inputId);
    if (!input?.range) {
      return value;
    }
    const min = Number.isFinite(input.range.min) ? input.range.min : value;
    const max = Number.isFinite(input.range.max) ? input.range.max : value;
    return Math.max(min, Math.min(max, value));
  };

  const applyPoseGroupPreview = (
    groupPoses: PoseDefinition[],
    weights: Record<string, number>,
  ) => {
    const updates: Record<string, number> = {};
    managedStandardInputs.forEach((entry) => {
      updates[entry.input.id] = resolveNeutralValue(entry.input.id);
    });

    const affectedInputs = new Set<string>();
    groupPoses.forEach((pose) => {
      Object.keys(pose.values).forEach((inputId) =>
        affectedInputs.add(inputId),
      );
    });

    affectedInputs.forEach((inputId) => {
      const neutral = resolveNeutralValue(inputId);
      let totalWeight = 0;
      let totalWeightedDelta = 0;
      groupPoses.forEach((pose) => {
        const weight = clamp01(weights[pose.id] ?? 0);
        if (weight <= 0) {
          return;
        }
        const target = pose.values[inputId];
        const poseValue =
          typeof target === "number" && Number.isFinite(target)
            ? target
            : neutral;
        const delta = poseValue - neutral;
        if (Math.abs(delta) < 1e-6) {
          return;
        }
        totalWeight += weight;
        totalWeightedDelta += delta * weight;
      });

      let nextValue = neutral;
      if (activePoseGroupBlendMode === "additive") {
        nextValue = neutral + totalWeightedDelta;
      } else if (totalWeight > 0) {
        nextValue = neutral + totalWeightedDelta / Math.max(totalWeight, 1);
      }
      updates[inputId] = clampInputValue(inputId, nextValue);
    });

    applyStandardInputBatch(updates, { replace: true });
  };

  const groupTotalWeight = useMemo(
    () =>
      activePoseGroupPoses.reduce(
        (sum, pose) => sum + clamp01(poseGroupWeights[pose.id] ?? 0),
        0,
      ),
    [activePoseGroupPoses, poseGroupWeights],
  );

  const handlePoseGroupWeightChange = (poseId: string, nextWeight: number) => {
    const clamped = clamp01(nextWeight);
    const poseWeightInputId = poseWeightInputIdByPoseId.get(poseId);
    if (poseWeightInputId) {
      handleInputValueChange(poseWeightInputId, clamped);
      return;
    }
    const next = {
      ...poseGroupWeights,
      [poseId]: clamped,
    };
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const handlePoseGroupReset = () => {
    const canonicalUpdates: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      const poseWeightInputId = poseWeightInputIdByPoseId.get(pose.id);
      if (poseWeightInputId) {
        canonicalUpdates[poseWeightInputId] = 0;
      }
    });
    if (Object.keys(canonicalUpdates).length > 0) {
      applyStandardInputBatch(canonicalUpdates);
      return;
    }
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = 0;
    });
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const handlePoseGroupSolo = (poseId: string) => {
    const canonicalUpdates: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      const poseWeightInputId = poseWeightInputIdByPoseId.get(pose.id);
      if (poseWeightInputId) {
        canonicalUpdates[poseWeightInputId] = pose.id === poseId ? 1 : 0;
      }
    });
    if (Object.keys(canonicalUpdates).length > 0) {
      applyStandardInputBatch(canonicalUpdates);
      return;
    }
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = pose.id === poseId ? 1 : 0;
    });
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  return (
    <Panel
      title="Inspector"
      description="View and edit selected object properties."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0">
          <InspectorContent hasReferenceFaceFile={hasReferenceFaceFile} />
        </div>
        {selectedPoseGroup && (
          <div className="mt-2 border-t border-border-default/60 pt-2 px-2 pb-2 flex flex-col gap-2 min-h-0 max-h-[42%] overflow-y-auto custom-scrollbar">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-text-primary truncate">
                  Pose Group Inspector · {selectedPoseGroup.label}
                </div>
                <div className="text-[10px] text-text-muted font-mono truncate">
                  /{selectedPoseGroup.groupPath}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onSelectPoseGroup?.(null)}
                title="Close Pose Group Inspector"
              >
                Close
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded border border-border-default/60 bg-bg-panel/40 px-2 py-1.5">
              <span className="text-[10px] text-text-muted">
                Blend mode:{" "}
                <span className="font-mono">
                  {activePoseGroupBlendMode}
                  {!selectedPoseGroup?.groupId ? " (global fallback)" : ""}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant={
                    activePoseGroupBlendMode === "average" &&
                    selectedPoseGroup?.groupId
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={!selectedPoseGroup?.groupId}
                  onClick={() =>
                    selectedPoseGroup?.groupId &&
                    setPoseGroupBlendMode(selectedPoseGroup.groupId, "average")
                  }
                >
                  Average
                </Button>
                <Button
                  variant={
                    activePoseGroupBlendMode === "additive" &&
                    selectedPoseGroup?.groupId
                      ? "primary"
                      : "subtle"
                  }
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={!selectedPoseGroup?.groupId}
                  onClick={() =>
                    selectedPoseGroup?.groupId &&
                    setPoseGroupBlendMode(selectedPoseGroup.groupId, "additive")
                  }
                >
                  Additive
                </Button>
                <span className="text-[10px] text-text-muted font-mono">
                  Weight: {groupTotalWeight.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[10px]"
                  onClick={handlePoseGroupReset}
                  title="Reset all pose weights in this group"
                >
                  <RotateCcw size={11} />
                  Reset
                </Button>
              </div>
            </div>

            {activePoseGroupPoses.length > 0 ? (
              <div className="flex flex-col gap-2">
                {activePoseGroupPoses.map((pose) => {
                  const weight = clamp01(poseGroupWeights[pose.id] ?? 0);
                  return (
                    <div
                      key={pose.id}
                      className="rounded border border-border-default/60 bg-bg-panel/30 px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-xs text-text-primary truncate">
                            {pose.name}
                          </div>
                          <div className="text-[10px] text-text-muted font-mono truncate">
                            {pose.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handlePoseGroupSolo(pose.id)}
                            title="Solo this pose at 100%"
                          >
                            Solo
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              selectPose(pose.id);
                              handlePoseGroupSolo(pose.id);
                            }}
                            title="Select and play this pose"
                          >
                            Play
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 inspector-row-hit-target">
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={weight}
                          className="flex-1"
                          onChange={(value) =>
                            handlePoseGroupWeightChange(
                              pose.id,
                              value as number,
                            )
                          }
                        />
                        <div className="inspector-numeric-control flex-shrink-0">
                          <NumberField
                            size="sm"
                            value={weight}
                            className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-xs"
                            onChange={(value) =>
                              handlePoseGroupWeightChange(pose.id, value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Activity}
                iconSize={16}
                title="No Poses In Group"
                description="This group no longer contains pose entries."
                className="py-6"
              />
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

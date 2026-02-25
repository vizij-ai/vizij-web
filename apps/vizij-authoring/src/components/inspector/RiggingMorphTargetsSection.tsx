import React, { useMemo, useRef } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { StandardRigInput, AnimatableValue } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { cn } from "../../utils/cn";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { resolveEffectiveControllableBindingStandardInput } from "./bindingSlotResolution";
import { resolveFaceInspectorCurrentValue } from "./faceInspectorSemantics";

interface RiggingMorphTargetsSectionProps {
  node: SceneObjectNode;
}

const EMPTY_ARRAY: string[] = [];

export function RiggingMorphTargetsSection({
  node,
}: RiggingMorphTargetsSectionProps) {
  const bindings = useBindingAuthoring((state) => state.bindings);
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );

  const {
    updateAnimatableDescriptor,
    setAnimatableValue,
    setStaticFeatureValue,
  } = useSceneComposer();

  const handleStaticValueChange = (
    targetId: string,
    value: number,
    channel?: string,
  ) => {
    setAnimatableValue(targetId, value, { channel, saveToDefault: true });
  };

  // Get morph targets from runtime
  const morphTargetKeys = useGraphRuntime((state) => {
    const renderable = state.world[node.id] as
      | { morphTargets?: string[] }
      | undefined;
    return renderable?.morphTargets ?? EMPTY_ARRAY;
  });

  // Filter features that match morph targets
  const morphFeatures = useMemo(() => {
    if (!morphTargetKeys.length) return [];

    // Create a set of normalized keys for matching
    const keys = new Set(morphTargetKeys.map((k) => k.trim().toLowerCase()));

    // Find matching features
    return node.features.filter((f) => keys.has(f.key.trim().toLowerCase()));
  }, [morphTargetKeys, node.features]);

  if (morphFeatures.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5 bg-zinc-900/40 rounded-lg border border-zinc-800/50 mt-0.5">
      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-0.5 px-0.5">
        Morph Targets
      </div>

      {morphFeatures.map((feature) => (
        <RiggingScalarRow
          key={feature.id}
          label={feature.label || feature.key}
          feature={feature}
          bindings={bindings}
          standardInputs={standardInputs}
          standardInputsById={standardInputsById}
          inputBindings={inputBindings}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id, val) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
          onConstraintChange={updateAnimatableDescriptor}
          onStaticValueChange={handleStaticValueChange}
          onUpdateStandardInput={handleUpdateStandardInput}
          setStaticFeatureValue={setStaticFeatureValue}
          node={node}
        />
      ))}
    </div>
  );
}

// Sub-component for Scalar (Single Float)
interface RiggingScalarRowProps {
  label: string;
  feature: any; // SceneObjectFeature
  bindings: any;
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  inputBindings: Record<
    string,
    { inputId?: string | null; slots?: Array<{ inputId?: string | null }> }
  >;
  inputValues: Record<string, number>;
  onValueChange: (id: string, value: number) => void;
  onDefaultChange: (id: string, value: number) => void;
  onConstraintChange: (
    id: string,
    updater: (curr: AnimatableValue) => AnimatableValue,
  ) => void;
  onStaticValueChange?: (
    targetId: string,
    value: number,
    channel?: string,
  ) => void;
  onUpdateStandardInput: (id: string, updates: any) => void;
  setStaticFeatureValue?: (
    nodeId: string,
    featureId: string,
    value: any,
  ) => void;
  node?: SceneObjectNode;
}

function RiggingScalarRow({
  label,
  feature,
  bindings,
  standardInputs,
  standardInputsById,
  inputBindings,
  inputValues,
  onValueChange,
  onDefaultChange,
  onConstraintChange,
  onStaticValueChange,
  onUpdateStandardInput,
  setStaticFeatureValue,
  node,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
  );

  const component = feature.components[0];
  if (!component) return null;

  const targetId = component.targetId;
  let inputId: string | null = null;
  let standardInput: StandardRigInput | null = null;
  let unresolvedInputId: string | null = null;
  let blockedReason: string | null = null;

  if (targetId) {
    const binding = bindings[targetId];
    const resolved = resolveEffectiveControllableBindingStandardInput(
      binding,
      standardInputsById,
      standardInputs,
      inputBindings,
    );
    inputId = resolved.inputId;
    standardInput = resolved.input;
    unresolvedInputId = resolved.unresolvedInputId;
    blockedReason = resolved.blockedReason;
  }

  const hasInputMetadata = !!(inputId && standardInput);
  const isBound = hasInputMetadata && !blockedReason;
  const authority = resolveFaceInspectorCurrentValue({
    inputId,
    standardInput,
    unresolvedInputId,
    blockedReason,
    inputValues,
    staticValue: component.staticValue ?? 0,
  });
  const isChannelLocked = Boolean(
    targetId && lockedInspectorTargetIds.has(targetId),
  );

  const minVal = hasInputMetadata
    ? standardInput!.range.min
    : ((feature.descriptor?.constraints as any)?.min ?? 0);
  const maxVal = hasInputMetadata
    ? standardInput!.range.max
    : ((feature.descriptor?.constraints as any)?.max ?? 0);

  const currentValue = authority.currentValue;

  const defaultValue = isBound
    ? (standardInput?.defaultValue ?? 0)
    : (component.staticValue ?? 0);

  const hasDifferentDefault =
    hasInputMetadata &&
    Math.abs((currentValue as number) - (defaultValue as number)) > 0.0001;

  const handleReset = () => {
    if (isBound && inputId) onValueChange(inputId, defaultValue as number);
  };

  const handleSaveToDefault = () => {
    if (isBound && inputId) {
      onUpdateStandardInput(inputId, { defaultValue: currentValue as number });
    }
    if (onStaticValueChange && (targetId || feature.animatableId)) {
      onStaticValueChange(targetId ?? feature.animatableId!, currentValue);
    }
  };

  const hasMinChanged =
    Math.abs((currentValue as number) - (minVal as number)) > 0.0001;
  const hasMaxChanged =
    Math.abs((currentValue as number) - (maxVal as number)) > 0.0001;

  const handleSaveToMin = () => {
    if (inputId) {
      onUpdateStandardInput(inputId, {
        range: { min: currentValue as number },
      });
    }
    if (feature.animatableId) {
      onConstraintChange(feature.animatableId, (curr: AnimatableValue) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        nextConstraints.min = currentValue;
        return { ...curr, constraints: nextConstraints } as AnimatableValue;
      });
    }
  };

  const handleSaveToMax = () => {
    if (inputId) {
      onUpdateStandardInput(inputId, {
        range: { max: currentValue as number },
      });
    }
    if (feature.animatableId) {
      onConstraintChange(feature.animatableId, (curr: AnimatableValue) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        nextConstraints.max = currentValue;
        return { ...curr, constraints: nextConstraints } as AnimatableValue;
      });
    }
  };

  const renderInput = (type: "current" | "default" | "min" | "max") => {
    let val: number | undefined;
    let canEdit = true;

    if (type === "current") {
      val = currentValue;
      canEdit = !isChannelLocked && (isBound || !!onStaticValueChange);
    } else if (type === "default") {
      val = defaultValue;
      canEdit = isBound;
    } else if (type === "min") {
      val = minVal;
      canEdit = true;
    } else if (type === "max") {
      val = maxVal;
      canEdit = true;
    }

    const row = (
      <div
        title={
          type === "current"
            ? `Current Source: ${authority.sourceLabel}`
            : undefined
        }
        className={cn(
          "flex items-center bg-bg-input/50 rounded-sm border border-transparent relative flex-1 min-w-0 h-5 group/row",
          canEdit ? "focus-within:border-accent/50" : "opacity-70",
        )}
      >
        <ScrubbableLabel
          label={label}
          onScrub={(delta: number, totalDelta: number) => {
            const step = 0.01;
            if (type === "current") {
              if (isChannelLocked) {
                return;
              }
              if (isBound && inputId) {
                const startVal = scrubValuesRef.current[inputId] ?? 0;
                onValueChange(inputId, startVal + totalDelta * step);
              } else if (onStaticValueChange) {
                const startVal = scrubValuesRef.current["current"] ?? 0;
                const newVal = startVal + totalDelta * step;
                if (feature.animated && feature.animatableId) {
                  onStaticValueChange(feature.animatableId, newVal);
                } else if (setStaticFeatureValue && node) {
                  setStaticFeatureValue(node.id, feature.id, newVal);
                }
              }
            } else if (type === "default" && inputId) {
              const startVal = scrubValuesRef.current[inputId] ?? 0;
              const nextVal = startVal + totalDelta * step;
              onDefaultChange(inputId, nextVal);
              if (onStaticValueChange && (targetId || feature.animatableId)) {
                onStaticValueChange(targetId ?? feature.animatableId!, nextVal);
              }
            } else if (
              (type === "min" || type === "max") &&
              (inputId || feature.animatableId)
            ) {
              const startVal = scrubValuesRef.current[type] ?? 0;
              const nextVal = startVal + totalDelta * step;
              if (inputId) {
                onUpdateStandardInput(inputId, { range: { [type]: nextVal } });
              }
              if (feature.animatableId) {
                onConstraintChange(
                  feature.animatableId,
                  (curr: AnimatableValue) => {
                    const nextConstraints = {
                      ...(curr.constraints || {}),
                    } as any;
                    nextConstraints[type === "min" ? "min" : "max"] = nextVal;
                    return {
                      ...curr,
                      constraints: nextConstraints,
                    } as AnimatableValue;
                  },
                );
              }
            }
          }}
          onScrubStart={() => {
            if (type === "current") {
              if (isBound && inputId)
                scrubValuesRef.current[inputId] = currentValue ?? 0;
              else scrubValuesRef.current["current"] = currentValue ?? 0;
            } else if (type === "default" && inputId) {
              scrubValuesRef.current[inputId] = defaultValue ?? 0;
            } else if (
              (type === "min" || type === "max") &&
              (inputId || feature.animatableId)
            ) {
              scrubValuesRef.current[type] =
                (type === "min" ? minVal : maxVal) ?? 0;
            }
          }}
          className="text-[9px] font-bold px-1 select-none transition-colors text-text-muted"
        />
        <input
          type="number"
          className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none pl-1"
          value={typeof val === "number" ? val : 0}
          step={0.01}
          disabled={!canEdit}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            if (isNaN(num)) return;

            if (type === "current") {
              if (isChannelLocked) {
                return;
              }
              if (isBound && inputId) {
                onValueChange(inputId, num);
              } else if (onStaticValueChange) {
                if (feature.animated && feature.animatableId) {
                  onStaticValueChange(feature.animatableId, num);
                } else if (setStaticFeatureValue && node) {
                  setStaticFeatureValue(node.id, feature.id, num);
                }
              }
            } else if (type === "default" && inputId) {
              onDefaultChange(inputId, num);
              if (onStaticValueChange && (targetId || feature.animatableId)) {
                onStaticValueChange(targetId ?? feature.animatableId!, num);
              }
            } else if (
              (type === "min" || type === "max") &&
              (inputId || feature.animatableId)
            ) {
              if (inputId) {
                onUpdateStandardInput(inputId, { range: { [type]: num } });
              }
              if (feature.animatableId) {
                onConstraintChange(
                  feature.animatableId,
                  (curr: AnimatableValue) => {
                    const nextConstraints = {
                      ...(curr.constraints || {}),
                    } as any;
                    nextConstraints[type === "min" ? "min" : "max"] = num;
                    return {
                      ...curr,
                      constraints: nextConstraints,
                    } as AnimatableValue;
                  },
                );
              }
            }
          }}
        />
      </div>
    );

    if (type !== "current") {
      return row;
    }

    return (
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        {row}
        <div
          className="px-1 text-[9px] text-text-muted font-mono truncate"
          title={authority.sourceLabel}
        >
          Current Source: {authority.sourceLabel}
        </div>
      </div>
    );
  };

  const renderAnimatableRow = () => (
    <div className="flex gap-1.5 flex-1">
      <button
        title={`Current Source: ${authority.sourceLabel}`}
        className={cn(
          "flex items-center justify-center gap-1.5 flex-1 h-5 rounded-sm border border-transparent transition-colors text-[10px] font-bold uppercase tracking-wider",
          isChannelLocked
            ? "bg-bg-input/50 text-text-muted hover:bg-bg-input/70"
            : "bg-accent/10 text-accent hover:bg-accent/20",
        )}
        disabled={!targetId}
        onClick={() => {
          if (!targetId) {
            return;
          }
          handleSetInspectorTargetLocked(targetId, !isChannelLocked);
        }}
      >
        {isChannelLocked ? (
          <Lock size={10} className="shrink-0" />
        ) : (
          <LockOpen size={10} className="shrink-0" />
        )}
        <span>Value</span>
      </button>
    </div>
  );

  return (
    <RiggingPropertyRow
      label={label}
      hasDifferentDefault={hasDifferentDefault}
      hasMinChanged={hasMinChanged}
      hasMaxChanged={hasMaxChanged}
      onResetToDefault={handleReset}
      onSaveToDefault={handleSaveToDefault}
      onSaveToMin={handleSaveToMin}
      onSaveToMax={handleSaveToMax}
      renderMainInput={() => renderInput("current")}
      renderDefaultInput={() => renderInput("default")}
      renderMinInput={() => renderInput("min")}
      renderMaxInput={() => renderInput("max")}
      renderAnimatableRow={renderAnimatableRow}
    />
  );
}

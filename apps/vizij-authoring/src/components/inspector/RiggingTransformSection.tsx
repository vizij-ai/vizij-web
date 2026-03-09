import React, { useMemo, useRef, useCallback } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { StandardRigInput, AnimatableValue } from "@vizij/utils";
import { cn } from "../../utils/cn";
import type {
  SceneObjectNode,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { useAuthoringUiState } from "../../state/AuthoringUiProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import {
  fromRotationDisplayValue,
  isRotationPropertyKey,
  toRotationDisplayValue,
} from "../../utils/rotationDisplay";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { resolveEffectiveControllableBindingStandardInput } from "./bindingSlotResolution";
import { resolveFaceInspectorCurrentValue } from "./faceInspectorSemantics";

interface RiggingTransformSectionProps {
  node: SceneObjectNode;
}

export function RiggingTransformSection({
  node,
}: RiggingTransformSectionProps) {
  const { rotationDisplayMode } = useAuthoringUiState();
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

  const handleStaticValueChange = useCallback(
    (targetId: string, value: number, channel?: string) => {
      setAnimatableValue(targetId, value, { channel, saveToDefault: true });
    },
    [setAnimatableValue],
  );

  // Helper to find feature by key
  const findFeature = (key: string) =>
    node.features.find((f) => f.key.toLowerCase() === key.toLowerCase());

  const positionFeature = findFeature("translation") ?? findFeature("position");
  const rotationFeature = findFeature("rotation");
  const scaleFeature = findFeature("scale");

  if (!positionFeature && !rotationFeature && !scaleFeature) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50">
      <div className="text-[9px] font-bold text-text-secondary uppercase tracking-wider mb-0.5 px-0.5">
        Transform
      </div>

      {positionFeature && (
        <RiggingVectorRow
          label="Position"
          feature={positionFeature}
          node={node}
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
          rotationDisplayMode={rotationDisplayMode}
        />
      )}

      {rotationFeature && (
        <RiggingVectorRow
          label="Rotation"
          feature={rotationFeature}
          node={node}
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
          rotationDisplayMode={rotationDisplayMode}
        />
      )}

      {scaleFeature && (
        <RiggingVectorRow
          label="Scale"
          feature={scaleFeature}
          node={node}
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
          rotationDisplayMode={rotationDisplayMode}
        />
      )}
    </div>
  );
}

// Sub-component for Vector3 (X, Y, Z)
interface RiggingVectorRowProps {
  label: string;
  feature: SceneObjectFeature;
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
  rotationDisplayMode: "radians" | "degrees";
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

function RiggingVectorRow({
  label,
  feature,
  bindings,
  standardInputs,
  standardInputsById,
  inputBindings,
  inputValues,
  node,
  onValueChange,
  onDefaultChange,
  onConstraintChange,
  rotationDisplayMode,
  onStaticValueChange,
  onUpdateStandardInput,
  setStaticFeatureValue,
}: RiggingVectorRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
  );
  const useDegreeDisplay =
    rotationDisplayMode === "degrees" && isRotationPropertyKey(feature.key);
  const displayStep = useDegreeDisplay ? 0.5 : 0.01;
  const displayLabel = useDegreeDisplay ? `${label} (deg)` : label;

  // Extract inputs for x, y, z components
  const components = useMemo(() => {
    return feature.components.map((comp) => {
      const label = comp.componentKey?.toUpperCase() ?? comp.label;

      // 1. Try to find active binding/driver
      const targetId = comp.targetId;
      let inputId = null;
      let standardInput = null;
      let unresolvedInputId = null;
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
        staticValue: comp.staticValue ?? 0,
      });
      const isLocked = Boolean(
        targetId && lockedInspectorTargetIds.has(targetId),
      );

      if (hasInputMetadata && inputId) {
        // Bound Case
        const range = standardInput!.range;
        return {
          componentLabel: label,
          inputId,
          targetId,
          isLocked,
          currentValue: authority.currentValue,
          currentValueSource: authority.sourceLabel,
          defaultValue: standardInput!.defaultValue ?? 0,
          min: range.min,
          max: range.max,
          isBound: true,
          hasInputMetadata: true,
          unresolvedInputId,
          blockedReason,
        };
      } else {
        // Descriptor Case (or dynamic input without metadata)
        const val = authority.currentValue;
        const constraints = feature.descriptor?.constraints as any;
        const key = label.toLowerCase();
        const minVals = constraints?.min;
        const maxVals = constraints?.max;

        let minVal = 0;
        let maxVal = 0;

        if (typeof minVals === "object" && minVals !== null)
          minVal = (minVals as any)[key] ?? 0;
        else if (Array.isArray(minVals))
          minVal = minVals[feature.components.indexOf(comp)] ?? 0;
        else if (typeof minVals === "number") minVal = minVals;

        if (typeof maxVals === "object" && maxVals !== null)
          maxVal = (maxVals as any)[key] ?? 0;
        else if (Array.isArray(maxVals))
          maxVal = maxVals[feature.components.indexOf(comp)] ?? 0;
        else if (typeof maxVals === "number") maxVal = maxVals;

        return {
          componentLabel: label,
          inputId,
          targetId,
          isLocked,
          currentValue: val,
          currentValueSource: authority.sourceLabel,
          defaultValue: val,
          min: minVal,
          max: maxVal,
          isBound: isBound,
          hasInputMetadata: false,
          unresolvedInputId,
          blockedReason,
        };
      }
    });
  }, [
    feature,
    bindings,
    standardInputs,
    standardInputsById,
    inputBindings,
    inputValues,
    lockedInspectorTargetIds,
  ]);

  if (components.length === 0) return null;

  // Only show reset if ANY component is bound and differs
  const hasDifferentDefault = components.some(
    (c) =>
      c.hasInputMetadata &&
      Math.abs((c.currentValue as number) - (c.defaultValue as number)) >
        0.0001,
  );

  const handleReset = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId)
        onValueChange(c.inputId, c.defaultValue as number);
    });
  };

  const handleSaveToDefault = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId) {
        onUpdateStandardInput(c.inputId, {
          defaultValue: c.currentValue as number,
        });
      }
      if (onStaticValueChange && (c.targetId || feature.animatableId)) {
        onStaticValueChange(
          c.targetId ?? feature.animatableId!,
          c.currentValue as number,
          c.componentLabel.toLowerCase(),
        );
      }
    });
  };

  const hasMinChanged = components.some(
    (c) => Math.abs((c.currentValue as number) - (c.min as number)) > 0.0001,
  );

  const hasMaxChanged = components.some(
    (c) => Math.abs((c.currentValue as number) - (c.max as number)) > 0.0001,
  );

  const handleSaveToMin = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId) {
        onUpdateStandardInput(c.inputId, {
          range: { min: c.currentValue as number },
        });
      }
    });

    if (feature.animatableId) {
      onConstraintChange(feature.animatableId, (curr) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        const currentVals = { ...(nextConstraints.min || {}) };
        components.forEach((c) => {
          currentVals[c.componentLabel.toLowerCase()] = c.currentValue;
        });
        nextConstraints.min = currentVals;
        return { ...curr, constraints: nextConstraints } as any;
      });
    }
  };

  const handleSaveToMax = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId) {
        onUpdateStandardInput(c.inputId, {
          range: { max: c.currentValue as number },
        });
      }
    });

    if (feature.animatableId) {
      onConstraintChange(feature.animatableId, (curr) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        const currentVals = { ...(nextConstraints.max || {}) };
        components.forEach((c) => {
          currentVals[c.componentLabel.toLowerCase()] = c.currentValue;
        });
        nextConstraints.max = currentVals;
        return { ...curr, constraints: nextConstraints } as any;
      });
    }
  };

  const lockableTargetIds = components
    .map((component) => component.targetId)
    .filter((targetId): targetId is string => Boolean(targetId));
  const lockedTargetCount = lockableTargetIds.reduce(
    (count, targetId) =>
      lockedInspectorTargetIds.has(targetId) ? count + 1 : count,
    0,
  );
  const areAllLockableTargetsLocked =
    lockableTargetIds.length > 0 &&
    lockedTargetCount === lockableTargetIds.length;
  const toggleRowLock = () => {
    if (lockableTargetIds.length === 0) {
      return;
    }
    const nextLocked = !areAllLockableTargetsLocked;
    lockableTargetIds.forEach((targetId) => {
      handleSetInspectorTargetLocked(targetId, nextLocked);
    });
  };

  const renderInputs = (type: "current" | "default" | "min" | "max") => {
    return (
      <div className="flex gap-1.5 flex-1">
        {components.map((c, i) => {
          let val: number | undefined;
          let canEdit = true;

          if (type === "current") {
            val = c.currentValue;
            canEdit = !c.isLocked && (c.isBound || !!onStaticValueChange);
          } else if (type === "default") {
            val = c.defaultValue;
            canEdit = c.hasInputMetadata;
          } else if (type === "min") {
            val = c.min as number;
            canEdit = true;
          } else if (type === "max") {
            val = c.max as number;
            canEdit = true;
          }
          const displayValue =
            typeof val === "number"
              ? toRotationDisplayValue(val, rotationDisplayMode)
              : 0;
          const toStoredValue = (nextValue: number) =>
            useDegreeDisplay
              ? fromRotationDisplayValue(nextValue, rotationDisplayMode)
              : nextValue;

          return (
            <div
              key={i}
              title={
                type === "current"
                  ? `Current Source: ${c.currentValueSource}`
                  : undefined
              }
              className={cn(
                "flex items-center bg-bg-input/50 rounded-sm border border-transparent relative flex-1 min-w-0 h-5 group/row",
                canEdit ? "focus-within:border-accent/50" : "opacity-70",
              )}
            >
              <ScrubbableLabel
                label={c.componentLabel}
                onScrub={(_, totalDelta) => {
                  const step = useDegreeDisplay ? 0.5 : 0.05;
                  const deltaValue = useDegreeDisplay
                    ? fromRotationDisplayValue(
                        totalDelta * step,
                        rotationDisplayMode,
                      )
                    : totalDelta * step;
                  if (type === "current") {
                    if (c.isLocked) {
                      return;
                    }
                    if (c.isBound && c.inputId) {
                      const startVal = scrubValuesRef.current[c.inputId] ?? 0;
                      onValueChange(c.inputId, startVal + deltaValue);
                    } else if (onStaticValueChange) {
                      const startValueToUse =
                        scrubValuesRef.current["current"] ?? 0;
                      const newVal = startValueToUse + deltaValue;
                      if (feature.animated && feature.animatableId) {
                        onStaticValueChange(
                          feature.animatableId,
                          newVal,
                          c.componentLabel.toLowerCase(),
                        );
                      } else if (setStaticFeatureValue && node) {
                        const current = (feature.staticValue as any) || {};
                        setStaticFeatureValue(node.id, feature.id, {
                          ...current,
                          [c.componentLabel.toLowerCase()]: newVal,
                        });
                      }
                    }
                  } else if (type === "default" && c.inputId) {
                    const startVal = scrubValuesRef.current[c.inputId] ?? 0;
                    const nextVal = startVal + deltaValue;
                    onDefaultChange(c.inputId, nextVal);
                    if (
                      onStaticValueChange &&
                      (c.targetId || feature.animatableId)
                    ) {
                      onStaticValueChange(
                        c.targetId ?? feature.animatableId!,
                        nextVal,
                        c.componentLabel.toLowerCase(),
                      );
                    }
                  } else if (
                    (type === "min" || type === "max") &&
                    (c.inputId || feature.animatableId)
                  ) {
                    const key = c.componentLabel.toLowerCase();
                    const startVal =
                      scrubValuesRef.current[`${type}:${key}`] ?? 0;
                    const nextVal = startVal + deltaValue;

                    if (c.inputId) {
                      onUpdateStandardInput(c.inputId, {
                        range: { [type]: nextVal },
                      });
                    }
                    if (feature.animatableId) {
                      onConstraintChange(feature.animatableId, (curr) => {
                        const nextConstraints = {
                          ...(curr.constraints || {}),
                        } as any;
                        const kind = type === "min" ? "min" : "max";
                        const currentVal = nextConstraints[kind] || {};
                        nextConstraints[kind] = {
                          ...(typeof currentVal === "object" ? currentVal : {}),
                          [key]: nextVal,
                        } as any;
                        return { ...curr, constraints: nextConstraints } as any;
                      });
                    }
                  }
                }}
                onScrubStart={() => {
                  if (type === "current") {
                    if (c.isBound && c.inputId)
                      scrubValuesRef.current[c.inputId] = c.currentValue ?? 0;
                    else
                      scrubValuesRef.current["current"] = c.currentValue ?? 0;
                  } else if (type === "default" && c.inputId) {
                    scrubValuesRef.current[c.inputId] = c.defaultValue ?? 0;
                  } else if (
                    (type === "min" || type === "max") &&
                    (c.inputId || feature.animatableId)
                  ) {
                    const key = c.componentLabel.toLowerCase();
                    scrubValuesRef.current[`${type}:${key}`] =
                      ((type === "min" ? c.min : c.max) as number) ?? 0;
                  }
                }}
                className={cn(
                  "text-[9px] font-bold px-1",
                  c.componentLabel === "X"
                    ? "text-red-500"
                    : c.componentLabel === "Y"
                      ? "text-green-500"
                      : c.componentLabel === "Z"
                        ? "text-blue-500"
                        : "text-text-secondary",
                )}
              />
              <input
                type="number"
                className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none"
                value={displayValue}
                step={displayStep}
                disabled={!canEdit}
                onChange={(e) => {
                  const num = parseFloat(e.target.value);
                  if (isNaN(num)) return;
                  const nextValue = toStoredValue(num);

                  if (type === "current") {
                    if (c.isLocked) {
                      return;
                    }
                    if (c.isBound && c.inputId) {
                      onValueChange(c.inputId, nextValue);
                    } else if (onStaticValueChange) {
                      if (feature.animated && feature.animatableId) {
                        onStaticValueChange(
                          feature.animatableId,
                          nextValue,
                          c.componentLabel.toLowerCase(),
                        );
                      } else if (setStaticFeatureValue && node) {
                        const current = (feature.staticValue as any) || {};
                        setStaticFeatureValue(node.id, feature.id, {
                          ...current,
                          [c.componentLabel.toLowerCase()]: nextValue,
                        });
                      }
                    }
                  } else if (type === "default" && c.inputId) {
                    onDefaultChange(c.inputId, nextValue);
                    if (
                      onStaticValueChange &&
                      (c.targetId || feature.animatableId)
                    ) {
                      onStaticValueChange(
                        c.targetId ?? feature.animatableId!,
                        nextValue,
                        c.componentLabel.toLowerCase(),
                      );
                    }
                  } else if (
                    (type === "min" || type === "max") &&
                    (c.inputId || feature.animatableId)
                  ) {
                    const key = c.componentLabel.toLowerCase();
                    if (c.inputId) {
                      onUpdateStandardInput(c.inputId, {
                        range: { [type]: nextValue },
                      });
                    }
                    if (feature.animatableId) {
                      onConstraintChange(feature.animatableId, (curr) => {
                        const nextConstraints = {
                          ...(curr.constraints || {}),
                        } as any;
                        const kind = type === "min" ? "min" : "max";
                        const currentVal = nextConstraints[kind] || {};
                        nextConstraints[kind] = {
                          ...(typeof currentVal === "object" ? currentVal : {}),
                          [key]: nextValue,
                        } as any;
                        return { ...curr, constraints: nextConstraints } as any;
                      });
                    }
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnimatableRow = () => (
    <div className="flex gap-1.5 flex-1">
      {components.map((component, index) => (
        <button
          key={index}
          type="button"
          title={`Toggle ${component.componentLabel} channel lock`}
          className={cn(
            "flex items-center justify-center gap-1.5 flex-1 h-5 rounded-sm border border-transparent transition-colors text-[10px] font-bold uppercase tracking-wider",
            component.isLocked
              ? "bg-bg-input/50 text-text-muted hover:bg-bg-input/70"
              : "bg-accent/10 text-accent hover:bg-accent/20",
          )}
          disabled={!component.targetId}
          onClick={() => {
            if (!component.targetId) {
              return;
            }
            handleSetInspectorTargetLocked(
              component.targetId,
              !component.isLocked,
            );
          }}
        >
          {component.isLocked ? (
            <Lock size={10} className="shrink-0" />
          ) : (
            <LockOpen size={10} className="shrink-0" />
          )}
          <span>{component.componentLabel}</span>
        </button>
      ))}
    </div>
  );

  return (
    <RiggingPropertyRow
      label={displayLabel}
      hasDifferentDefault={hasDifferentDefault}
      hasMinChanged={hasMinChanged}
      hasMaxChanged={hasMaxChanged}
      onResetToDefault={handleReset}
      onSaveToDefault={handleSaveToDefault}
      onSaveToMin={handleSaveToMin}
      onSaveToMax={handleSaveToMax}
      renderMainInput={() => renderInputs("current")}
      renderDefaultInput={() => renderInputs("default")}
      renderMinInput={() => renderInputs("min")}
      renderMaxInput={() => renderInputs("max")}
      renderAnimatableRow={renderAnimatableRow}
      renderRowAction={() => (
        <button
          type="button"
          className={cn(
            "p-1 rounded transition-colors",
            areAllLockableTargetsLocked
              ? "text-amber-200 hover:text-amber-100 hover:bg-amber-500/20"
              : "text-text-muted hover:text-accent hover:bg-accent/10",
          )}
          title={
            areAllLockableTargetsLocked
              ? `Unlock ${displayLabel} channels`
              : `Lock ${displayLabel} channels`
          }
          disabled={lockableTargetIds.length === 0}
          onClick={toggleRowLock}
        >
          {areAllLockableTargetsLocked ? (
            <Lock size={10} />
          ) : (
            <LockOpen size={10} />
          )}
        </button>
      )}
    />
  );
}

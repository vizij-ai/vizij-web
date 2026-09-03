import { useRef } from "react";
import type { StandardRigInput, AnimatableValue } from "@vizij/utils";
import type {
  SceneObjectNode,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { ChannelLockButton } from "../editor/atoms/ChannelLockButton";
import { cn } from "../../utils/cn";
import {
  CommitOnBlurNumberInput,
  PropertyRow,
  ScrubbableLabel,
} from "../editor/molecules/PropertyRow";
import { resolveEffectiveControllableBindingStandardInput } from "./bindingSlotResolution";
import { resolveFaceInspectorCurrentValue } from "./faceInspectorSemantics";
import { useInspectorTargetLock } from "./useInspectorTargetLock";

/**
 * A single scalar (one-float) rigging property row: current / default / min / max
 * editors plus the channel lock.
 *
 * This existed twice — once in `RiggingMaterialSection` and once in
 * `RiggingMorphTargetsSection` — and the two had quietly diverged. The material
 * copy is the one kept, because on all three points of difference it was the more
 * considered implementation. What the morph section gains:
 *
 * 1. **Edits clamp to the constraint range again.** The morph copy computed
 *    `minVal`/`maxVal` and then passed neither to `CommitOnBlurNumberInput`, so
 *    nothing bounded a typed current/default value.
 * 2. **A blocked binding is treated as unbound.** The morph copy keyed min/max and
 *    `hasDifferentDefault` off "has input metadata" rather than off `isBound`,
 *    so a binding with a `blockedReason` still read its range from the standard
 *    input and could still show the modified-from-default dot.
 *
 * The third difference was inert: the morph copy defaulted an absent constraint to
 * `0` rather than leaving it `undefined`, but the only consumer of those values
 * renders `typeof val === "number" ? val : 0`, so both produced `0` on screen. It
 * mattered solely through the clamping that the morph copy did not do.
 *
 * `feature` is typed `SceneObjectFeature` here; the morph copy had degraded to
 * `any`.
 *
 * This is a **store-bound** component (it calls `useInspectorTargetLock`), so it
 * stays in the feature layer rather than moving to `editor/`. Its reusable parts
 * are already extracted: `PropertyRow` for the chassis, `ChannelLockButton`
 * for the lock, `useRowLock` for the lock aggregation.
 */
/**
 * Also used by `RiggingColorRow` in `RiggingMaterialSection`, which takes the same
 * prop set. The name is inherited rather than chosen — worth renaming when the
 * colour and vector rows are consolidated.
 */
export interface RiggingScalarRowProps {
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

export function RiggingScalarRow({
  label,
  feature,
  bindings,
  standardInputs,
  standardInputsById,
  inputBindings,
  inputValues,
  onValueChange,
  onDefaultChange,
  onStaticValueChange,
  onConstraintChange,
  onUpdateStandardInput,
  setStaticFeatureValue,
  node,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});

  const component = feature.components[0];
  // Called before the early return below so the hook order stays stable for
  // features that expose no components.
  const rowLock = useInspectorTargetLock(component?.targetId);
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

  const isBound = !!(inputId && standardInput) && !blockedReason;
  const authority = resolveFaceInspectorCurrentValue({
    inputId,
    standardInput,
    unresolvedInputId,
    blockedReason,
    inputValues,
    staticValue: component.staticValue ?? 0,
  });
  const isChannelLocked = rowLock.isLocked;

  // Undefined means the constraint is unbounded — don't clamp edits to it.
  const minVal: number | undefined = isBound
    ? standardInput!.range.min
    : (feature.descriptor?.constraints as any)?.min;
  const maxVal: number | undefined = isBound
    ? standardInput!.range.max
    : (feature.descriptor?.constraints as any)?.max;

  const currentValue = authority.currentValue;

  const defaultValue = isBound
    ? (standardInput!.defaultValue ?? 0)
    : (component.staticValue ?? 0);

  const hasDifferentDefault =
    isBound &&
    Math.abs((currentValue as number) - (defaultValue as number)) > 0.0001;

  const handleReset = () => {
    if (isBound && inputId) onValueChange(inputId, defaultValue as number);
  };

  const renderInput = (type: "current" | "default" | "min" | "max") => {
    let val: number | undefined;
    let canEdit = true;

    if (type === "current") {
      val = currentValue as number;
      canEdit = !isChannelLocked && (isBound || !!onStaticValueChange);
    } else if (type === "default") {
      val = defaultValue as number;
      canEdit = !isChannelLocked && isBound;
    } else if (type === "min") {
      val = minVal;
      canEdit = !isChannelLocked && Boolean(inputId || feature.animatableId);
    } else if (type === "max") {
      val = maxVal;
      canEdit = !isChannelLocked && Boolean(inputId || feature.animatableId);
    }

    return (
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
          onScrub={
            canEdit
              ? (_delta, totalDelta) => {
                  const step = 0.01;
                  if (type === "current") {
                    if (isBound && inputId) {
                      const startVal = scrubValuesRef.current[inputId] ?? 0;
                      onValueChange(inputId, startVal + totalDelta * step);
                    } else if (onStaticValueChange) {
                      const startValueToUse =
                        scrubValuesRef.current["current"] ?? 0;
                      const newVal = startValueToUse + totalDelta * step;
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
                    if (
                      onStaticValueChange &&
                      (targetId || feature.animatableId)
                    ) {
                      onStaticValueChange(
                        targetId ?? feature.animatableId!,
                        nextVal,
                      );
                    }
                  } else if (
                    (type === "min" || type === "max") &&
                    (inputId || feature.animatableId)
                  ) {
                    const startVal = scrubValuesRef.current[type] ?? 0;
                    const nextVal = startVal + totalDelta * step;
                    if (inputId) {
                      onUpdateStandardInput(inputId, {
                        range: { [type]: nextVal },
                      });
                    }
                    if (feature.animatableId) {
                      onConstraintChange?.(
                        feature.animatableId,
                        (curr: AnimatableValue) => {
                          const nextConstraints = {
                            ...(curr.constraints || {}),
                          } as any;
                          nextConstraints[type === "min" ? "min" : "max"] =
                            nextVal;
                          return {
                            ...curr,
                            constraints: nextConstraints,
                          } as AnimatableValue;
                        },
                      );
                    }
                  }
                }
              : undefined
          }
          onScrubStart={() => {
            if (type === "current") {
              if (isBound && inputId)
                scrubValuesRef.current[inputId] = (currentValue as number) ?? 0;
              else
                scrubValuesRef.current["current"] =
                  (currentValue as number) ?? 0;
            } else if (type === "default" && inputId) {
              scrubValuesRef.current[inputId] = (defaultValue as number) ?? 0;
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
        <CommitOnBlurNumberInput
          value={typeof val === "number" ? val : 0}
          step={0.01}
          min={type === "current" || type === "default" ? minVal : undefined}
          max={type === "current" || type === "default" ? maxVal : undefined}
          disabled={!canEdit}
          className="pl-1"
          onCommit={(num) => {
            if (type === "current") {
              if (isBound && inputId) onValueChange(inputId, num);
              else if (onStaticValueChange) {
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
                onConstraintChange?.(
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
  };

  return (
    <PropertyRow
      label={label}
      hasDifferentDefault={hasDifferentDefault}
      onResetToDefault={handleReset}
      renderMainInput={() => renderInput("current")}
      renderDefaultInput={() => renderInput("default")}
      renderMinInput={() => renderInput("min")}
      renderMaxInput={() => renderInput("max")}
      renderRowAction={() => (
        <ChannelLockButton
          locked={isChannelLocked}
          title={isChannelLocked ? `Unlock ${label}` : `Lock ${label}`}
          disabled={!rowLock.canToggle}
          onToggle={rowLock.toggle}
        />
      )}
    />
  );
}

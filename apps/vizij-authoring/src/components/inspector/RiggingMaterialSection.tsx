import React, { useRef } from "react";
import type { StandardRigInput, AnimatableValue } from "@vizij/utils";
import { HexColorPicker } from "react-colorful";
import { Popover as RadixPopover } from "radix-ui";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { Select, Button } from "../ui";
import { cn } from "../../utils/cn";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { ChannelLockButton } from "../editor/atoms/ChannelLockButton";
import { ChannelLockStrip } from "../editor/atoms/ChannelLockStrip";
import {
  CommitOnBlurNumberInput,
  RiggingPropertyRow,
  ScrubbableLabel,
} from "./RiggingPropertyRow";
import { resolveEffectiveControllableBindingStandardInput } from "./bindingSlotResolution";
import { resolveFaceInspectorCurrentValue } from "./faceInspectorSemantics";
import { useInspectorTargetLock } from "./useInspectorTargetLock";
import {
  RiggingScalarRow,
  type RiggingScalarRowProps,
} from "./RiggingScalarRow";

interface RiggingMaterialSectionProps {
  node: SceneObjectNode;
}

export function RiggingMaterialSection({ node }: RiggingMaterialSectionProps) {
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

  const { handleSelectMaterial } = useUnifiedSelection();

  const {
    materials,
    assignMaterial,
    duplicateMaterial,
    setAnimatableValue,
    updateAnimatableDescriptor,
    setStaticFeatureValue,
  } = useSceneComposer();

  // Helper to find feature by key
  const findFeature = (key: string) =>
    node.features.find((f) => f.key.toLowerCase() === key.toLowerCase());

  const colorRows = [
    { key: "color", label: "Color" },
    { key: "emissive", label: "Emissive" },
    { key: "specular", label: "Specular" },
  ]
    .map((row) => ({ ...row, feature: findFeature(row.key) }))
    .filter((row) => row.feature);

  const scalarRows = [
    { key: "opacity", label: "Opacity" },
    { key: "roughness", label: "Roughness" },
    { key: "metalness", label: "Metalness" },
    { key: "shininess", label: "Shininess" },
    { key: "emissiveIntensity", label: "Emissive Intensity" },
  ]
    .map((row) => ({ ...row, feature: findFeature(row.key) }))
    .filter((row) => row.feature);

  // Material Logic
  const currentMaterial =
    materials.find((entry) => entry.memberShapeIds.includes(node.id)) ?? null;
  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: m.label,
  }));

  // If node isn't a shape that supports material, skip material selector
  const showMaterialSelector = node.type === "shape";

  const handleStaticValueChange = (
    targetId: string,
    value: number,
    channel?: string,
  ) => {
    setAnimatableValue(targetId, value, { channel, saveToDefault: true });
  };

  if (
    !showMaterialSelector &&
    colorRows.length === 0 &&
    scalarRows.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5 bg-bg-panel/40 rounded-lg border border-border-default/50 mt-0.5">
      <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-0.5 px-0.5">
        Appearance
      </div>

      {showMaterialSelector && (
        <div className="flex flex-col gap-1.5 mb-1.5">
          <div className="flex items-center gap-2 p-1 pl-2 min-h-[32px] border border-border-default/20 bg-bg-secondary/10 rounded-lg">
            <span className="text-[11px] font-medium text-text-secondary select-none flex-1">
              Material
            </span>
            <div className="flex-1 min-w-[120px]">
              <Select
                value={currentMaterial?.id ?? ""}
                options={[{ value: "", label: "None" }, ...materialOptions]}
                onChange={(val) => assignMaterial(node.id, val)}
                size="sm"
                className="h-6 text-[11px]"
              />
            </div>
          </div>

          {currentMaterial && currentMaterial.memberShapeIds.length > 1 && (
            <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-accent/5 rounded-lg border border-accent/10">
              <div className="text-[10px] text-text-muted leading-relaxed">
                This edits{" "}
                <span
                  className="text-text-primary font-medium cursor-pointer hover:underline decoration-accent/50 underline-offset-2"
                  onClick={() => handleSelectMaterial(currentMaterial.id)}
                >
                  {currentMaterial.label}
                </span>{" "}
                and will impact{" "}
                <span className="text-text-primary font-bold">
                  {currentMaterial.memberShapeIds.length}
                </span>{" "}
                shapes.
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] w-full justify-start px-0 text-accent hover:text-accent-hover hover:bg-transparent -ml-0.5"
                onClick={() =>
                  duplicateMaterial(node.id, {
                    label: `${node.name || node.id} Color`,
                  })
                }
              >
                Create new material instead for this shape
              </Button>
            </div>
          )}
        </div>
      )}

      {colorRows.map((row) => (
        <RiggingColorRow
          key={row.key}
          label={row.label}
          feature={row.feature!}
          bindings={bindings}
          standardInputs={standardInputs}
          standardInputsById={standardInputsById}
          inputBindings={inputBindings}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id: string, val: number) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
          onStaticValueChange={handleStaticValueChange}
          onConstraintChange={updateAnimatableDescriptor}
          onUpdateStandardInput={handleUpdateStandardInput}
          setStaticFeatureValue={setStaticFeatureValue}
          node={node}
        />
      ))}

      {scalarRows.map((row) => (
        <RiggingScalarRow
          key={row.key}
          label={row.label}
          feature={row.feature!}
          bindings={bindings}
          standardInputs={standardInputs}
          standardInputsById={standardInputsById}
          inputBindings={inputBindings}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id: string, val: number) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
          onStaticValueChange={handleStaticValueChange}
          onConstraintChange={updateAnimatableDescriptor}
          onUpdateStandardInput={handleUpdateStandardInput}
          setStaticFeatureValue={setStaticFeatureValue}
          node={node}
        />
      ))}
    </div>
  );
}

export function RiggingColorRow({
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
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
  );

  const getCompData = (key: string, fallbackIndex: number) => {
    const comp =
      feature.components.find(
        (c) =>
          c.componentKey?.toLowerCase() === key ||
          c.label.toLowerCase() === key,
      ) || feature.components[fallbackIndex];

    if (!comp) return null;

    const compLabel = comp.componentKey?.toUpperCase() ?? comp.label;
    const targetId = comp.targetId;
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
      staticValue: comp.staticValue ?? 0,
    });
    const isLocked = Boolean(
      targetId && lockedInspectorTargetIds.has(targetId),
    );
    const currentValue = authority.currentValue;
    const defaultValue = isBound
      ? (standardInput!.defaultValue ?? 0)
      : (comp.staticValue ?? 0);

    const min = isBound ? standardInput!.range.min : 0;
    const max = isBound ? standardInput!.range.max : 1;

    return {
      label: compLabel,
      inputId,
      targetId,
      isLocked,
      currentValue,
      currentValueSource: authority.sourceLabel,
      defaultValue,
      min,
      max,
      isBound,
      unresolvedInputId,
      blockedReason,
    };
  };

  const rComp = getCompData("r", 0);
  const gComp = getCompData("g", 1);
  const bComp = getCompData("b", 2);

  const components = [rComp, gComp, bComp].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );

  // Before the early return: hook order must not depend on how many channels
  // resolved.
  const rowLock = useInspectorTargetLock(
    components.map((component) => component.targetId),
  );

  if (components.length === 0) return null;

  const hasDifferentDefault = components.some(
    (c) =>
      c.isBound &&
      Math.abs((c.currentValue as number) - (c.defaultValue as number)) >
        0.0001,
  );

  const handleReset = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId)
        onValueChange(c.inputId, c.defaultValue as number);
    });
  };

  const areAllLockableTargetsLocked = rowLock.isLocked;

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (c: number) => {
      const hex = Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
        }
      : null;
  };

  const renderInputs = (type: "current" | "default" | "min" | "max") => {
    let rVal: number | undefined;
    let gVal: number | undefined;
    let bVal: number | undefined;

    if (type === "current") {
      rVal = rComp?.currentValue as number;
      gVal = gComp?.currentValue as number;
      bVal = bComp?.currentValue as number;
    } else if (type === "default") {
      rVal = rComp?.defaultValue as number;
      gVal = gComp?.defaultValue as number;
      bVal = bComp?.defaultValue as number;
    } else if (type === "min") {
      rVal = rComp?.min as number;
      gVal = gComp?.min as number;
      bVal = bComp?.min as number;
    } else if (type === "max") {
      rVal = rComp?.max as number;
      gVal = gComp?.max as number;
      bVal = bComp?.max as number;
    }

    const hexColor = rgbToHex(
      (rVal ?? 0) as number,
      (gVal ?? 0) as number,
      (bVal ?? 0) as number,
    );

    const canEditAny =
      type === "current"
        ? components.every((c) => !c.isLocked) &&
          components.some(
            (c) => !c.isLocked && (c.isBound || !!onStaticValueChange),
          )
        : type === "default"
          ? components.every((c) => !c.isLocked) &&
            components.some((c) => !c.isLocked && c.isBound)
          : components.every((c) => !c.isLocked) &&
            components.some(
              (c) => !c.isLocked && Boolean(c.inputId || feature.animatableId),
            );

    const handleColorChange = (newHex: string) => {
      const rgb = hexToRgb(newHex);
      if (!rgb) return;

      if (type === "current" || type === "default") {
        [
          { comp: rComp, val: rgb.r },
          { comp: gComp, val: rgb.g },
          { comp: bComp, val: rgb.b },
        ].forEach(({ comp, val }) => {
          if (!comp) return;
          if (type === "current" && comp.isLocked) {
            return;
          }
          if (comp.isBound && comp.inputId) {
            if (type === "current") onValueChange(comp.inputId, val);
            else onDefaultChange(comp.inputId, val);
          }
          if (
            type === "default" &&
            onStaticValueChange &&
            (comp.targetId || feature.animatableId)
          ) {
            onStaticValueChange(
              comp.targetId ?? feature.animatableId!,
              val,
              comp.label.toLowerCase(),
            );
          } else if (type === "current" && onStaticValueChange) {
            if (feature.animated && feature.animatableId) {
              onStaticValueChange(
                feature.animatableId,
                val,
                comp.label.toLowerCase(),
              );
            } else if (setStaticFeatureValue && node) {
              const current = (feature.staticValue as any) || {};
              setStaticFeatureValue(node.id, feature.id, {
                ...current,
                [comp.label.toLowerCase()]: val,
              });
            }
          }
        });
      } else if (feature.animatableId) {
        onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
          const nextConstraints = { ...(curr.constraints || {}) } as any;
          const kind = type === "min" ? "min" : "max";
          const currentVals = { ...(nextConstraints[kind] || {}) };
          currentVals.r = rgb.r;
          currentVals.g = rgb.g;
          currentVals.b = rgb.b;
          nextConstraints[kind] = currentVals;
          return { ...curr, constraints: nextConstraints } as AnimatableValue;
        });
      }
    };

    return (
      <div className="flex gap-1 flex-1 items-center min-w-0">
        <RadixPopover.Root>
          <RadixPopover.Trigger
            className={cn(
              "w-6 h-5 rounded-sm border border-border-default shadow-sm",
              canEditAny
                ? "cursor-pointer hover:border-accent/50"
                : "cursor-not-allowed opacity-50",
            )}
            style={{ backgroundColor: hexColor }}
            disabled={!canEditAny}
            title="Pick Color"
          />
          <RadixPopover.Portal>
            <RadixPopover.Content
              side="bottom"
              align="start"
              sideOffset={5}
              className="z-[100] flex flex-col gap-2 p-2 bg-bg-panel border border-border-default rounded-lg shadow-xl"
            >
              <HexColorPicker color={hexColor} onChange={handleColorChange} />
              <div className="flex gap-1">
                <div className="text-[10px] bg-bg-input px-1 py-0.5 rounded text-text-muted font-mono select-all uppercase">
                  {hexColor}
                </div>
              </div>
            </RadixPopover.Content>
          </RadixPopover.Portal>
        </RadixPopover.Root>

        <div className="flex gap-1.5 flex-1 min-w-0">
          {components.map((c, i) => {
            let compVal: number | undefined;
            if (c === rComp) compVal = rVal;
            else if (c === gComp) compVal = gVal;
            else if (c === bComp) compVal = bVal;

            const canEditComp =
              type === "current"
                ? !c.isLocked && (c.isBound || !!onStaticValueChange)
                : type === "default"
                  ? !c.isLocked && c.isBound
                  : !c.isLocked && Boolean(c.inputId || feature.animatableId);

            const labelKey = c === rComp ? "R" : c === gComp ? "G" : "B";
            const labelColor =
              c === rComp
                ? "text-red-500"
                : c === gComp
                  ? "text-green-500"
                  : "text-blue-500";

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
                  canEditComp ? "focus-within:border-accent/50" : "opacity-70",
                )}
              >
                <ScrubbableLabel
                  label={labelKey}
                  onScrub={
                    canEditComp
                      ? (_delta, totalDelta) => {
                          const step = 0.01;
                          const scrubKey = c.isBound
                            ? c.inputId!
                            : c.targetId || `static-${type}-${labelKey}`;
                          const startVal =
                            scrubValuesRef.current[scrubKey] ?? 0;
                          const nextVal = startVal + totalDelta * step;

                          if (type === "current") {
                            if (c.isBound && c.inputId)
                              onValueChange(c.inputId, nextVal);
                            else if (onStaticValueChange) {
                              if (feature.animated && feature.animatableId) {
                                onStaticValueChange(
                                  feature.animatableId,
                                  nextVal,
                                  c.label.toLowerCase(),
                                );
                              } else if (setStaticFeatureValue && node) {
                                const current =
                                  (feature.staticValue as any) || {};
                                setStaticFeatureValue(node.id, feature.id, {
                                  ...current,
                                  [c.label.toLowerCase()]: nextVal,
                                });
                              }
                            }
                          } else if (type === "default" && c.inputId) {
                            onUpdateStandardInput(c.inputId, {
                              defaultValue: nextVal,
                            });
                            if (
                              onStaticValueChange &&
                              (c.targetId || feature.animatableId)
                            ) {
                              onStaticValueChange(
                                c.targetId ?? feature.animatableId!,
                                nextVal,
                                c.label.toLowerCase(),
                              );
                            }
                          } else if (c.inputId || feature.animatableId) {
                            if (c.inputId) {
                              onUpdateStandardInput(c.inputId, {
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
                                  const kind = type === "min" ? "min" : "max";
                                  const currentVal =
                                    nextConstraints[kind] || {};
                                  nextConstraints[kind] = {
                                    ...(typeof currentVal === "object"
                                      ? currentVal
                                      : {}),
                                    [c.label.toLowerCase()]: nextVal,
                                  } as any;
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
                    const scrubKey = c.isBound
                      ? c.inputId!
                      : c.targetId || `static-${type}-${labelKey}`;
                    scrubValuesRef.current[scrubKey] = (compVal as number) ?? 0;
                  }}
                  className={cn(
                    "text-[9px] font-bold px-1 select-none transition-colors",
                    labelColor,
                  )}
                />
                <CommitOnBlurNumberInput
                  value={typeof compVal === "number" ? compVal : 0}
                  step={0.01}
                  min={0}
                  max={1}
                  disabled={!canEditComp}
                  onCommit={(num) => {
                    if (type === "current") {
                      if (c.isBound && c.inputId) onValueChange(c.inputId, num);
                      else if (onStaticValueChange) {
                        if (feature.animated && feature.animatableId) {
                          onStaticValueChange(
                            feature.animatableId,
                            num,
                            c.label.toLowerCase(),
                          );
                        } else if (setStaticFeatureValue && node) {
                          const current = (feature.staticValue as any) || {};
                          setStaticFeatureValue(node.id, feature.id, {
                            ...current,
                            [c.label.toLowerCase()]: num,
                          });
                        }
                      }
                    } else if (type === "default" && c.inputId) {
                      onUpdateStandardInput(c.inputId, { defaultValue: num });
                      if (
                        onStaticValueChange &&
                        (c.targetId || feature.animatableId)
                      ) {
                        onStaticValueChange(
                          c.targetId ?? feature.animatableId!,
                          num,
                          c.label.toLowerCase(),
                        );
                      }
                    } else if (c.inputId || feature.animatableId) {
                      if (c.inputId) {
                        onUpdateStandardInput(c.inputId, {
                          range: { [type]: num },
                        });
                      }
                      if (feature.animatableId) {
                        onConstraintChange?.(
                          feature.animatableId,
                          (curr: AnimatableValue) => {
                            const nextConstraints = {
                              ...(curr.constraints || {}),
                            } as any;
                            const kind = type === "min" ? "min" : "max";
                            const currentVal = nextConstraints[kind] || {};
                            nextConstraints[kind] = {
                              ...(typeof currentVal === "object"
                                ? currentVal
                                : {}),
                              [c.label.toLowerCase()]: num,
                            } as any;
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
          })}
        </div>
      </div>
    );
  };

  const renderAnimatableRow = () => (
    <ChannelLockStrip
      channels={components.map((component) => ({
        id: component.targetId ?? null,
        // `label` here is already `R`/`G`/`B` in practice; the truncation is
        // kept so a component that somehow carries a longer label still fits
        // the pill, exactly as before.
        shortLabel: component.label.substring(0, 1),
        locked: component.isLocked,
        title: `Toggle ${component.label} channel lock`,
      }))}
      onToggle={handleSetInspectorTargetLocked}
    />
  );

  return (
    <RiggingPropertyRow
      label={label}
      hasDifferentDefault={hasDifferentDefault}
      onResetToDefault={handleReset}
      renderMainInput={() => renderInputs("current")}
      renderDefaultInput={() => renderInputs("default")}
      renderMinInput={() => renderInputs("min")}
      renderMaxInput={() => renderInputs("max")}
      renderAnimatableRow={renderAnimatableRow}
      renderRowAction={() => (
        <ChannelLockButton
          locked={areAllLockableTargetsLocked}
          title={
            areAllLockableTargetsLocked
              ? "Unlock color channels"
              : "Lock color channels"
          }
          disabled={!rowLock.canToggle}
          onToggle={rowLock.toggle}
        />
      )}
    />
  );
}

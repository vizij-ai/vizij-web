import React, { useRef } from "react";
import { Lock, LockOpen, Palette, Box, ChevronRight, Info } from "lucide-react";
import type { StandardRigInput, AnimatableValue } from "@vizij/utils";

import { HexColorPicker } from "react-colorful";
import { Popover as BasePopover } from "@base-ui/react";
import type {
  SceneObjectNode,
  SceneObjectFeature,
} from "../../scene/sceneGraph";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";
import { Select, Button } from "../ui";
import { cn } from "../../utils/cn";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { resolveEffectiveControllableBindingStandardInput } from "./bindingSlotResolution";

interface RiggingMaterialSectionProps {
  node: SceneObjectNode;
}

export function RiggingMaterialSection({ node }: RiggingMaterialSectionProps) {
  const {
    bindings,
    standardInputs,
    standardInputsById,
    inputBindings,
    inputValues,
    handleInputValueChange,
    handleUpdateStandardInput,
  } = useBindingAuthoring((state) => state);

  const { handleSelectMaterial } = useUnifiedSelection();

  const { materials, assignMaterial, duplicateMaterial, setAnimatableValue, setFeatureAnimated, updateAnimatableDescriptor, setStaticFeatureValue } =
    useSceneComposer();


  // Helper to find feature by key
  const findFeature = (key: string) =>
    node.features.find((f) => f.key.toLowerCase() === key.toLowerCase());

  const colorFeature = findFeature("color");
  const opacityFeature = findFeature("opacity");

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

  if (!showMaterialSelector && !colorFeature && !opacityFeature) {
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

      {colorFeature && (
        <RiggingColorRow
          label="Color"
          feature={colorFeature}
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
          onToggleAnimated={(animated: boolean) => setFeatureAnimated(node.id, colorFeature.id, animated)}
          onConstraintChange={updateAnimatableDescriptor}
          onUpdateStandardInput={handleUpdateStandardInput}
          setStaticFeatureValue={setStaticFeatureValue}
          node={node}
        />
      )}

      {opacityFeature && (
        <RiggingScalarRow
          label="Opacity"
          feature={opacityFeature}
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
          onToggleAnimated={(animated: boolean) => setFeatureAnimated(node.id, opacityFeature.id, animated)}
          onConstraintChange={updateAnimatableDescriptor}
          onUpdateStandardInput={handleUpdateStandardInput}
          setStaticFeatureValue={setStaticFeatureValue}
          node={node}
        />
      )}
    </div>
  );
}

interface RiggingScalarRowProps {
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
  onToggleAnimated: (animated: boolean) => void;
  onConstraintChange: (id: string, updater: (curr: AnimatableValue) => AnimatableValue) => void;
  onStaticValueChange?: (targetId: string, value: number, channel?: string) => void;
  onUpdateStandardInput: (id: string, updates: any) => void;
  setStaticFeatureValue?: (nodeId: string, featureId: string, value: any) => void;
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
  onToggleAnimated,
  onConstraintChange,
  onUpdateStandardInput,
  setStaticFeatureValue,
  node,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});

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

  const isBound = !!(inputId && standardInput) && !blockedReason;

  const minVal = isBound ? (standardInput!.range.min) : ((feature.descriptor?.constraints as any)?.min ?? 0);
  const maxVal = isBound ? (standardInput!.range.max) : ((feature.descriptor?.constraints as any)?.max ?? 0);

  const currentValue = isBound
    ? (inputValues[inputId!] ?? standardInput!.defaultValue ?? 0)
    : (component.staticValue ?? 0);

  const defaultValue = isBound
    ? (standardInput!.defaultValue ?? 0)
    : (component.staticValue ?? 0);

  const hasDifferentDefault =
    isBound &&
    Math.abs((currentValue as number) - (defaultValue as number)) > 0.0001;

  const handleReset = () => {
    if (isBound && inputId) onValueChange(inputId, defaultValue as number);
  };

  const handleSaveToDefault = () => {
    if (isBound && inputId) onUpdateStandardInput(inputId, { defaultValue: currentValue as number });
  };

  const hasMinChanged = Math.abs((currentValue as number) - (minVal as number)) > 0.0001;
  const hasMaxChanged = Math.abs((currentValue as number) - (maxVal as number)) > 0.0001;

  const handleSaveToMin = () => {
    if (isBound && inputId) {
      onUpdateStandardInput(inputId, { range: { min: currentValue as number } });
    } else if (feature.animatableId) {
      onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        nextConstraints.min = currentValue;
        return { ...curr, constraints: nextConstraints } as AnimatableValue;
      });
    }
  };

  const handleSaveToMax = () => {
    if (isBound && inputId) {
      onUpdateStandardInput(inputId, { range: { max: currentValue as number } });
    } else if (feature.animatableId) {
      onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
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
      val = currentValue as number;
      canEdit = isBound || !!onStaticValueChange;
    } else if (type === "default") {
      val = defaultValue as number;
      canEdit = isBound;
    } else if (type === "min") {
      val = minVal;
      canEdit = true;
    } else if (type === "max") {
      val = maxVal;
      canEdit = true;
    }

    return (
      <div
        className={cn(
          "flex items-center bg-bg-input/50 rounded-sm border border-transparent relative flex-1 min-w-0 h-5 group/row",
          canEdit ? "focus-within:border-accent/50" : "opacity-70",
        )}
      >
        <ScrubbableLabel
          label={label}
          onScrub={(_, totalDelta) => {
            const step = 0.01;
            if (type === "current") {
              if (isBound && inputId) {
                const startVal = scrubValuesRef.current[inputId] ?? 0;
                onValueChange(inputId, startVal + totalDelta * step);
              } else if (onStaticValueChange) {
                const startValueToUse = scrubValuesRef.current["current"] ?? 0;
                const newVal = startValueToUse + totalDelta * step;
                if (feature.animated && feature.animatableId) {
                  onStaticValueChange(feature.animatableId, newVal);
                } else if (setStaticFeatureValue && node) {
                  setStaticFeatureValue(node.id, feature.id, newVal);
                }
              }
            } else if (type === "default" && inputId) {
              const startVal = scrubValuesRef.current[inputId] ?? 0;
              onDefaultChange(inputId, startVal + totalDelta * step);
            } else if ((type === "min" || type === "max") && (inputId || feature.animatableId)) {
              const startVal = scrubValuesRef.current[type] ?? 0;
              const nextVal = startVal + totalDelta * step;
              if (isBound && inputId) {
                onUpdateStandardInput(inputId, { range: { [type]: nextVal } });
              } else if (feature.animatableId) {
                onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
                  const nextConstraints = { ...(curr.constraints || {}) } as any;
                  nextConstraints[type === "min" ? "min" : "max"] = nextVal;
                  return { ...curr, constraints: nextConstraints } as AnimatableValue;
                });
              }
            }
          }}
          onScrubStart={() => {
            if (type === "current") {
              if (isBound && inputId) scrubValuesRef.current[inputId] = (currentValue as number) ?? 0;
              else scrubValuesRef.current["current"] = (currentValue as number) ?? 0;
            } else if (type === "default" && inputId) {
              scrubValuesRef.current[inputId] = (defaultValue as number) ?? 0;
            } else if ((type === "min" || type === "max") && (inputId || feature.animatableId)) {
              scrubValuesRef.current[type] = (type === "min" ? minVal : maxVal) ?? 0;
            }
          }}
          className="text-[9px] font-bold px-1 select-none transition-colors text-text-muted"
        />
        <input
          type="number"
          className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none pl-1"
          value={typeof val === "number" ? val : 0}
          step={0.01}
          min={0}
          max={1}
          disabled={!canEdit}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            if (isNaN(num)) return;
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
            } else if ((type === "min" || type === "max") && (inputId || feature.animatableId)) {
              if (isBound && inputId) {
                onUpdateStandardInput(inputId, { range: { [type]: num } });
              } else if (feature.animatableId) {
                onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
                  const nextConstraints = { ...(curr.constraints || {}) } as any;
                  nextConstraints[type === "min" ? "min" : "max"] = num;
                  return { ...curr, constraints: nextConstraints } as AnimatableValue;
                });
              }
            }
          }}
        />
      </div>
    );
  };

  const renderAnimatableRow = () => (
    <div className="flex gap-1.5 flex-1">
      <button
        className={cn(
          "flex items-center justify-center gap-1.5 flex-1 h-5 rounded-sm border border-transparent transition-colors text-[10px] font-bold uppercase tracking-wider",
          feature.animated
            ? "bg-accent/10 text-accent hover:bg-accent/20"
            : "bg-bg-input/50 text-text-muted hover:bg-bg-input/70",
        )}
        onClick={() => onToggleAnimated?.(!feature.animated)}
      >
        {feature.animated ? (
          <LockOpen size={10} className="shrink-0" />
        ) : (
          <Lock size={10} className="shrink-0" />
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
  onToggleAnimated,
  onConstraintChange,
  onUpdateStandardInput,
  setStaticFeatureValue,
  node,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});

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
    const currentValue = isBound
      ? (inputValues[inputId!] ?? standardInput!.defaultValue ?? 0)
      : (comp.staticValue ?? 0);
    const defaultValue = isBound
      ? (standardInput!.defaultValue ?? 0)
      : (comp.staticValue ?? 0);

    const min = isBound ? (standardInput!.range.min) : 0;
    const max = isBound ? (standardInput!.range.max) : 1;

    return {
      label: compLabel,
      inputId,
      targetId,
      currentValue,
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

  const handleSaveToDefault = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId)
        onUpdateStandardInput(c.inputId, { defaultValue: c.currentValue as number });
    });
  };

  const hasMinChanged = components.some(c => Math.abs((c.currentValue as number) - (c.min as number)) > 0.0001);
  const hasMaxChanged = components.some(c => Math.abs((c.currentValue as number) - (c.max as number)) > 0.0001);

  const handleSaveToMin = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId) {
        onUpdateStandardInput(c.inputId, { range: { min: c.currentValue as number } });
      }
    });

    if (feature.animatableId) {
      onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        const currentVals = { ...(nextConstraints.min || {}) };
        components.forEach((c) => {
          if (!c.isBound) {
            currentVals[c.label.toLowerCase()] = c.currentValue;
          }
        });
        nextConstraints.min = currentVals;
        return { ...curr, constraints: nextConstraints } as AnimatableValue;
      });
    }
  };

  const handleSaveToMax = () => {
    components.forEach((c) => {
      if (c.isBound && c.inputId) {
        onUpdateStandardInput(c.inputId, { range: { max: c.currentValue as number } });
      }
    });

    if (feature.animatableId) {
      onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
        const nextConstraints = { ...(curr.constraints || {}) } as any;
        const currentVals = { ...(nextConstraints.max || {}) };
        components.forEach((c) => {
          if (!c.isBound) {
            currentVals[c.label.toLowerCase()] = c.currentValue;
          }
        });
        nextConstraints.max = currentVals;
        return { ...curr, constraints: nextConstraints } as AnimatableValue;
      });
    }
  };

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

    const canEditAny = type === "current"
      ? (components.some((c) => c.isBound) || !!onStaticValueChange)
      : (type === "default" ? components.some(c => c.isBound) : !!feature.animatableId);

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
          if (comp.isBound && comp.inputId) {
            if (type === "current") onValueChange(comp.inputId, val);
            else onDefaultChange(comp.inputId, val);
          } else if (type === "current" && onStaticValueChange) {
            if (feature.animated && feature.animatableId) {
              onStaticValueChange(feature.animatableId, val, comp.label.toLowerCase());
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
        <BasePopover.Root>
          <BasePopover.Trigger
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
          <BasePopover.Portal>
            <BasePopover.Positioner
              side="bottom"
              align="start"
              sideOffset={5}
              className="z-[100]"
            >
              <BasePopover.Popup className="flex flex-col gap-2 p-2 bg-bg-panel border border-border-default rounded-lg shadow-xl">
                <HexColorPicker color={hexColor} onChange={handleColorChange} />
                <div className="flex gap-1">
                  <div className="text-[10px] bg-bg-input px-1 py-0.5 rounded text-text-muted font-mono select-all uppercase">
                    {hexColor}
                  </div>
                </div>
              </BasePopover.Popup>
            </BasePopover.Positioner>
          </BasePopover.Portal>
        </BasePopover.Root>

        <div className="flex gap-1.5 flex-1 min-w-0">
          {components.map((c, i) => {
            let compVal: number | undefined;
            if (c === rComp) compVal = rVal;
            else if (c === gComp) compVal = gVal;
            else if (c === bComp) compVal = bVal;

            const canEditComp = type === "current"
              ? (c.isBound || !!onStaticValueChange)
              : (type === "default" ? c.isBound : !!feature.animatableId);

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
                className={cn(
                  "flex items-center bg-bg-input/50 rounded-sm border border-transparent relative flex-1 min-w-0 h-5 group/row",
                  canEditComp ? "focus-within:border-accent/50" : "opacity-70",
                )}
              >
                <ScrubbableLabel
                  label={labelKey}
                  onScrub={(_, totalDelta) => {
                    const step = 0.01;
                    const scrubKey = c.isBound ? (c.inputId!) : (c.targetId || `static-${type}-${labelKey}`);
                    const startVal = scrubValuesRef.current[scrubKey] ?? 0;
                    const nextVal = startVal + totalDelta * step;

                    if (type === "current") {
                      if (c.isBound && c.inputId) onValueChange(c.inputId, nextVal);
                      else if (onStaticValueChange) {
                        if (feature.animated && feature.animatableId) {
                          onStaticValueChange(feature.animatableId, nextVal, c.label.toLowerCase());
                        } else if (setStaticFeatureValue && node) {
                          const current = (feature.staticValue as any) || {};
                          setStaticFeatureValue(node.id, feature.id, {
                            ...current,
                            [c.label.toLowerCase()]: nextVal,
                          });
                        }
                      }
                    } else if (type === "default" && c.inputId) {
                      onUpdateStandardInput(c.inputId, { defaultValue: nextVal });
                    } else if (c.inputId || feature.animatableId) {
                      if (c.isBound && c.inputId) {
                        onUpdateStandardInput(c.inputId, { range: { [type]: nextVal } });
                      } else if (feature.animatableId) {
                        onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
                          const nextConstraints = { ...(curr.constraints || {}) } as any;
                          const kind = type === "min" ? "min" : "max";
                          const currentVal = nextConstraints[kind] || {};
                          nextConstraints[kind] = {
                            ...(typeof currentVal === "object" ? currentVal : {}),
                            [c.label.toLowerCase()]: nextVal,
                          } as any;
                          return { ...curr, constraints: nextConstraints } as AnimatableValue;
                        });
                      }
                    }
                  }}
                  onScrubStart={() => {
                    const scrubKey = c.isBound ? (c.inputId!) : (c.targetId || `static-${type}-${labelKey}`);
                    scrubValuesRef.current[scrubKey] = (compVal as number) ?? 0;
                  }}
                  className={cn(
                    "text-[9px] font-bold px-1 select-none transition-colors",
                    labelColor,
                  )}
                />
                <input
                  type="number"
                  className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none"
                  value={typeof compVal === "number" ? compVal : 0}
                  step={0.01}
                  min={0}
                  max={1}
                  disabled={!canEditComp}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (isNaN(num)) return;
                    if (type === "current") {
                      if (c.isBound && c.inputId) onValueChange(c.inputId, num);
                      else if (onStaticValueChange) {
                        if (feature.animated && feature.animatableId) {
                          onStaticValueChange(feature.animatableId, num, c.label.toLowerCase());
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
                    } else if (c.inputId || feature.animatableId) {
                      if (c.isBound && c.inputId) {
                        onUpdateStandardInput(c.inputId, { range: { [type]: num } });
                      } else if (feature.animatableId) {
                        onConstraintChange?.(feature.animatableId, (curr: AnimatableValue) => {
                          const nextConstraints = { ...(curr.constraints || {}) } as any;
                          const kind = type === "min" ? "min" : "max";
                          const currentVal = nextConstraints[kind] || {};
                          nextConstraints[kind] = {
                            ...(typeof currentVal === "object" ? currentVal : {}),
                            [c.label.toLowerCase()]: num,
                          } as any;
                          return { ...curr, constraints: nextConstraints } as AnimatableValue;
                        });
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
    <div className="flex gap-1.5 flex-1">
      {components.map((c, i) => (
        <button
          key={i}
          className={cn(
            "flex items-center justify-center gap-1.5 flex-1 h-5 rounded-sm border border-transparent transition-colors text-[10px] font-bold uppercase tracking-wider",
            feature.animated
              ? "bg-accent/10 text-accent hover:bg-accent/20"
              : "bg-bg-input/50 text-text-muted hover:bg-bg-input/70",
          )}
          onClick={() => onToggleAnimated?.(!feature.animated)}
        >
          {feature.animated ? (
            <LockOpen size={10} className="shrink-0" />
          ) : (
            <Lock size={10} className="shrink-0" />
          )}
          <span>{c.label.substring(0, 1)}</span>
        </button>
      ))}
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
      renderMainInput={() => renderInputs("current")}
      renderDefaultInput={() => renderInputs("default")}
      renderMinInput={() => renderInputs("min")}
      renderMaxInput={() => renderInputs("max")}
      renderAnimatableRow={renderAnimatableRow}
    />
  );
}

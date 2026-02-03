import React, { useRef } from "react";
import type { StandardRigInput } from "@vizij/utils";
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

interface RiggingMaterialSectionProps {
  node: SceneObjectNode;
}

export function RiggingMaterialSection({ node }: RiggingMaterialSectionProps) {
  const {
    bindings,
    standardInputsById,
    inputValues,
    handleInputValueChange,
    handleUpdateStandardInput,
  } = useBindingAuthoring((state) => state);

  const { handleSelectMaterial } = useUnifiedSelection();

  const { materials, assignMaterial, duplicateMaterial, setAnimatableValue } =
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
          standardInputsById={standardInputsById}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id, val) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
          onStaticValueChange={handleStaticValueChange}
        />
      )}

      {opacityFeature && (
        <RiggingScalarRow
          label="Opacity"
          feature={opacityFeature}
          bindings={bindings}
          standardInputsById={standardInputsById}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id, val) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
          onStaticValueChange={handleStaticValueChange}
        />
      )}
    </div>
  );
}

interface RiggingScalarRowProps {
  label: string;
  feature: SceneObjectFeature;
  bindings: any;
  standardInputsById: Map<string, StandardRigInput>;
  inputValues: Record<string, number>;
  onValueChange: (id: string, value: number) => void;
  onDefaultChange: (id: string, value: number) => void;
  onStaticValueChange?: (
    targetId: string,
    value: number,
    channel?: string,
  ) => void;
}

export function RiggingScalarRow({
  label,
  feature,
  bindings,
  standardInputsById,
  inputValues,
  onValueChange,
  onDefaultChange,
  onStaticValueChange,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});
  const component = feature.components[0];
  if (!component) return null;

  const targetId = component.targetId;
  let inputId = null;
  let standardInput = null;

  if (targetId) {
    const binding = bindings[targetId];
    if (binding?.slots?.[0]?.inputId) {
      inputId = binding.slots[0].inputId;
      standardInput = standardInputsById.get(inputId);
    }
  }

  const isBound = !!(inputId && standardInput);
  const canEdit = isBound || (!!targetId && !!onStaticValueChange);

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
    if (isBound && inputId) onDefaultChange(inputId, currentValue as number);
  };

  const renderInput = (isDefault: boolean) => {
    const val = isDefault ? defaultValue : currentValue;

    return (
      <div
        className={`flex items-center bg-bg-input/50 rounded-sm border border-transparent ${canEdit ? "focus-within:border-accent/50" : "opacity-70"} relative flex-1 min-w-0 h-5`}
      >
        <input
          type="number"
          className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none pl-1"
          value={typeof val === "number" ? parseFloat(val.toFixed(2)) : val}
          step={0.1}
          min={0}
          max={1}
          disabled={!canEdit}
          title={!canEdit ? "Value is not driven by a rig input" : undefined}
          onChange={(e) => {
            if (!canEdit) return;
            const num = parseFloat(e.target.value);
            if (!isNaN(num)) {
              if (isBound && inputId) {
                if (isDefault) onDefaultChange(inputId, num);
                else onValueChange(inputId, num);
              } else if (targetId && onStaticValueChange) {
                onStaticValueChange(targetId, num);
              }
            }
          }}
        />
      </div>
    );
  };

  return (
    <RiggingPropertyRow
      label={label}
      hasDifferentDefault={hasDifferentDefault}
      onResetToDefault={handleReset}
      onSaveToDefault={handleSaveToDefault}
      renderMainInput={() => renderInput(false)}
      renderDefaultInput={() => renderInput(true)}
    />
  );
}

export function RiggingColorRow({
  label,
  feature,
  bindings,
  standardInputsById,
  inputValues,
  onValueChange,
  onDefaultChange,
  onStaticValueChange,
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
    let inputId = null;
    let standardInput = null;

    if (targetId) {
      const binding = bindings[targetId];
      if (binding?.slots?.[0]?.inputId) {
        inputId = binding.slots[0].inputId;
        standardInput = standardInputsById.get(inputId);
      }
    }

    const isBound = !!(inputId && standardInput);
    const currentValue = isBound
      ? (inputValues[inputId!] ?? standardInput!.defaultValue ?? 0)
      : (comp.staticValue ?? 0);
    const defaultValue = isBound
      ? (standardInput!.defaultValue ?? 0)
      : (comp.staticValue ?? 0);

    return {
      label: compLabel,
      inputId,
      targetId,
      currentValue,
      defaultValue,
      isBound,
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
        onDefaultChange(c.inputId, c.currentValue as number);
    });
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

  const renderInputs = (isDefault: boolean) => {
    const currentR = isDefault
      ? (rComp?.defaultValue ?? 0)
      : (rComp?.currentValue ?? 0);
    const currentG = isDefault
      ? (gComp?.defaultValue ?? 0)
      : (gComp?.currentValue ?? 0);
    const currentB = isDefault
      ? (bComp?.defaultValue ?? 0)
      : (bComp?.currentValue ?? 0);

    const hexColor = rgbToHex(
      currentR as number,
      currentG as number,
      currentB as number,
    );
    const canEditAny =
      components.some((c) => c.isBound) || !!onStaticValueChange;

    const handleColorChange = (newHex: string) => {
      const rgb = hexToRgb(newHex);
      if (!rgb) return;

      [
        { comp: rComp, val: rgb.r },
        { comp: gComp, val: rgb.g },
        { comp: bComp, val: rgb.b },
      ].forEach(({ comp, val }) => {
        if (comp?.isBound && comp.inputId) {
          if (isDefault) onDefaultChange(comp.inputId, val);
          else onValueChange(comp.inputId, val);
        } else if (comp?.targetId && onStaticValueChange) {
          onStaticValueChange(comp.targetId, val, comp.label.toLowerCase());
        }
      });
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
            const val = isDefault ? c.defaultValue : c.currentValue;
            const canEdit =
              c.isBound || (!!c.targetId && !!onStaticValueChange);
            const label = c === rComp ? "R" : c === gComp ? "G" : "B";
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
                  canEdit ? "focus-within:border-accent/50" : "opacity-70",
                )}
              >
                <ScrubbableLabel
                  label={label}
                  onScrub={(_, totalDelta) => {
                    const step = 0.01;
                    const startKey = c.inputId || c.targetId || "";
                    if (!startKey) return;

                    const startVal = scrubValuesRef.current[startKey] ?? 0;
                    const nextVal = startVal + totalDelta * step;

                    if (c.isBound && c.inputId) {
                      if (isDefault) onDefaultChange(c.inputId, nextVal);
                      else onValueChange(c.inputId, nextVal);
                    } else if (c.targetId && onStaticValueChange) {
                      onStaticValueChange(
                        c.targetId,
                        nextVal,
                        c.label.toLowerCase(),
                      );
                    }
                  }}
                  onScrubStart={() => {
                    const startKey = c.inputId || c.targetId || "";
                    if (!startKey) return;

                    const baseline = isDefault
                      ? c.defaultValue
                      : c.currentValue;
                    scrubValuesRef.current[startKey] =
                      (baseline as number) ?? 0;
                  }}
                  className={cn(
                    "text-[9px] font-bold px-1 select-none transition-colors",
                    labelColor,
                  )}
                />
                <input
                  type="number"
                  className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none"
                  value={
                    typeof val === "number" ? parseFloat(val.toFixed(2)) : 0
                  }
                  step={0.01}
                  min={0}
                  max={1}
                  disabled={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    const num = parseFloat(e.target.value);
                    if (!isNaN(num)) {
                      if (c.isBound && c.inputId) {
                        if (isDefault) onDefaultChange(c.inputId, num);
                        else onValueChange(c.inputId, num);
                      } else if (c.targetId && onStaticValueChange) {
                        onStaticValueChange(
                          c.targetId,
                          num,
                          c.label.toLowerCase(),
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

  return (
    <RiggingPropertyRow
      label={label}
      hasDifferentDefault={hasDifferentDefault}
      onResetToDefault={handleReset}
      onSaveToDefault={handleSaveToDefault}
      renderMainInput={() => renderInputs(false)}
      renderDefaultInput={() => renderInputs(true)}
    />
  );
}

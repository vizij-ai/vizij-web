import React, { useMemo, useRef } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { RiggingPropertyRow, ScrubbableLabel } from "./RiggingPropertyRow";
import { resolveEffectiveBindingInputId } from "./bindingSlotResolution";

interface RiggingMorphTargetsSectionProps {
  node: SceneObjectNode;
}

const EMPTY_ARRAY: string[] = [];

export function RiggingMorphTargetsSection({
  node,
}: RiggingMorphTargetsSectionProps) {
  const {
    bindings,
    standardInputsById,
    inputValues,
    handleInputValueChange,
    handleUpdateStandardInput,
  } = useBindingAuthoring((state) => state);

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
          standardInputsById={standardInputsById}
          inputValues={inputValues}
          onValueChange={handleInputValueChange}
          onDefaultChange={(id, val) =>
            handleUpdateStandardInput(id, { defaultValue: val })
          }
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
  standardInputsById: Map<string, StandardRigInput>;
  inputValues: Record<string, number>;
  onValueChange: (id: string, value: number) => void;
  onDefaultChange: (id: string, value: number) => void;
}

function RiggingScalarRow({
  label,
  feature,
  bindings,
  standardInputsById,
  inputValues,
  onValueChange,
  onDefaultChange,
}: RiggingScalarRowProps) {
  const scrubValuesRef = useRef<Record<string, number>>({});
  const component = feature.components[0];
  if (!component) return null;

  const targetId = component.targetId;
  let inputId = null;
  let standardInput = null;

  if (targetId) {
    const binding = bindings[targetId];
    const resolvedInputId = resolveEffectiveBindingInputId(binding);
    if (resolvedInputId) {
      inputId = resolvedInputId;
      standardInput = standardInputsById.get(inputId);
    }
  }

  const isBound = !!(inputId && standardInput);
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
    const canEdit = isBound;
    return (
      <div
        className={`flex items-center bg-zinc-950/50 rounded-sm border border-transparent ${canEdit ? "focus-within:border-blue-500/50" : "opacity-70"} relative flex-1 min-w-0 h-5 group/row`}
      >
        <ScrubbableLabel
          label={label}
          onScrub={(delta: number, totalDelta: number) => {
            if (inputId) {
              const step = 0.01;
              const startVal = scrubValuesRef.current[inputId] ?? 0;
              const nextVal = startVal + totalDelta * step;
              if (isDefault) onDefaultChange(inputId, nextVal);
              else onValueChange(inputId, nextVal);
            }
          }}
          onScrubStart={() => {
            if (inputId) {
              const baseline = isDefault ? defaultValue : currentValue;
              scrubValuesRef.current[inputId] = (baseline as number) ?? 0;
            }
          }}
          className="text-[9px] font-bold px-1 select-none transition-colors text-zinc-500"
        />
        <input
          type="number"
          className="w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-zinc-300 placeholder-zinc-600 no-spinners font-mono leading-none pl-1"
          value={typeof val === "number" ? parseFloat(val.toFixed(2)) : 0}
          step={0.1}
          disabled={!canEdit}
          title={!canEdit ? "Value is not driven by a rig input" : undefined}
          onChange={(e) => {
            if (!canEdit || !inputId) return;
            const num = parseFloat(e.target.value);
            if (!isNaN(num)) {
              if (isDefault) onDefaultChange(inputId, num);
              else onValueChange(inputId, num);
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

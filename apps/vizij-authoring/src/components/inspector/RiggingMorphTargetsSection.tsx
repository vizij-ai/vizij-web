import React, { useMemo } from "react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { ChannelLockButton } from "../editor/atoms/ChannelLockButton";
import { useInspectorTargetLock } from "./useInspectorTargetLock";
import { RiggingScalarRow } from "./RiggingScalarRow";

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

  const lockableMorphTargetIds = useMemo(() => {
    const targetIds = new Set<string>();
    morphFeatures.forEach((feature) => {
      feature.components.forEach((component) => {
        const targetId = component.targetId?.trim();
        if (targetId) {
          targetIds.add(targetId);
        }
      });
    });
    return Array.from(targetIds);
  }, [morphFeatures]);

  // Same aggregation the individual rows use, one level up: "are all of this
  // section's morph targets locked?"
  const morphLock = useInspectorTargetLock(lockableMorphTargetIds);

  if (morphFeatures.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1.5 bg-zinc-900/40 rounded-lg border border-zinc-800/50 mt-0.5">
      <div className="mb-0.5 flex items-center justify-between gap-1 px-0.5">
        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
          Morph Targets
        </div>
        <div className="flex items-center gap-1">
          <ChannelLockButton
            locked
            className="p-0.5"
            title="Lock All Morph Targets"
            disabled={!morphLock.canToggle || morphLock.isLocked}
            onToggle={() => morphLock.setLocked(true)}
          />
          <ChannelLockButton
            locked={false}
            className="p-0.5"
            title="Unlock All Morph Targets"
            disabled={!morphLock.canToggle || morphLock.lockedCount === 0}
            onToggle={() => morphLock.setLocked(false)}
          />
        </div>
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

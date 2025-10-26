import { useCallback, useEffect, useMemo, useState } from "react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { getLookup, RawValue, AnimatableValue } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import type {
  FeatureEntry,
  AnimatableValuesPanelProps,
  ShapeTreeNode,
  TreeNodeType,
} from "./types";
import {
  buildDefaultAnimatable,
  isAnimatableReferencedElsewhere,
} from "./panelUtils";
import { cloneRawValue } from "@vizij/utils";
import { promptDialog, confirmDialog, alertDialog } from "../../utils/dialogs";
import { StandardInputsSection } from "./StandardInputsSection";
import { SelectionStack } from "./SelectionStack";
import { AnimatableTree } from "./AnimatableTree";
import { useFeatureCatalogue } from "./useFeatureCatalogue";
import { useAnimatableTreeState } from "./useAnimatableTreeState";

export function AnimatableValuesPanel({
  namespace: _namespace,
  faceId,
  onFaceIdChange,
  graphStatus,
  graphError,
  selectionStack,
  onFocusSelectionIndex,
  onClearSelection,
  components,
  inputBindings,
  bindings,
  bindingIssues,
  featureLabelOverrides,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  inputValues,
  onInputValueChange,
  managedStandardInputs,
  standardInputs,
  standardInputRoots,
  selectedStandardInputRoots,
  onSelectedStandardInputRootsChange,
  onToggleStandardInput,
  onCreateCustomStandardInput,
  onLinkChildInput,
  onEnsureParentBinding,
  onUpdateStandardInput,
  onDeleteCustomStandardInput,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onParentBindingInputChange,
  onParentBindingRemapChange,
  onParentAddBindingSlot,
  onParentRemoveBindingSlot,
  onParentBindingExpressionChange,
  onParentBindingSlotAliasChange,
  onParentResetBinding,
  onFeatureLabelChange,
}: AnimatableValuesPanelProps) {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setStoreState = useVizijStoreSetter();

  const [rigCollapsed, setRigCollapsed] = useState(false);

  const componentsById = useMemo(
    () =>
      new Map<string, AnimatableComponent>(
        components.map((component) => [component.id, component]),
      ),
    [components],
  );

  const standardInputLookup = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const managedInputsById = useMemo(
    () =>
      new Map(managedStandardInputs.map((entry) => [entry.input.id, entry])),
    [managedStandardInputs],
  );

  const availableRoots = useMemo(() => {
    const rootSet = new Set(standardInputRoots);
    managedStandardInputs.forEach((entry) => {
      if (entry.source === "custom") {
        rootSet.add(entry.input.group || "custom");
      }
    });
    return Array.from(rootSet).sort((a, b) => a.localeCompare(b));
  }, [managedStandardInputs, standardInputRoots]);

  const requestCreateStandardInput = useCallback(
    (suggestedPath?: string): StandardRigInput | null => {
      const response = promptDialog(
        "Enter the rig path for the new standard input (e.g., /eyes/blink)",
        suggestedPath ?? "/",
      );
      if (response === null) {
        return null;
      }
      const trimmed = response.trim();
      if (!trimmed) {
        alertDialog("Path cannot be empty.");
        return null;
      }
      return onCreateCustomStandardInput(trimmed);
    },
    [onCreateCustomStandardInput],
  );

  const handleCreateInputClick = useCallback(() => {
    requestCreateStandardInput();
  }, [requestCreateStandardInput]);

  const handleUpdateStandardInput = useCallback(
    (inputId: string, updates: { path?: string; label?: string }) => {
      onUpdateStandardInput(inputId, updates);
    },
    [onUpdateStandardInput],
  );

  const effectiveInputRanges = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    standardInputs.forEach((input) => {
      map.set(input.id, { min: input.range.min, max: input.range.max });
    });
    Object.values(bindings).forEach((binding) => {
      if (!binding || !binding.slots) {
        return;
      }
      binding.slots.forEach((slot) => {
        if (!slot.inputId) {
          return;
        }
        const rangeMin = Math.min(slot.remap.inLow, slot.remap.inHigh);
        const rangeMax = Math.max(slot.remap.inLow, slot.remap.inHigh);
        const current = map.get(slot.inputId);
        if (current) {
          current.min = Math.min(current.min, rangeMin);
          current.max = Math.max(current.max, rangeMax);
        } else {
          map.set(slot.inputId, { min: rangeMin, max: rangeMax });
        }
      });
    });
    return map;
  }, [bindings, standardInputs]);

  const inputUsage = useMemo(() => {
    const usage = new Map<
      string,
      { targetId: string; label: string; kind: "animatable" | "child" }[]
    >();
    const ensureBucket = (inputId: string) => {
      if (!usage.has(inputId)) {
        usage.set(inputId, []);
      }
      return usage.get(inputId)!;
    };
    components.forEach((component) => {
      const binding = bindings[component.id];
      if (!binding || !binding.slots) {
        return;
      }
      binding.slots.forEach((slot) => {
        if (!slot.inputId) {
          return;
        }
        ensureBucket(slot.inputId).push({
          targetId: component.id,
          label: component.label,
          kind: "animatable",
        });
      });
    });
    managedStandardInputs.forEach((entry) => {
      const parentId = entry.input.id;
      const children = entry.input.derivedChildren ?? [];
      if (!children.length) {
        return;
      }
      children.forEach((childId) => {
        const childEntry = managedInputsById.get(childId);
        ensureBucket(parentId).push({
          targetId: childId,
          label: childEntry ? childEntry.input.label : childId,
          kind: "child",
        });
      });
    });
    usage.forEach((entries) => {
      entries.sort((a, b) => a.label.localeCompare(b.label));
    });
    return usage;
  }, [bindings, components, managedInputsById, managedStandardInputs]);

  const {
    searchTerm,
    setSearchTerm,
    activeSelection,
    allShapes,
    visibleShapes,
    filteredFeatureCount,
  } = useFeatureCatalogue({
    world,
    animatables,
    selectionStack,
    featureLabelOverrides,
  });

  const allTreeNodeKeys = useMemo(() => {
    const keys: string[] = [];
    const pushKey = (type: TreeNodeType, id: string) => {
      keys.push(`${type}:${id}`);
    };
    const collect = (shape: ShapeTreeNode) => {
      pushKey("shape", shape.id);
      shape.features.forEach((feature) => {
        pushKey("feature", feature.id);
        if (feature.animatable) {
          feature.animatable.fields.forEach((field) => {
            field.properties.forEach((property) => {
              pushKey("property", property.id);
            });
          });
        }
      });
    };
    allShapes.forEach(collect);
    return keys;
  }, [allShapes]);

  const treeState = useAnimatableTreeState(
    "demo-vizij-authoring",
    allTreeNodeKeys,
  );
  const { isExpanded: isNodeExpanded, setExpanded: setNodeExpanded } =
    treeState;

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    if (!isNodeExpanded("shape", activeSelection.id)) {
      setNodeExpanded("shape", activeSelection.id, true);
    }
  }, [activeSelection, isNodeExpanded, setNodeExpanded]);

  const handleDeleteInput = useCallback(
    (input: StandardRigInput) => {
      const descriptor = managedInputsById.get(input.id);
      if (!descriptor) {
        return;
      }
      const isAuto = descriptor.source === "auto";
      const message = isAuto
        ? `Disable auto-generated input "${input.label}"?`
        : `Delete standard input "${input.label}"?`;
      if (!confirmDialog(message)) {
        return;
      }
      if (isAuto) {
        onToggleStandardInput(descriptor.input.path, false);
        return;
      }
      onDeleteCustomStandardInput(input.id);
    },
    [managedInputsById, onDeleteCustomStandardInput, onToggleStandardInput],
  );

  const handleClearInputMappings = useCallback(
    (input: StandardRigInput) => {
      const boundTargets = Object.entries(bindings)
        .filter(([, binding]) => binding?.inputId === input.id)
        .map(([targetId]) => targetId);
      if (boundTargets.length === 0) {
        return;
      }
      if (
        !confirmDialog(
          `Clear ${boundTargets.length} mapping${boundTargets.length === 1 ? "" : "s"} for "${input.label}"?`,
        )
      ) {
        return;
      }
      boundTargets.forEach((targetId) => {
        onBindingInputChange(targetId, null);
      });
    },
    [bindings, onBindingInputChange],
  );

  const updateAnimatableDescriptor = useCallback(
    (
      animatableId: string,
      updater: (current: AnimatableValue) => AnimatableValue,
      options?: { newDefault?: RawValue },
    ) => {
      setStoreState((state) => {
        const current = state.animatables[animatableId];
        if (!current) {
          return state;
        }
        const updated = updater(current);
        if (updated === current) {
          return state;
        }
        const partial: any = {
          animatables: {
            ...state.animatables,
            [animatableId]: updated,
          },
        };
        if (options?.newDefault !== undefined) {
          const nextValues = new Map(state.values);
          nextValues.set(
            getLookup(DEFAULT_NAMESPACE, animatableId),
            options.newDefault,
          );
          partial.values = nextValues;
        }
        return partial;
      });
    },
    [setStoreState],
  );

  const updateStaticFeature = useCallback(
    (entry: FeatureEntry, nextValue: RawValue) => {
      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: false,
            value: nextValue,
          },
        };
        return {
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const convertToAnimated = useCallback(
    (entry: FeatureEntry, baseValue: RawValue) => {
      const animatable = buildDefaultAnimatable(entry, baseValue);
      if (!animatable) {
        return;
      }

      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextAnimatables = {
          ...state.animatables,
          [animatable.id]: animatable,
        };
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: true,
            value: animatable.id,
          },
        };
        const nextValues = new Map(state.values);
        nextValues.set(
          getLookup(DEFAULT_NAMESPACE, animatable.id),
          cloneRawValue(animatable.default as RawValue),
        );
        return {
          animatables: nextAnimatables,
          values: nextValues,
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const convertToStatic = useCallback(
    (entry: FeatureEntry) => {
      if (!entry.descriptor || !entry.animatableId) {
        return;
      }
      const animatableId = entry.animatableId;
      const defaultValue = cloneRawValue(entry.descriptor.default as RawValue);
      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextAnimatables = { ...state.animatables };
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: false,
            value: defaultValue,
          },
        };
        const nextValues = new Map(state.values);
        const animatableStillUsed = isAnimatableReferencedElsewhere(
          state.world,
          entry.elementId,
          entry.featureKey,
          animatableId,
        );
        if (!animatableStillUsed) {
          delete nextAnimatables[animatableId];
          nextValues.delete(getLookup(DEFAULT_NAMESPACE, animatableId));
        }
        return {
          animatables: nextAnimatables,
          values: nextValues,
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const handleAnimatedToggle = useCallback(
    (entry: FeatureEntry, makeAnimated: boolean) => {
      if (makeAnimated) {
        const base =
          entry.staticValue ??
          (entry.descriptor?.default as RawValue | undefined) ??
          0;
        convertToAnimated(entry, cloneRawValue(base));
      } else {
        convertToStatic(entry);
      }
    },
    [convertToAnimated, convertToStatic],
  );

  const handleNameChange = useCallback(
    (entry: FeatureEntry, nextName: string) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => ({
        ...current,
        name: nextName,
      }));
    },
    [updateAnimatableDescriptor],
  );

  const handleLabelChange = useCallback(
    (entry: FeatureEntry, nextLabel: string) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => ({
        ...current,
        pub: {
          ...current.pub,
          output: nextLabel,
          public: true,
        },
      }));
    },
    [updateAnimatableDescriptor],
  );

  const handleFeatureLabelChange = useCallback(
    (entry: FeatureEntry, nextLabel: string) => {
      onFeatureLabelChange(entry, nextLabel);
    },
    [onFeatureLabelChange],
  );

  const handleDefaultUpdate = useCallback(
    (entry: FeatureEntry, nextValue: RawValue) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(
        entry.animatableId,
        (current) => ({
          ...current,
          default: nextValue as never,
        }),
        { newDefault: nextValue },
      );
    },
    [updateAnimatableDescriptor],
  );

  const handleConstraintUpdate = useCallback(
    (
      entry: FeatureEntry,
      updater: (
        current: NonNullable<AnimatableValue["constraints"]>,
      ) => NonNullable<AnimatableValue["constraints"]>,
    ) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => {
        const currentConstraints =
          current.constraints ??
          ({} as NonNullable<AnimatableValue["constraints"]>);
        const updatedConstraints = updater({
          ...currentConstraints,
        });
        return {
          ...current,
          constraints: updatedConstraints,
        } as AnimatableValue;
      });
    },
    [updateAnimatableDescriptor],
  );

  return (
    <div className="sidebar__panel feature-panel">
      <StandardInputsSection
        faceId={faceId}
        onFaceIdChange={onFaceIdChange}
        isCollapsed={rigCollapsed}
        onToggleCollapsed={() => setRigCollapsed((prev) => !prev)}
        inputs={managedStandardInputs}
        inputBindings={inputBindings}
        roots={availableRoots}
        selectedRoots={selectedStandardInputRoots}
        onSelectedRootsChange={onSelectedStandardInputRootsChange}
        inputValues={inputValues}
        effectiveInputRanges={effectiveInputRanges}
        inputUsage={inputUsage}
        bindingIssues={bindingIssues}
        onInputValueChange={onInputValueChange}
        onCreateInput={handleCreateInputClick}
        onLinkChildInput={onLinkChildInput}
        onEnsureParentBinding={onEnsureParentBinding}
        onUpdateInput={handleUpdateStandardInput}
        onClearInputMappings={handleClearInputMappings}
        onDeleteInput={handleDeleteInput}
        onToggleInput={onToggleStandardInput}
        onUnbindTarget={(targetId) => onBindingInputChange(targetId, null)}
        onParentBindingInputChange={onParentBindingInputChange}
        onParentBindingRemapChange={onParentBindingRemapChange}
        onParentAddBindingSlot={onParentAddBindingSlot}
        onParentRemoveBindingSlot={onParentRemoveBindingSlot}
        onParentBindingExpressionChange={onParentBindingExpressionChange}
        onParentBindingSlotAliasChange={onParentBindingSlotAliasChange}
        onParentResetBinding={onParentResetBinding}
        graphStatus={graphStatus}
        graphError={graphError}
      />
      <div className="feature-panel__filters">
        <input
          type="search"
          placeholder="Search features"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          spellCheck={false}
        />
        {searchTerm && (
          <button
            type="button"
            className="feature-panel__clear-btn"
            onClick={() => setSearchTerm("")}
          >
            Clear
          </button>
        )}
        {selectionStack.length > 0 && (
          <button
            type="button"
            className="feature-panel__filter-chip feature-panel__filter-chip--dismiss"
            onClick={onClearSelection}
            aria-label="Clear layered element selection"
          >
            {selectionStack.length} layered element
            {selectionStack.length === 1 ? "" : "s"}
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      <SelectionStack
        selectionStack={selectionStack}
        world={world}
        onFocusSelectionIndex={onFocusSelectionIndex}
      />
      <div className="sidebar__panel-header">
        <h2 className="sidebar__panel-title">Features</h2>
        <span className="sidebar__badge">{filteredFeatureCount}</span>
      </div>
      <AnimatableTree
        shapes={visibleShapes}
        treeState={treeState}
        componentsById={componentsById}
        bindings={bindings}
        bindingIssues={bindingIssues}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        inputValues={inputValues}
        inputRanges={effectiveInputRanges}
        onInputValueChange={onInputValueChange}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        onRequestCreateStandardInput={requestCreateStandardInput}
        onAddBindingSlot={onAddBindingSlot}
        onRemoveBindingSlot={onRemoveBindingSlot}
        onBindingExpressionChange={onBindingExpressionChange}
        onBindingSlotAliasChange={onBindingSlotAliasChange}
        onFeatureLabelChange={handleFeatureLabelChange}
        onToggleAnimated={handleAnimatedToggle}
        onNameChange={handleNameChange}
        onLabelChange={handleLabelChange}
        onDefaultChange={handleDefaultUpdate}
        onConstraintChange={handleConstraintUpdate}
        onStaticUpdate={updateStaticFeature}
      />
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { getLookup, RawValue, AnimatableValue } from "@vizij/utils";
import type { StandardRigInput } from "../../rig/standardRigInputs";
import type { AnimatableComponent } from "../../rig/animatableMetadata";
import { DEFAULT_NAMESPACE } from "./constants";
import type { FeatureEntry, AnimatableValuesPanelProps } from "./types";
import {
  buildDefaultAnimatable,
  isAnimatableReferencedElsewhere,
} from "./panelUtils";
import { cloneRawValue } from "../../utils/rawValue";
import { promptDialog, confirmDialog, alertDialog } from "../../utils/dialogs";
import { StandardInputsSection } from "./StandardInputsSection";
import { SelectionStack } from "./SelectionStack";
import { FeatureGroupList } from "./FeatureGroupList";
import { useFeatureCatalogue } from "./useFeatureCatalogue";

export function AnimatableValuesPanel({
  namespace,
  faceId,
  onFaceIdChange,
  selectionStack,
  onFocusSelectionIndex,
  onClearSelection,
  components,
  bindings,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  inputValues,
  onInputValueChange,
  standardInputs,
  onCreateStandardInput,
  onUpdateStandardInput,
  onDeleteStandardInput,
}: AnimatableValuesPanelProps) {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
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
      return onCreateStandardInput(trimmed);
    },
    [onCreateStandardInput],
  );

  const handleCreateInputClick = useCallback(() => {
    requestCreateStandardInput();
  }, [requestCreateStandardInput]);

  const effectiveInputRanges = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    standardInputs.forEach((input) => {
      map.set(input.id, { min: input.range.min, max: input.range.max });
    });
    Object.values(bindings).forEach((binding) => {
      if (!binding || !binding.inputId) {
        return;
      }
      const rangeMin = Math.min(binding.remap.inLow, binding.remap.inHigh);
      const rangeMax = Math.max(binding.remap.inLow, binding.remap.inHigh);
      const current = map.get(binding.inputId);
      if (current) {
        current.min = Math.min(current.min, rangeMin);
        current.max = Math.max(current.max, rangeMax);
      } else {
        map.set(binding.inputId, { min: rangeMin, max: rangeMax });
      }
    });
    return map;
  }, [bindings, standardInputs]);

  const inputUsage = useMemo(() => {
    const usage = new Map<string, { targetId: string; label: string }[]>();
    components.forEach((component) => {
      const binding = bindings[component.id];
      if (!binding || !binding.inputId) {
        return;
      }
      if (!usage.has(binding.inputId)) {
        usage.set(binding.inputId, []);
      }
      usage.get(binding.inputId)!.push({
        targetId: component.id,
        label: component.label,
      });
    });
    usage.forEach((entries) => {
      entries.sort((a, b) => a.label.localeCompare(b.label));
    });
    return usage;
  }, [bindings, components]);

  const {
    searchTerm,
    setSearchTerm,
    groupedEntries,
    collapsedGroups,
    collapsedFeatureRows,
    toggleGroup,
    toggleFeatureCollapse,
  } = useFeatureCatalogue({
    world,
    animatables,
    selectionStack,
  });

  const handleDeleteInput = useCallback(
    (input: StandardRigInput) => {
      if (!confirmDialog(`Delete standard input "${input.label}"?`)) {
        return;
      }
      onDeleteStandardInput(input.id);
    },
    [onDeleteStandardInput],
  );

  const handleEditInput = useCallback(
    (input: StandardRigInput) => {
      const nextPath = promptDialog(
        `Update the path for "${input.label}"`,
        input.path,
      );
      if (nextPath === null) {
        return;
      }
      if (!nextPath.trim()) {
        alertDialog("Path cannot be empty.");
        return;
      }
      const nextLabel = promptDialog(
        `Update the label for "${input.label}" (leave empty to derive from the path)`,
        input.label,
      );
      if (nextLabel === null) {
        return;
      }
      onUpdateStandardInput(input.id, {
        path: nextPath,
        label: nextLabel,
      });
    },
    [onUpdateStandardInput],
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

  const filteredCount = groupedEntries.reduce(
    (total, group) => total + group.entries.length,
    0,
  );

  return (
    <div className="sidebar__panel feature-panel">
      <StandardInputsSection
        faceId={faceId}
        onFaceIdChange={onFaceIdChange}
        isCollapsed={rigCollapsed}
        onToggleCollapsed={() => setRigCollapsed((prev) => !prev)}
        standardInputs={standardInputs}
        inputValues={inputValues}
        effectiveInputRanges={effectiveInputRanges}
        inputUsage={inputUsage}
        onInputValueChange={onInputValueChange}
        onCreateInput={handleCreateInputClick}
        onEditInput={handleEditInput}
        onClearInputMappings={handleClearInputMappings}
        onDeleteInput={handleDeleteInput}
        onUnbindTarget={(targetId) => onBindingInputChange(targetId, null)}
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
        <span className="sidebar__badge">{filteredCount}</span>
      </div>
      <FeatureGroupList
        groups={groupedEntries}
        collapsedGroups={collapsedGroups}
        collapsedFeatureRows={collapsedFeatureRows}
        onToggleGroup={toggleGroup}
        onToggleFeatureCollapse={toggleFeatureCollapse}
        namespace={namespace}
        onToggleAnimated={handleAnimatedToggle}
        onNameChange={handleNameChange}
        onLabelChange={handleLabelChange}
        onDefaultChange={handleDefaultUpdate}
        onConstraintChange={handleConstraintUpdate}
        onStaticUpdate={updateStaticFeature}
        setValue={setValue}
        bindings={bindings}
        componentsById={componentsById}
        onBindingInputChange={onBindingInputChange}
        onBindingRemapChange={onBindingRemapChange}
        onResetBinding={onResetBinding}
        inputValues={inputValues}
        onInputValueChange={onInputValueChange}
        standardInputs={standardInputs}
        standardInputLookup={standardInputLookup}
        inputRanges={effectiveInputRanges}
        onRequestCreateStandardInput={requestCreateStandardInput}
      />
    </div>
  );
}

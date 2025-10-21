import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  useVizijStore,
  useVizijStoreSetter,
  type Selection,
} from "@vizij/render";
import { getLookup, RawValue, AnimatableValue } from "@vizij/utils";
import {
  RIG_INPUT_GROUPS,
  type StandardRigInput,
  type StandardRigInputDraft,
} from "../../rig/standardRigInputs";
import type { AnimatableComponent } from "../../rig/animatableMetadata";
import { DEFAULT_NAMESPACE } from "./constants";
import type { FeatureEntry, AnimatableValuesPanelProps } from "./types";
import { buildFeatureEntries } from "./featureEntries";
import {
  cloneRawValue,
  buildDefaultAnimatable,
  isAnimatableReferencedElsewhere,
} from "./panelUtils";
import { FeatureRow } from "./FeatureRow";

const CUSTOM_GROUP_OPTION = "__custom_group__";

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
  onDeleteStandardInput,
}: AnimatableValuesPanelProps) {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const setStoreState = useVizijStoreSetter();

  const [rigCollapsed, setRigCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedFeatureRows, setCollapsedFeatureRows] = useState<Set<string>>(
    () => new Set(),
  );

  const componentsById = useMemo(
    () =>
      new Map<string, AnimatableComponent>(
        components.map((component) => [component.id, component]),
      ),
    [components],
  );

  const [customGroups, setCustomGroups] = useState<string[]>([]);

  useEffect(() => {
    const defaults = new Set<string>(RIG_INPUT_GROUPS);
    const extras = Array.from(
      new Set(
        standardInputs
          .map((input) => input.group.trim())
          .filter(
            (group): group is string => Boolean(group) && !defaults.has(group),
          ),
      ),
    ).sort((a, b) => a.localeCompare(b));
    setCustomGroups((previous) => {
      if (
        previous.length === extras.length &&
        previous.every((value, index) => value === extras[index])
      ) {
        return previous;
      }
      return extras;
    });
  }, [standardInputs]);

  const availableGroups = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    RIG_INPUT_GROUPS.forEach((group) => {
      if (!seen.has(group)) {
        ordered.push(group);
        seen.add(group);
      }
    });
    customGroups.forEach((group) => {
      if (!seen.has(group)) {
        ordered.push(group);
        seen.add(group);
      }
    });
    return ordered;
  }, [customGroups]);

  const defaultGroupOption =
    availableGroups[0] ?? RIG_INPUT_GROUPS[0] ?? CUSTOM_GROUP_OPTION;

  const standardInputLookup = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

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
    const usage = new Map<string, Set<string>>();
    components.forEach((component) => {
      const binding = bindings[component.id];
      if (!binding || !binding.inputId) {
        return;
      }
      if (!usage.has(binding.inputId)) {
        usage.set(binding.inputId, new Set());
      }
      usage.get(binding.inputId)!.add(component.label);
    });
    const summary = new Map<string, string[]>();
    usage.forEach((labels, inputId) => {
      summary.set(
        inputId,
        Array.from(labels).sort((a, b) => a.localeCompare(b)),
      );
    });
    return summary;
  }, [bindings, components]);

  const [isAddingInput, setIsAddingInput] = useState(false);
  const [inputDraft, setInputDraft] = useState(() => ({
    label: "",
    path: "",
    groupOption: defaultGroupOption,
    customGroup: "",
    min: "-1",
    max: "1",
    defaultValue: "0",
  }));
  const [inputDraftError, setInputDraftError] = useState<string | null>(null);

  const resetInputDraft = useCallback(() => {
    setInputDraft({
      label: "",
      path: "",
      groupOption: defaultGroupOption,
      customGroup: "",
      min: "-1",
      max: "1",
      defaultValue: "0",
    });
    setInputDraftError(null);
  }, [defaultGroupOption]);

  useEffect(() => {
    setInputDraft((previous) => {
      if (previous.groupOption === CUSTOM_GROUP_OPTION) {
        return previous;
      }
      if (
        previous.groupOption &&
        availableGroups.includes(previous.groupOption)
      ) {
        return previous;
      }
      return {
        ...previous,
        groupOption: defaultGroupOption,
      };
    });
  }, [availableGroups, defaultGroupOption]);

  const groupOptions = useMemo(() => {
    if (
      inputDraft.groupOption !== CUSTOM_GROUP_OPTION &&
      inputDraft.groupOption &&
      !availableGroups.includes(inputDraft.groupOption)
    ) {
      return [inputDraft.groupOption, ...availableGroups];
    }
    return availableGroups;
  }, [availableGroups, inputDraft.groupOption]);

  const handleToggleCreateInput = useCallback(() => {
    resetInputDraft();
    setIsAddingInput((previous) => !previous);
  }, [resetInputDraft]);

  const handleCancelCreate = useCallback(() => {
    setIsAddingInput(false);
    resetInputDraft();
  }, [resetInputDraft]);

  const handleCreateInputSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setInputDraftError(null);
      const trimmedPath = inputDraft.path.trim();
      if (!trimmedPath) {
        setInputDraftError("Enter a rig path.");
        return;
      }
      const minValue = Number.parseFloat(inputDraft.min);
      const maxValue = Number.parseFloat(inputDraft.max);
      if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        setInputDraftError("Input range must be numeric.");
        return;
      }
      if (Math.abs(minValue - maxValue) < 1e-6) {
        setInputDraftError("Input range must span a non-zero interval.");
        return;
      }
      const rangeMin = Math.min(minValue, maxValue);
      const rangeMax = Math.max(minValue, maxValue);
      const parsedDefault = Number.parseFloat(inputDraft.defaultValue);
      const resolvedGroup =
        inputDraft.groupOption === CUSTOM_GROUP_OPTION
          ? inputDraft.customGroup.trim()
          : inputDraft.groupOption;
      if (!resolvedGroup) {
        setInputDraftError("Enter a group name.");
        return;
      }
      const defaultValue = Number.isFinite(parsedDefault)
        ? Math.min(rangeMax, Math.max(rangeMin, parsedDefault))
        : 0;
      const normalizedLabel = inputDraft.label.trim();
      const draft: StandardRigInputDraft = {
        path: trimmedPath,
        label: normalizedLabel || trimmedPath,
        group: resolvedGroup,
        defaultValue,
        range: {
          min: rangeMin,
          max: rangeMax,
        },
      };
      onCreateStandardInput(draft);
      setIsAddingInput(false);
      resetInputDraft();
    },
    [inputDraft, onCreateStandardInput, resetInputDraft],
  );

  const handleDeleteInput = useCallback(
    (input: StandardRigInput) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(`Delete standard input "${input.label}"?`)
      ) {
        return;
      }
      onDeleteStandardInput(input.id);
    },
    [onDeleteStandardInput],
  );

  const toggleFeatureCollapse = useCallback((id: string) => {
    setCollapsedFeatureRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const featureEntries = useMemo(
    () => buildFeatureEntries(world, animatables),
    [world, animatables],
  );

  const selectionKey = useCallback(
    (sel: Selection) => `${sel.namespace}:${sel.type}:${sel.id}`,
    [],
  );

  const activeSelection = selectionStack[0] ?? null;

  const filteredEntries = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return featureEntries.filter((entry) => {
      if (activeSelection && entry.elementId !== activeSelection.id) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack =
        `${entry.featureLabel} ${entry.elementName} ${entry.elementType}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [featureEntries, searchTerm, activeSelection]);

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, FeatureEntry[]>();
    filteredEntries.forEach((entry) => {
      if (!grouped.has(entry.elementId)) {
        grouped.set(entry.elementId, []);
      }
      grouped.get(entry.elementId)!.push(entry);
    });
    return Array.from(grouped.entries()).map(([elementId, entries]) => {
      const descriptor = entries[0];
      return {
        elementId,
        elementName: descriptor.elementName,
        elementType: descriptor.elementType,
        entries,
      };
    });
  }, [filteredEntries]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const knownGroupIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedGroups((previous) => {
      let changed = false;
      const next = new Set(previous);
      const currentIds = new Set(
        groupedEntries.map((group) => group.elementId),
      );

      // Remove stale ids and forget them.
      previous.forEach((id) => {
        if (!currentIds.has(id)) {
          next.delete(id);
          knownGroupIdsRef.current.delete(id);
          changed = true;
        }
      });

      // Ensure new groups start collapsed.
      groupedEntries.forEach((group) => {
        if (!knownGroupIdsRef.current.has(group.elementId)) {
          knownGroupIdsRef.current.add(group.elementId);
          next.add(group.elementId);
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [groupedEntries]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedGroups((previous) => {
      if (!previous.has(activeSelection.id)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(activeSelection.id);
      return next;
    });
  }, [activeSelection]);

  useEffect(() => {
    setCollapsedFeatureRows((previous) => {
      const valid = new Set(filteredEntries.map((entry) => entry.id));
      let modified = false;
      const next = new Set<string>();
      previous.forEach((id) => {
        if (valid.has(id)) {
          next.add(id);
        } else {
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedFeatureRows((previous) => {
      let modified = false;
      const next = new Set(previous);
      filteredEntries.forEach((entry) => {
        if (entry.elementId === activeSelection.id && next.has(entry.id)) {
          next.delete(entry.id);
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries, activeSelection]);

  const toggleGroup = useCallback((elementId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(elementId)) {
        next.delete(elementId);
      } else {
        next.add(elementId);
      }
      return next;
    });
  }, []);

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

  return (
    <div className="sidebar__panel feature-panel">
      <section className="feature-panel__rig">
        <div className="feature-panel__rig-header">
          <button
            type="button"
            className="feature-panel__collapse-btn"
            onClick={() => setRigCollapsed((prev) => !prev)}
            aria-expanded={!rigCollapsed}
            aria-controls="feature-panel-rig-body"
          >
            {rigCollapsed ? "+" : "−"}
          </button>
          <div className="feature-panel__rig-summary">
            <h2 className="feature-panel__rig-title">Rig Mapping</h2>
            <p className="feature-panel__rig-description">
              Bind standard rig inputs to animatables and preview their remapped
              values.
            </p>
          </div>
        </div>
        {!rigCollapsed && (
          <div id="feature-panel-rig-body" className="feature-panel__rig-body">
            <label
              className="feature-panel__label"
              htmlFor="feature-panel-face"
            >
              Face / rig identifier
            </label>
            <input
              id="feature-panel-face"
              type="text"
              value={faceId}
              spellCheck={false}
              onChange={(event) => onFaceIdChange(event.target.value)}
            />
            <div className="feature-panel__inputs">
              <div className="feature-panel__input-actions">
                <button
                  type="button"
                  onClick={handleToggleCreateInput}
                  className="feature-panel__input-add"
                >
                  {isAddingInput ? "Close input creator" : "Add standard input"}
                </button>
              </div>
              {isAddingInput && (
                <form
                  className="feature-panel__input-form"
                  onSubmit={handleCreateInputSubmit}
                >
                  <div className="feature-panel__input-form-grid">
                    <label>
                      Label
                      <input
                        type="text"
                        value={inputDraft.label}
                        spellCheck={false}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            label: nextValue,
                          }));
                          setInputDraftError(null);
                        }}
                      />
                    </label>
                    <label>
                      Path
                      <input
                        type="text"
                        value={inputDraft.path}
                        spellCheck={false}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            path: nextValue,
                          }));
                          setInputDraftError(null);
                        }}
                        placeholder="/my/input/path"
                      />
                    </label>
                    <label>
                      Group
                      <select
                        value={inputDraft.groupOption}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            groupOption: nextValue,
                            customGroup:
                              nextValue === CUSTOM_GROUP_OPTION
                                ? previous.customGroup
                                : "",
                          }));
                          setInputDraftError(null);
                        }}
                      >
                        {groupOptions.map((group) => (
                          <option key={group} value={group}>
                            {group.replace(/_/g, " ")}
                          </option>
                        ))}
                        <option value={CUSTOM_GROUP_OPTION}>
                          Create new group…
                        </option>
                      </select>
                    </label>
                    {inputDraft.groupOption === CUSTOM_GROUP_OPTION && (
                      <label>
                        New group
                        <input
                          type="text"
                          value={inputDraft.customGroup}
                          spellCheck={false}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setInputDraft((previous) => ({
                              ...previous,
                              customGroup: nextValue,
                            }));
                            setInputDraftError(null);
                          }}
                          placeholder="eyes_secondary"
                        />
                      </label>
                    )}
                    <label>
                      Default value
                      <input
                        type="number"
                        value={inputDraft.defaultValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            defaultValue: nextValue,
                          }));
                          setInputDraftError(null);
                        }}
                        step="0.1"
                      />
                    </label>
                    <label>
                      Range min
                      <input
                        type="number"
                        value={inputDraft.min}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            min: nextValue,
                          }));
                          setInputDraftError(null);
                        }}
                        step="0.1"
                      />
                    </label>
                    <label>
                      Range max
                      <input
                        type="number"
                        value={inputDraft.max}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setInputDraft((previous) => ({
                            ...previous,
                            max: nextValue,
                          }));
                          setInputDraftError(null);
                        }}
                        step="0.1"
                      />
                    </label>
                  </div>
                  {inputDraftError && (
                    <p className="feature-panel__input-error">
                      {inputDraftError}
                    </p>
                  )}
                  <div className="feature-panel__input-form-actions">
                    <button type="submit">Create input</button>
                    <button
                      type="button"
                      onClick={handleCancelCreate}
                      className="feature-panel__input-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {standardInputs.map((input) => {
                const range = effectiveInputRanges.get(input.id) ?? input.range;
                const value = inputValues[input.id] ?? input.defaultValue;
                const step = Math.max((range.max - range.min) / 200, 0.001);
                const usage = inputUsage.get(input.id) ?? [];
                return (
                  <div key={input.id} className="feature-panel__input-row">
                    <div className="feature-panel__input-meta">
                      <strong>{input.label}</strong>
                      <span>{input.path}</span>
                    </div>
                    <input
                      type="range"
                      min={range.min}
                      max={range.max}
                      step={step}
                      value={value}
                      onChange={(event) =>
                        onInputValueChange(input.id, Number(event.target.value))
                      }
                    />
                    <div className="feature-panel__input-number-wrapper">
                      <input
                        className="feature-panel__input-number"
                        type="number"
                        value={value}
                        min={range.min}
                        max={range.max}
                        step={step}
                        onChange={(event) =>
                          onInputValueChange(
                            input.id,
                            Number(event.target.value),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="feature-panel__input-delete"
                        onClick={() => handleDeleteInput(input)}
                        aria-label={`Delete ${input.label} input`}
                      >
                        ×
                      </button>
                    </div>
                    <p className="feature-panel__input-tracker">
                      Mapped to:{" "}
                      {usage.length > 0 ? (
                        usage.join(", ")
                      ) : (
                        <span className="feature-panel__input-tracker--unmapped">
                          Unmapped
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
              {standardInputs.length === 0 && (
                <p className="feature-panel__inputs-empty">
                  No standard inputs defined yet.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
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
      {selectionStack.length > 0 && (
        <div
          className="feature-panel__stack"
          role="group"
          aria-label="Selection stack"
        >
          <h3 className="feature-panel__stack-title">Selection stack</h3>
          <ol className="feature-panel__stack-list">
            {selectionStack.map((sel, index) => {
              const renderable = world[sel.id];
              const label = renderable?.name || sel.id;
              const isActive = index === 0;
              return (
                <li
                  key={selectionKey(sel)}
                  className={`feature-panel__stack-item${isActive ? " feature-panel__stack-item--active" : ""}`}
                >
                  <button
                    type="button"
                    className="feature-panel__stack-button"
                    onClick={() => onFocusSelectionIndex(index)}
                    disabled={isActive}
                  >
                    <span className="feature-panel__stack-label">{label}</span>
                    <span className="feature-panel__stack-meta">
                      {sel.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <div className="sidebar__panel-header">
        <h2 className="sidebar__panel-title">Features</h2>
        <span className="sidebar__badge">{filteredEntries.length}</span>
      </div>
      {filteredEntries.length === 0 ? (
        <p className="sidebar__empty">No features match the current filters.</p>
      ) : (
        <div className="feature-panel__groups">
          {groupedEntries.map((group) => (
            <section className="feature-group" key={group.elementId}>
              <header className="feature-group__header">
                <button
                  type="button"
                  className="feature-group__toggle-btn"
                  onClick={() => toggleGroup(group.elementId)}
                  aria-expanded={!collapsedGroups.has(group.elementId)}
                  aria-label={
                    collapsedGroups.has(group.elementId)
                      ? `Expand ${group.elementName}`
                      : `Collapse ${group.elementName}`
                  }
                >
                  {collapsedGroups.has(group.elementId) ? "+" : "−"}
                </button>
                <div className="feature-group__summary">
                  <h3 className="feature-group__title">{group.elementName}</h3>
                  <span className="feature-group__type">
                    {group.elementType}
                  </span>
                </div>
              </header>
              {!collapsedGroups.has(group.elementId) && (
                <div className="feature-group__body">
                  {group.entries.map((entry) => (
                    <FeatureRow
                      key={entry.id}
                      entry={entry}
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
                      isCollapsed={collapsedFeatureRows.has(entry.id)}
                      onToggleCollapse={toggleFeatureCollapse}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

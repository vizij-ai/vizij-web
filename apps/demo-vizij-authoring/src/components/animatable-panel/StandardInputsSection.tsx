import { useCallback, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";
import type { ManagedStandardInput } from "../../hooks/useRigController";
import {
  type StandardInputValues,
  type InputBindingMap,
  type AnimatableBinding,
  bindingTargetFromInput,
  createDefaultParentBinding,
} from "../../rig/state";
import type { BindingField } from "./types";
import { BindingEditor } from "./BindingEditor";

interface InputUsage {
  targetId: string;
  label: string;
  kind: "animatable" | "child";
}

interface StandardInputsSectionProps {
  faceId: string;
  onFaceIdChange: (value: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  inputs: ManagedStandardInput[];
  inputBindings: InputBindingMap;
  roots: string[];
  selectedRoots: string[];
  onSelectedRootsChange: (next: string[]) => void;
  inputValues: StandardInputValues;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  bindingIssues: Map<string, readonly string[]>;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onEnsureParentBinding: (inputId: string) => void;
  onLinkChildInput: (parentId: string, childId: string) => void;
  onUpdateInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  onClearInputMappings: (input: StandardRigInput) => void;
  onDeleteInput: (input: StandardRigInput) => void;
  onToggleInput: (path: string, enabled: boolean) => void;
  onUnbindTarget: (targetId: string) => void;
  onParentBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  onParentBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
    slotId?: string,
  ) => void;
  onParentAddBindingSlot: (targetId: string) => void;
  onParentRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onParentBindingExpressionChange: (
    targetId: string,
    expression: string,
  ) => void;
  onParentBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  onParentResetBinding: (targetId: string) => void;
  graphStatus: "idle" | "loading" | "ready" | "error";
  graphError: string | null;
}

const ROOT_FALLBACK = "custom";

function formatToken(token: string): string {
  if (!token) {
    return "Custom";
  }
  return token
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRootKey(entry: ManagedStandardInput): string {
  return entry.metadata?.root ?? entry.input.group ?? ROOT_FALLBACK;
}

function getShapeLabel(entry: ManagedStandardInput): string {
  return entry.metadata?.elementName ?? formatToken(getRootKey(entry));
}

export function StandardInputsSection({
  faceId,
  onFaceIdChange,
  isCollapsed,
  onToggleCollapsed,
  inputs,
  inputBindings,
  roots,
  selectedRoots,
  onSelectedRootsChange,
  inputValues,
  effectiveInputRanges,
  inputUsage,
  bindingIssues,
  onInputValueChange,
  onCreateInput,
  onEnsureParentBinding,
  onLinkChildInput,
  onUpdateInput,
  onClearInputMappings,
  onDeleteInput,
  onToggleInput,
  onUnbindTarget,
  onParentBindingInputChange,
  onParentBindingRemapChange,
  onParentAddBindingSlot,
  onParentRemoveBindingSlot,
  onParentBindingExpressionChange,
  onParentBindingSlotAliasChange,
  onParentResetBinding,
  graphStatus,
  graphError,
}: StandardInputsSectionProps) {
  const graphStatusMessage = useMemo(() => {
    if (graphStatus === "error") {
      return graphError
        ? `Rig graph failed to load: ${graphError}`
        : "Rig graph failed to load.";
    }
    if (graphStatus === "loading") {
      return "Building rig graph…";
    }
    return null;
  }, [graphError, graphStatus]);

  const availableRoots = useMemo(() => {
    const merged = new Set<string>(roots);
    inputs.forEach((entry) => {
      merged.add(getRootKey(entry));
    });
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [inputs, roots]);

  const selectedSet = useMemo(
    () => new Set<string>(selectedRoots),
    [selectedRoots],
  );

  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );

  const [childSelection, setChildSelection] = useState<{
    parentId: string | null;
    childId: string | null;
  }>({ parentId: null, childId: null });

  const cancelChildSelection = useCallback(() => {
    setChildSelection({ parentId: null, childId: null });
  }, []);

  const confirmChildSelection = useCallback(() => {
    setChildSelection((current) => {
      if (!current.parentId || !current.childId) {
        return { parentId: null, childId: null };
      }
      onLinkChildInput(current.parentId, current.childId);
      return { parentId: null, childId: null };
    });
  }, [onLinkChildInput]);

  const standardInputList = useMemo(
    () => inputs.map((entry) => entry.input),
    [inputs],
  );

  const standardInputLookup = useMemo(
    () => new Map(standardInputList.map((input) => [input.id, input])),
    [standardInputList],
  );

  const entriesById = useMemo(
    () => new Map(inputs.map((entry) => [entry.input.id, entry])),
    [inputs],
  );

  const filteredInputs = useMemo(() => {
    if (selectedSet.size === 0) {
      return inputs;
    }
    return inputs.filter((entry) => selectedSet.has(getRootKey(entry)));
  }, [inputs, selectedSet]);

  const emptyMessage = useMemo(() => {
    if (inputs.length === 0) {
      return "No standard inputs are available for this rig.";
    }
    if (filteredInputs.length === 0 && selectedRoots.length > 0) {
      const [firstRoot] = selectedRoots;
      return `No inputs for ${formatToken(firstRoot)} yet. Enable the toggle in the feature tree to add one.`;
    }
    return null;
  }, [filteredInputs.length, inputs.length, selectedRoots]);

  const handleRootToggle = useCallback(
    (root: string) => {
      if (selectedSet.has(root)) {
        onSelectedRootsChange(selectedRoots.filter((value) => value !== root));
      } else {
        onSelectedRootsChange([...selectedRoots, root]);
      }
    },
    [onSelectedRootsChange, selectedRoots, selectedSet],
  );

  const handleSelectAll = useCallback(() => {
    onSelectedRootsChange([]);
  }, [onSelectedRootsChange]);

  const handleTextCommit = useCallback(
    (inputId: string, field: "label" | "path", original: string) =>
      (event: React.FocusEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        const trimmed = raw.trim();
        if (!trimmed || trimmed === original) {
          event.target.value = original;
          return;
        }
        onUpdateInput(inputId, { [field]: trimmed });
      },
    [onUpdateInput],
  );

  const handleKeyCommit = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === "Escape") {
        (event.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  return (
    <section className="feature-panel__rig">
      <div className="feature-panel__rig-header">
        <button
          type="button"
          className="feature-panel__collapse-btn"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls="feature-panel-rig-body"
        >
          {isCollapsed ? "+" : "−"}
        </button>
        <div className="feature-panel__rig-summary">
          <h2 className="feature-panel__rig-title">Rig Mapping</h2>
          <p className="feature-panel__rig-description">
            Bind standard rig inputs to animatables and preview their remapped
            values.
          </p>
        </div>
      </div>
      {!isCollapsed && (
        <div id="feature-panel-rig-body" className="feature-panel__rig-body">
          {graphStatusMessage && (
            <p
              className={`feature-panel__rig-status feature-panel__rig-status--${graphStatus}`}
              role={graphStatus === "error" ? "alert" : undefined}
            >
              {graphStatusMessage}
            </p>
          )}
          <label className="feature-panel__label" htmlFor="feature-panel-face">
            Face / rig identifier
          </label>
          <input
            id="feature-panel-face"
            type="text"
            value={faceId}
            spellCheck={false}
            onChange={(event) => onFaceIdChange(event.target.value)}
          />
          {(availableRoots.length > 0 ||
            inputs.some((entry) => entry.source === "custom")) && (
            <div className="feature-panel__input-toolbar">
              {availableRoots.length > 0 && (
                <div className="feature-panel__input-filters">
                  <span className="feature-panel__input-filters-label">
                    Groups
                  </span>
                  <div className="feature-panel__input-filter-chips">
                    <button
                      type="button"
                      className="feature-panel__input-filter-chip"
                      data-active={selectedRoots.length === 0}
                      onClick={handleSelectAll}
                    >
                      All
                    </button>
                    {availableRoots.map((root) => (
                      <button
                        key={root}
                        type="button"
                        className="feature-panel__input-filter-chip"
                        data-active={selectedSet.has(root)}
                        onClick={() => handleRootToggle(root)}
                      >
                        {formatToken(root)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={onCreateInput}
                className="feature-panel__input-add"
              >
                Add custom input
              </button>
            </div>
          )}
          <div className="feature-panel__inputs">
            {emptyMessage ? (
              <p className="feature-panel__inputs-empty">{emptyMessage}</p>
            ) : (
              filteredInputs.map((entry) => {
                const { input, disabled, source } = entry;
                const range = effectiveInputRanges.get(input.id) ?? input.range;
                const value = inputValues[input.id] ?? input.defaultValue;
                const step = Math.max((range.max - range.min) / 200, 0.001);
                const usage = inputUsage.get(input.id) ?? [];
                const animatableUsage = usage.filter(
                  (entry) => entry.kind === "animatable",
                );
                const isAuto = source === "auto";
                const isParentExpanded = expandedParents.has(input.id);
                const parentBinding = inputBindings[input.id] ?? null;
                const parentIssues = bindingIssues.get(input.id) ?? [];
                const derivedChildren = input.derivedChildren ?? [];
                const parentTarget = bindingTargetFromInput(input);
                const bindingForEditor = parentBinding
                  ? parentBinding
                  : isParentExpanded
                    ? createDefaultParentBinding(parentTarget)
                    : null;
                const parentControllers = parentBinding
                  ? parentBinding.slots
                      .filter(
                        (slot) =>
                          slot.inputId && slot.inputId !== SELF_BINDING_ID,
                      )
                      .map((slot) => {
                        const meta = slot.inputId
                          ? standardInputLookup.get(slot.inputId)
                          : null;
                        return meta ? meta.label : slot.alias;
                      })
                  : [];
                const parentHasSelfSlot = parentBinding?.slots.some(
                  (slot) => slot.inputId === SELF_BINDING_ID,
                );
                const expressionUsesSelf = parentBinding?.expression
                  ? /\bself\b/i.test(parentBinding.expression)
                  : false;
                const sliderLocked =
                  parentBinding !== null &&
                  (!parentHasSelfSlot || !expressionUsesSelf);
                const sliderDisabled = disabled || sliderLocked;
                const ensureParentBindingAndSlot = (
                  nextBinding: AnimatableBinding | null,
                ) => {
                  onEnsureParentBinding(input.id);
                  const hasAdditionalSlot =
                    nextBinding &&
                    nextBinding.slots.some(
                      (slot, index) =>
                        index > 0 ||
                        (slot.inputId && slot.inputId !== SELF_BINDING_ID),
                    );
                  if (!hasAdditionalSlot) {
                    onParentAddBindingSlot(input.id);
                  }
                };

                const toggleParentExpanded = () => {
                  const willExpand = !isParentExpanded;
                  if (willExpand) {
                    ensureParentBindingAndSlot(parentBinding);
                  }
                  setExpandedParents((previous) => {
                    const next = new Set(previous);
                    if (next.has(input.id)) {
                      next.delete(input.id);
                    } else {
                      next.add(input.id);
                    }
                    return next;
                  });
                };
                const handleParentReset = () => onParentResetBinding(input.id);
                const childCandidates = standardInputList.filter(
                  (candidate) => {
                    if (candidate.id === input.id) {
                      return false;
                    }
                    const candidateBinding = inputBindings[candidate.id];
                    if (!candidateBinding) {
                      return true;
                    }
                    if (candidateBinding.inputId === input.id) {
                      return false;
                    }
                    return !candidateBinding.slots.some(
                      (slot) => slot.inputId === input.id,
                    );
                  },
                );
                const childOptions = childCandidates
                  .map((candidate) => ({
                    id: candidate.id,
                    label: candidate.label,
                  }))
                  .sort((a, b) => a.label.localeCompare(b.label));
                const isSelectingChild = childSelection.parentId === input.id;
                const selectedChildId = isSelectingChild
                  ? (childSelection.childId ?? null)
                  : null;
                const handleStartChildSelection = () => {
                  if (childOptions.length === 0) {
                    return;
                  }
                  const defaultChildId = childOptions[0]?.id ?? null;
                  setChildSelection({
                    parentId: input.id,
                    childId: defaultChildId,
                  });
                };
                const handleChildSelectionChange = (value: string) => {
                  setChildSelection((previous) => {
                    if (previous.parentId !== input.id) {
                      return previous;
                    }
                    return {
                      parentId: input.id,
                      childId: value.length > 0 ? value : null,
                    };
                  });
                };
                const childEntries = derivedChildren
                  .map((childId) => {
                    const childEntry = entriesById.get(childId);
                    return {
                      id: childId,
                      label: childEntry ? childEntry.input.label : childId,
                    };
                  })
                  .sort((a, b) => a.label.localeCompare(b.label));
                const rootLabel = getShapeLabel(entry);
                const pathBlurHandler = handleTextCommit(
                  input.id,
                  "path",
                  input.path,
                );

                return (
                  <div
                    key={input.id}
                    className={`feature-panel__input-card${disabled ? " feature-panel__input-card--disabled" : ""}`}
                  >
                    <div className="feature-panel__input-top-row">
                      <div className="feature-panel__input-toggle">
                        {isAuto ? (
                          <label className="feature-panel__input-switch">
                            <input
                              type="checkbox"
                              checked={!disabled}
                              onChange={(event) =>
                                onToggleInput(input.path, event.target.checked)
                              }
                            />
                            <span
                              aria-hidden="true"
                              className="feature-panel__input-switch-indicator"
                            />
                          </label>
                        ) : (
                          <span className="feature-panel__input-custom-chip">
                            Custom
                          </span>
                        )}
                      </div>
                      <input
                        className="feature-panel__input-text feature-panel__input-text--path"
                        type="text"
                        defaultValue={input.path}
                        onBlur={pathBlurHandler}
                        onKeyDown={handleKeyCommit}
                        spellCheck={false}
                      />
                      <div className="feature-panel__input-top-right">
                        <span className="feature-panel__input-root-chip">
                          {rootLabel}
                        </span>
                        {parentBinding && (
                          <span className="feature-panel__input-custom-chip">
                            Parented
                          </span>
                        )}
                        {source === "custom" && (
                          <button
                            type="button"
                            className="feature-panel__input-action feature-panel__input-action--danger"
                            onClick={() => onDeleteInput(input)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="feature-panel__input-bottom-row">
                      <div className="feature-panel__input-map">
                        {usage.length > 0 ? (
                          <div className="feature-panel__input-map-chips">
                            {usage.map(({ targetId, label, kind }) => {
                              if (kind === "animatable") {
                                return (
                                  <button
                                    type="button"
                                    key={targetId}
                                    className="feature-panel__input-tracker-chip"
                                    onClick={() => onUnbindTarget(targetId)}
                                    title={`Remove mapping from ${label}`}
                                  >
                                    {label}
                                    <span aria-hidden="true">×</span>
                                  </button>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  key={`child:${targetId}`}
                                  className="feature-panel__input-tracker-chip"
                                  title={`Child input ${label}`}
                                  disabled
                                  aria-disabled="true"
                                >
                                  Child: {label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="feature-panel__input-tracker--unmapped">
                            {disabled ? "Disabled" : "Unmapped"}
                          </span>
                        )}
                        <button
                          type="button"
                          className="feature-panel__input-action feature-panel__input-action--secondary"
                          onClick={() => onClearInputMappings(input)}
                          disabled={animatableUsage.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="feature-panel__input-slider">
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={step}
                          value={value}
                          disabled={sliderDisabled}
                          title={
                            sliderLocked
                              ? "Slider contributions are disabled because parent inputs fully control this value."
                              : undefined
                          }
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (Number.isFinite(parsed)) {
                              onInputValueChange(input.id, parsed);
                            }
                          }}
                        />
                        {(() => {
                          const summaryParts: string[] = [];
                          if (parentControllers.length > 0) {
                            summaryParts.push(
                              `Controlled by ${parentControllers.join(", ")}`,
                            );
                          }
                          if (sliderLocked) {
                            summaryParts.push("Slider disabled");
                          }
                          return summaryParts.length > 0 ? (
                            <div className="feature-panel__input-slider-summary">
                              {summaryParts.join(" • ")}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div className="feature-panel__input-derived">
                        <div className="feature-panel__input-derived-actions">
                          <button
                            type="button"
                            className="feature-panel__input-action feature-panel__input-action--secondary"
                            onClick={handleStartChildSelection}
                            disabled={childOptions.length === 0}
                          >
                            Add child
                          </button>
                          <button
                            type="button"
                            className="feature-panel__input-action feature-panel__input-action--secondary"
                            onClick={toggleParentExpanded}
                          >
                            {isParentExpanded
                              ? "Hide parent mapping"
                              : "Add parent"}
                          </button>
                          {parentBinding && (
                            <button
                              type="button"
                              className="feature-panel__input-action feature-panel__input-action--danger"
                              onClick={handleParentReset}
                            >
                              Reset mapping
                            </button>
                          )}
                        </div>
                        {childEntries.length > 0 && (
                          <div className="feature-panel__input-derived-children">
                            <span>Children</span>
                            <ul>
                              {childEntries.map((child) => (
                                <li key={child.id}>{child.label}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {isSelectingChild && (
                          <div className="feature-panel__input-child-selector">
                            {childOptions.length > 0 ? (
                              <>
                                <label className="feature-panel__input-child-label">
                                  Select child
                                  <select
                                    className="feature-panel__input-child-select"
                                    value={selectedChildId ?? ""}
                                    onChange={(event) =>
                                      handleChildSelectionChange(
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {childOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div className="feature-panel__input-child-actions">
                                  <button
                                    type="button"
                                    className="feature-panel__input-action feature-panel__input-action--secondary"
                                    onClick={confirmChildSelection}
                                    disabled={!selectedChildId}
                                  >
                                    Link child
                                  </button>
                                  <button
                                    type="button"
                                    className="feature-panel__input-action feature-panel__input-action--secondary"
                                    onClick={cancelChildSelection}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="feature-panel__input-child-empty">
                                No available inputs to assign.
                                <button
                                  type="button"
                                  className="feature-panel__input-action feature-panel__input-action--secondary"
                                  onClick={cancelChildSelection}
                                >
                                  Close
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {isParentExpanded && bindingForEditor && (
                          <BindingEditor
                            binding={bindingForEditor}
                            targetId={input.id}
                            label={`${input.label} mapping`}
                            standardInputs={standardInputList}
                            standardInputLookup={standardInputLookup}
                            issues={parentIssues}
                            onBindingInputChange={onParentBindingInputChange}
                            onBindingRemapChange={onParentBindingRemapChange}
                            onAddBindingSlot={onParentAddBindingSlot}
                            onRemoveBindingSlot={onParentRemoveBindingSlot}
                            onBindingExpressionChange={
                              onParentBindingExpressionChange
                            }
                            onBindingSlotAliasChange={
                              onParentBindingSlotAliasChange
                            }
                            onResetBinding={
                              parentBinding
                                ? () => onParentResetBinding(input.id)
                                : undefined
                            }
                            expandable={false}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}

import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
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
import { promptDialog } from "../../utils/dialogs";

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
  onRenameGroup: (sourceGroup: string, nextGroup: string) => void;
  inputValues: StandardInputValues;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  bindingIssues: Map<string, readonly string[]>;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onResetAllInputs: () => void;
  onEnsureParentBinding: (inputId: string) => void;
  onLinkChildInput: (parentId: string, childId: string) => void;
  onUpdateInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  onClearInputMappings: (input: StandardRigInput) => void;
  onDeleteInput: (input: StandardRigInput) => void;
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

const GROUP_FALLBACK = "custom";

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
  return entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  onRenameGroup,
  inputValues,
  effectiveInputRanges,
  inputUsage,
  bindingIssues,
  onInputValueChange,
  onCreateInput,
  onResetAllInputs,
  onEnsureParentBinding,
  onLinkChildInput,
  onUpdateInput,
  onClearInputMappings,
  onDeleteInput,
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

  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [childSelection, setChildSelection] = useState<{
    parentId: string | null;
    childId: string | null;
  }>({ parentId: null, childId: null });

  const standardInputList = useMemo(
    () => inputs.map((entry) => entry.input),
    [inputs],
  );
  const standardInputLookup = useMemo(
    () => new Map(standardInputList.map((item) => [item.id, item])),
    [standardInputList],
  );
  const entriesById = useMemo(
    () => new Map(inputs.map((entry) => [entry.input.id, entry])),
    [inputs],
  );

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

  const handleFaceIdInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onFaceIdChange(event.target.value);
    },
    [onFaceIdChange],
  );

  const handleRenameRoot = useCallback(
    (root: string) => {
      const current = formatToken(root);
      const response = promptDialog(`Rename group "${current}"`, current);
      if (response === null) {
        return;
      }
      const trimmed = response.trim();
      if (!trimmed || trimmed === root) {
        return;
      }
      onRenameGroup(root, trimmed);
    },
    [onRenameGroup],
  );

  const handleRootToggle = useCallback(
    (root: string) => {
      setExpandedInputs((previous) => {
        const next = new Set(previous);
        inputs
          .filter((entry) => getRootKey(entry) === root)
          .forEach((entry) => next.delete(entry.input.id));
        return next;
      });
      setExpandedParents((previous) => {
        const next = new Set(previous);
        inputs
          .filter((entry) => getRootKey(entry) === root)
          .forEach((entry) => next.delete(entry.input.id));
        return next;
      });

      const nextSelection = selectedRoots.includes(root)
        ? selectedRoots.filter((value) => value !== root)
        : [...selectedRoots, root];
      onSelectedRootsChange(nextSelection);
    },
    [inputs, onSelectedRootsChange, selectedRoots],
  );

  const handleSelectAll = useCallback(() => {
    onSelectedRootsChange([]);
  }, [onSelectedRootsChange]);

  const graphAlert = useMemo(() => {
    if (!graphStatusMessage) {
      return null;
    }
    return (
      <div className="feature-panel__graph-status feature-panel__graph-status--warning">
        {graphStatusMessage}
      </div>
    );
  }, [graphStatusMessage]);

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
    if (selectedRoots.length > 0 && filteredInputs.length === 0) {
      const [firstRoot] = selectedRoots;
      return `No inputs for ${formatToken(firstRoot)} yet. Add one from the feature tree or create a custom input.`;
    }
    return null;
  }, [filteredInputs.length, inputs.length, selectedRoots]);

  const renderInputCard = (entry: ManagedStandardInput) => {
    const { input, source } = entry;
    const range = effectiveInputRanges.get(input.id) ?? input.range;
    const value = inputValues[input.id] ?? input.defaultValue;
    const usage = inputUsage.get(input.id) ?? [];
    const animatableUsage = usage.filter((item) => item.kind === "animatable");
    const isAuto = source === "auto";
    const isExpanded = expandedInputs.has(input.id);
    const isParentExpanded = expandedParents.has(input.id);
    const parentBinding = inputBindings[input.id] ?? null;
    const parentIssues = bindingIssues.get(input.id) ?? [];
    const parentTarget = bindingTargetFromInput(input);
    const bindingForEditor = parentBinding
      ? parentBinding
      : isParentExpanded
        ? createDefaultParentBinding(parentTarget)
        : null;

    const parentHasSelfSlot = parentBinding?.slots.some(
      (slot) => slot.inputId === SELF_BINDING_ID,
    );
    const expressionUsesSelf = parentBinding?.expression
      ? /\bself\b/i.test(parentBinding.expression)
      : false;
    const sliderLocked =
      parentBinding !== null && (!parentHasSelfSlot || !expressionUsesSelf);
    const sliderDisabled = sliderLocked;

    const toggleInputExpanded = () => {
      setExpandedInputs((previous) => {
        const next = new Set(previous);
        if (next.has(input.id)) {
          next.delete(input.id);
          if (childSelection.parentId === input.id) {
            cancelChildSelection();
          }
        } else {
          next.add(input.id);
        }
        return next;
      });
    };

    const ensureParentBindingAndSlot = (
      nextBinding: AnimatableBinding | null,
    ) => {
      onEnsureParentBinding(input.id);
      const hasAdditionalSlot =
        nextBinding &&
        nextBinding.slots.some(
          (slot, index) =>
            index > 0 || (slot.inputId && slot.inputId !== SELF_BINDING_ID),
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

    const childCandidates = standardInputList.filter((candidate) => {
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
      return !candidateBinding.slots.some((slot) => slot.inputId === input.id);
    });

    const childOptions = childCandidates
      .map((candidate) => ({ id: candidate.id, label: candidate.label }))
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
      setChildSelection({ parentId: input.id, childId: defaultChildId });
    };

    const handleChildSelectionChange = (
      event: ChangeEvent<HTMLSelectElement>,
    ) => {
      const nextValue = event.target.value;
      setChildSelection((previous) => {
        if (previous.parentId !== input.id) {
          return previous;
        }
        return {
          parentId: input.id,
          childId: nextValue.length > 0 ? nextValue : null,
        };
      });
    };

    const derivedChildren = input.derivedChildren ?? [];

    const childEntries = derivedChildren
      .map((childId) => {
        const childEntry = entriesById.get(childId);
        return {
          id: childId,
          label: childEntry ? childEntry.input.label : childId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    const handleNumericChange = (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onInputValueChange(input.id, clamp(parsed, range.min, range.max));
    };

    const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      onInputValueChange(input.id, parsed);
    };

    const handlePathCommit = (nextPath: string) => {
      const trimmed = nextPath.trim();
      if (!trimmed || trimmed === input.path) {
        return;
      }
      onUpdateInput(input.id, { path: trimmed });
    };

    const handlePathKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handlePathCommit((event.target as HTMLInputElement).value);
      }
    };

    const handlePathBlur = (event: FocusEvent<HTMLInputElement>) => {
      handlePathCommit(event.target.value);
    };

    return (
      <div key={input.id} className="feature-panel__input-card">
        <div className="feature-panel__input-header">
          <div className="feature-panel__input-header-main">
            <button
              type="button"
              className="feature-panel__input-disclosure"
              onClick={toggleInputExpanded}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${input.label}`}
            />
            <span className="feature-panel__input-name">{input.label}</span>
          </div>
          <div className="feature-panel__input-header-actions">
            <label className="feature-panel__input-value">
              <span className="feature-panel__visually-hidden">Value</span>
              <input
                type="number"
                value={value}
                min={range.min}
                max={range.max}
                step={Math.max((range.max - range.min) / 200, 0.001)}
                onChange={handleNumericChange}
              />
            </label>
            <span className="feature-panel__input-custom-chip">
              {isAuto ? "Auto" : "Custom"}
            </span>
            {!isAuto && (
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

        {isExpanded && (
          <div className="feature-panel__input-body">
            <div className="feature-panel__input-row feature-panel__input-row--slider">
              <label className="feature-panel__input-slider-block">
                <span className="feature-panel__input-slider-label">Value</span>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={Math.max((range.max - range.min) / 200, 0.001)}
                  value={value}
                  disabled={sliderDisabled}
                  onChange={handleSliderChange}
                />
              </label>
            </div>

            <div className="feature-panel__input-row feature-panel__input-row--path">
              <label className="feature-panel__input-path-label">
                Path
                <input
                  className="feature-panel__input-text"
                  type="text"
                  defaultValue={input.path}
                  onBlur={handlePathBlur}
                  onKeyDown={handlePathKeyDown}
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="feature-panel__input-row feature-panel__input-row--mappings">
              <div className="feature-panel__input-chip-group">
                {usage.length > 0 ? (
                  usage.map(({ targetId, label, kind }) => (
                    <span
                      key={`${kind}:${targetId}`}
                      className={`feature-panel__input-chip feature-panel__input-chip--${kind}`}
                    >
                      {label}
                      {kind === "animatable" && (
                        <button
                          type="button"
                          className="feature-panel__input-chip-dismiss"
                          onClick={() => onUnbindTarget(targetId)}
                          title={`Remove mapping from ${label}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="feature-panel__input-chip feature-panel__input-chip--empty">
                    Unmapped
                  </span>
                )}
              </div>
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--danger"
                onClick={() => onClearInputMappings(input)}
                disabled={animatableUsage.length === 0}
              >
                Clear mappings
              </button>
            </div>

            <div className="feature-panel__input-row feature-panel__input-row--parents">
              <div className="feature-panel__input-derived">
                <div className="feature-panel__input-derived-actions">
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--primary"
                    onClick={handleStartChildSelection}
                    disabled={childOptions.length === 0}
                  >
                    Add child
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--primary"
                    onClick={toggleParentExpanded}
                  >
                    {isParentExpanded ? "Hide parent mapping" : "Add parent"}
                  </button>
                  {parentBinding && (
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--secondary"
                      onClick={() => onParentResetBinding(input.id)}
                    >
                      Reset mapping
                    </button>
                  )}
                </div>

                {childEntries.length > 0 && (
                  <div className="feature-panel__input-derived-children">
                    <span>Children</span>
                    <div className="feature-panel__input-chip-group">
                      {childEntries.map((child) => (
                        <span
                          key={child.id}
                          className="feature-panel__input-chip feature-panel__input-chip--child"
                        >
                          {child.label}
                        </span>
                      ))}
                    </div>
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
                            onChange={handleChildSelectionChange}
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
                            className="feature-panel__input-action feature-panel__input-action--primary"
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
                    onBindingExpressionChange={onParentBindingExpressionChange}
                    onBindingSlotAliasChange={onParentBindingSlotAliasChange}
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
        )}
      </div>
    );
  };

  return (
    <section className="feature-panel__section">
      <header className="feature-panel__section-header">
        <button
          type="button"
          className="feature-panel__section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} standard inputs`}
        />
        <h2 className="feature-panel__section-title">Standard Inputs</h2>
      </header>

      {!isCollapsed && (
        <div className="feature-panel__section-body">
          <div className="feature-panel__input-toolbar">
            <label className="feature-panel__face-id">
              Face
              <input
                type="text"
                value={faceId}
                onChange={handleFaceIdInput}
                spellCheck={false}
              />
            </label>
            <div className="feature-panel__input-filters">
              <span className="feature-panel__input-filters-label">Groups</span>
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
                  <div
                    key={root}
                    className="feature-panel__input-filter-chip-wrapper"
                  >
                    <button
                      type="button"
                      className="feature-panel__input-filter-chip"
                      data-active={selectedSet.has(root)}
                      onClick={() => handleRootToggle(root)}
                    >
                      {formatToken(root)}
                    </button>
                    <button
                      type="button"
                      className="feature-panel__input-filter-rename"
                      onClick={() => handleRenameRoot(root)}
                      title="Rename group"
                    >
                      ✎
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={onResetAllInputs}
              className="feature-panel__input-action feature-panel__input-action--secondary"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={onCreateInput}
              className="feature-panel__input-add"
            >
              Add custom input
            </button>
          </div>

          {graphAlert}

          {emptyMessage ? (
            <p className="feature-panel__inputs-empty">{emptyMessage}</p>
          ) : (
            <div className="feature-panel__inputs">
              {filteredInputs.map(renderInputCard)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

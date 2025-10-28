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
import { promptDialog, confirmDialog } from "../../utils/dialogs";
import { extractStandardInputSubgroups } from "../../utils/standardInputs";

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
  selectedSubgroups: string[];
  onSelectedSubgroupsChange: (next: string[]) => void;
  onRenameGroup: (sourceGroup: string, nextGroup: string) => void;
  inputValues: StandardInputValues;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  bindingIssues: Map<string, readonly string[]>;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onResetAllInputs: () => void;
  onClearCachedState: () => void;
  onEnsureParentBinding: (inputId: string) => void;
  onLinkChildInput: (parentId: string, childId: string) => void;
  onUnlinkChildInput: (parentId: string, childId: string) => void;
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
  selectedSubgroups,
  onSelectedSubgroupsChange,
  onRenameGroup,
  inputValues,
  effectiveInputRanges,
  inputUsage,
  bindingIssues,
  onInputValueChange,
  onCreateInput,
  onResetAllInputs,
  onClearCachedState,
  onEnsureParentBinding,
  onLinkChildInput,
  onUnlinkChildInput,
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
  const selectedSubgroupSet = useMemo(
    () => new Set<string>(selectedSubgroups),
    [selectedSubgroups],
  );

  const inputSubgroups = useMemo(() => {
    const map = new Map<string, string[]>();
    inputs.forEach((entry) => {
      const root = getRootKey(entry);
      const subgroups = extractStandardInputSubgroups(entry.input.path, root);
      map.set(entry.input.id, subgroups);
    });
    return map;
  }, [inputs]);

  const availableSubgroups = useMemo(() => {
    const collector = new Set<string>();
    inputs.forEach((entry) => {
      const rootKey = getRootKey(entry);
      if (selectedSet.size > 0 && !selectedSet.has(rootKey)) {
        return;
      }
      const subgroups = inputSubgroups.get(entry.input.id) ?? [];
      subgroups.forEach((token) => {
        if (token) {
          collector.add(token);
        }
      });
    });
    return Array.from(collector).sort((a, b) => a.localeCompare(b));
  }, [inputSubgroups, inputs, selectedSet]);

  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedChildMappings, setCollapsedChildMappings] = useState<
    Set<string>
  >(() => new Set());
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
      const response = promptDialog(`Rename group "${root}"`, root);
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

  const handleSubgroupSelectAll = useCallback(() => {
    onSelectedSubgroupsChange([]);
  }, [onSelectedSubgroupsChange]);

  const handleSubgroupToggle = useCallback(
    (subgroup: string) => {
      const nextSelection = selectedSubgroupSet.has(subgroup)
        ? selectedSubgroups.filter((value) => value !== subgroup)
        : [...selectedSubgroups, subgroup];
      onSelectedSubgroupsChange(nextSelection);
    },
    [onSelectedSubgroupsChange, selectedSubgroupSet, selectedSubgroups],
  );

  const handleClearCachedState = useCallback(() => {
    if (
      confirmDialog(
        "Clear cached rig data for this asset? This removes saved inputs, bindings, and overrides.",
      )
    ) {
      onClearCachedState();
    }
  }, [onClearCachedState]);

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
    const byRoot =
      selectedSet.size === 0
        ? inputs
        : inputs.filter((entry) => selectedSet.has(getRootKey(entry)));
    if (selectedSubgroupSet.size === 0) {
      return byRoot;
    }
    return byRoot.filter((entry) => {
      const subgroups = inputSubgroups.get(entry.input.id) ?? [];
      if (subgroups.length === 0) {
        return false;
      }
      return subgroups.some((token) => selectedSubgroupSet.has(token));
    });
  }, [inputSubgroups, inputs, selectedSet, selectedSubgroupSet]);

  const emptyMessage = useMemo(() => {
    if (inputs.length === 0) {
      return "No standard inputs are available for this rig.";
    }
    if (selectedSubgroups.length > 0 && filteredInputs.length === 0) {
      return "No inputs match the selected subgroups yet.";
    }
    if (selectedRoots.length > 0 && filteredInputs.length === 0) {
      const [firstRoot] = selectedRoots;
      return `No inputs for ${firstRoot} yet. Add one from the feature tree or create a custom input.`;
    }
    return null;
  }, [filteredInputs.length, inputs.length, selectedRoots, selectedSubgroups]);

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
      .map((candidate) => ({
        id: candidate.id,
        label: candidate.path,
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
          label: childEntry ? childEntry.input.path : childId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    const parentConnections = parentBinding
      ? (() => {
          const ids = new Set<string>();
          if (
            parentBinding.inputId &&
            parentBinding.inputId !== SELF_BINDING_ID
          ) {
            ids.add(parentBinding.inputId);
          }
          parentBinding.slots.forEach((slot) => {
            if (slot.inputId && slot.inputId !== SELF_BINDING_ID) {
              ids.add(slot.inputId);
            }
          });
          return Array.from(ids)
            .map((parentId) => {
              const parentEntry = entriesById.get(parentId);
              return {
                id: parentId,
                label: parentEntry ? parentEntry.input.path : parentId,
              };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        })()
      : [];

    const parentStatusLabel =
      parentConnections.length > 0
        ? `${parentConnections.length} linked`
        : "None linked";

    const childStatusLabel =
      childEntries.length > 0 ? `${childEntries.length} linked` : "None linked";

    const parentToggleLabel = isParentExpanded
      ? "Hide parent mapping"
      : parentConnections.length > 0
        ? "Show mapping"
        : "Add parent";

    const areChildrenCollapsed = collapsedChildMappings.has(input.id);
    const showChildList = !areChildrenCollapsed || isSelectingChild;

    const childToggleLabel = showChildList ? "Hide children" : "Show children";

    const toggleChildVisibility = () => {
      setCollapsedChildMappings((previous) => {
        const next = new Set(previous);
        if (next.has(input.id)) {
          next.delete(input.id);
        } else {
          next.add(input.id);
        }
        return next;
      });
    };

    const handleRemoveChildLink = (childId: string) => {
      onUnlinkChildInput(input.id, childId);
    };

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
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${input.path}`}
            />
            <span className="feature-panel__input-name">{input.path}</span>
            <label className="feature-panel__input-slider">
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
            <label className="feature-panel__input-value">
              <input
                className="feature-panel__input-number"
                type="number"
                value={value}
                min={range.min}
                max={range.max}
                step={Math.max((range.max - range.min) / 200, 0.001)}
                onChange={handleNumericChange}
              />
            </label>
          </div>
          {!isAuto && (
            <div className="feature-panel__input-header-actions">
              <button
                type="button"
                className="feature-panel__input-action feature-panel__input-action--danger"
                onClick={() => onDeleteInput(input)}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="feature-panel__input-body">
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
            <div className="feature-panel__input-mappings">
              <section className="feature-panel__mapping-group feature-panel__mapping-group--usage">
                <div className="feature-panel__mapping-header">
                  <div className="feature-panel__mapping-title">
                    <span>Feature mappings</span>
                    <span className="feature-panel__mapping-status">
                      {animatableUsage.length > 0
                        ? `${animatableUsage.length} linked`
                        : "None linked"}
                    </span>
                  </div>
                  <div className="feature-panel__mapping-actions">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--danger"
                      onClick={() => onClearInputMappings(input)}
                      disabled={animatableUsage.length === 0}
                    >
                      Clear feature mappings
                    </button>
                  </div>
                </div>
                <div className="feature-panel__mapping-content">
                  {animatableUsage.length > 0 ? (
                    <div className="feature-panel__mapping-chips">
                      {animatableUsage.map(({ targetId, label }) => (
                        <span
                          key={`animatable:${targetId}`}
                          className="feature-panel__input-chip feature-panel__input-chip--animatable"
                        >
                          {label}
                          <button
                            type="button"
                            className="feature-panel__input-chip-dismiss"
                            onClick={() => onUnbindTarget(targetId)}
                            title={`Remove mapping from ${label}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="feature-panel__mapping-empty">
                      No features linked.
                    </p>
                  )}
                  <p className="feature-panel__mapping-empty">
                    Add to other features from the features section below.
                  </p>
                </div>
              </section>

              <section className="feature-panel__mapping-group feature-panel__mapping-group--parents">
                <div className="feature-panel__mapping-header">
                  <div className="feature-panel__mapping-title">
                    <span>Parent inputs</span>
                    <span className="feature-panel__mapping-status">
                      {parentStatusLabel}
                    </span>
                  </div>
                  <div className="feature-panel__mapping-actions">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={toggleParentExpanded}
                    >
                      {parentToggleLabel}
                    </button>
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--secondary"
                      onClick={() => onParentResetBinding(input.id)}
                      disabled={parentConnections.length === 0}
                    >
                      Reset parents
                    </button>
                  </div>
                </div>
                {parentConnections.length > 0 ? (
                  <div className="feature-panel__mapping-content">
                    <div className="feature-panel__mapping-chips">
                      {parentConnections.map((parent) => (
                        <span
                          key={`parent:${parent.id}`}
                          className="feature-panel__input-chip feature-panel__input-chip--parent"
                        >
                          {parent.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="feature-panel__mapping-empty">
                    No parent inputs linked.
                  </p>
                )}
                {isParentExpanded && bindingForEditor && (
                  <div className="feature-panel__mapping-editor">
                    <BindingEditor
                      binding={bindingForEditor}
                      targetId={input.id}
                      label={`${input.path} mapping`}
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
                      onBindingSlotAliasChange={onParentBindingSlotAliasChange}
                      onResetBinding={
                        parentBinding
                          ? () => onParentResetBinding(input.id)
                          : undefined
                      }
                      expandable={false}
                      outputDefaults={{
                        rangeMin: parentTarget.range.min,
                        rangeMax: parentTarget.range.max,
                        defaultValue: parentTarget.defaultValue,
                      }}
                    />
                  </div>
                )}
              </section>

              <section className="feature-panel__mapping-group feature-panel__mapping-group--children">
                <div className="feature-panel__mapping-header">
                  <div className="feature-panel__mapping-title">
                    <span>Child inputs</span>
                    <span className="feature-panel__mapping-status">
                      {childStatusLabel}
                    </span>
                  </div>
                  <div className="feature-panel__mapping-actions">
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={handleStartChildSelection}
                      disabled={childOptions.length === 0}
                    >
                      Add child
                    </button>
                    {childEntries.length > 0 && (
                      <button
                        type="button"
                        className="feature-panel__input-action feature-panel__input-action--secondary"
                        onClick={toggleChildVisibility}
                      >
                        {childToggleLabel}
                      </button>
                    )}
                  </div>
                </div>
                {showChildList && (
                  <div className="feature-panel__mapping-content">
                    {childEntries.length > 0 ? (
                      <div className="feature-panel__mapping-chips">
                        {childEntries.map((child) => (
                          <span
                            key={`child:${child.id}`}
                            className="feature-panel__input-chip feature-panel__input-chip--child"
                          >
                            {child.label}
                            <button
                              type="button"
                              className="feature-panel__input-chip-dismiss"
                              onClick={() => handleRemoveChildLink(child.id)}
                              title={`Remove ${child.label} mapping`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="feature-panel__mapping-empty">
                        No child inputs linked.
                      </p>
                    )}
                  </div>
                )}
                {isSelectingChild && (
                  <div className="feature-panel__mapping-child-editor">
                    {childOptions.length > 0 ? (
                      <>
                        <label className="feature-panel__mapping-child-label">
                          <span>Select child</span>
                          <select
                            className="feature-panel__mapping-child-select"
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
                        <div className="feature-panel__mapping-child-actions">
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
                      <div className="feature-panel__mapping-empty">
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
              </section>
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
        <h2 className="feature-panel__section-title">Controlling Inputs</h2>
      </header>
      <p className="sidebar__description">
        This section contains the inputs used to control the graph. Inputs can
        be mapped to drive animatable values or be used with other inputs
      </p>
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
                      {root}
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
            {availableSubgroups.length > 0 && (
              <div className="feature-panel__input-filters">
                <span className="feature-panel__input-filters-label">
                  Subgroups
                </span>
                <div className="feature-panel__input-filter-chips">
                  <button
                    type="button"
                    className="feature-panel__input-filter-chip"
                    data-active={selectedSubgroupSet.size === 0}
                    onClick={handleSubgroupSelectAll}
                  >
                    All
                  </button>
                  {availableSubgroups.map((subgroup) => (
                    <button
                      key={subgroup}
                      type="button"
                      className="feature-panel__input-filter-chip"
                      data-active={selectedSubgroupSet.has(subgroup)}
                      onClick={() => handleSubgroupToggle(subgroup)}
                    >
                      {subgroup}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onResetAllInputs}
              className="feature-panel__input-action feature-panel__input-action--secondary"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={handleClearCachedState}
              className="feature-panel__input-action feature-panel__input-action--danger"
            >
              Clear cached rig
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

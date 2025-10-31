import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import {
  SELF_BINDING_ID,
  type StandardRigInput,
  type RemapSettings,
} from "@vizij/utils";
import type { AnimatableBinding } from "../../rig/state";
import { REMAP_INPUT_FIELDS, REMAP_OUTPUT_FIELDS } from "./bindingFields";
import type { BindingField } from "./types";

type RemapPreset = {
  outLow: number;
  outAnchor: number;
  outHigh: number;
};

type RemapOutputDefaults = {
  rangeMin: number;
  rangeMax: number;
  defaultValue: number;
};

const SCALE_PRESET: RemapPreset = {
  outLow: 0,
  outAnchor: 1,
  outHigh: 2,
};

const ROTATION_PRESET: RemapPreset = {
  outLow: -3.14,
  outAnchor: 0,
  outHigh: 3.14,
};

function clamp(value: number, min: number, max: number): number {
  const normalizedMin = Math.min(min, max);
  const normalizedMax = Math.max(min, max);
  return Math.max(normalizedMin, Math.min(normalizedMax, value));
}

const EPSILON = 1e-4;

function isApproximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function computeMidpoint(a: number, b: number): number {
  return (a + b) / 2;
}

function anchorsMatchMidpoint(remap: RemapSettings): boolean {
  const inMid = computeMidpoint(remap.inLow, remap.inHigh);
  const outMid = computeMidpoint(remap.outLow, remap.outHigh);
  return (
    isApproximatelyEqual(remap.inAnchor, inMid) &&
    isApproximatelyEqual(remap.outAnchor, outMid)
  );
}

function computeInitialManualAnchorSlots(
  slots: AnimatableBinding["slots"] | undefined,
): Set<string> {
  const initial = new Set<string>();
  if (!slots) {
    return initial;
  }
  slots.forEach((slot) => {
    if (!anchorsMatchMidpoint(slot.remap)) {
      initial.add(slot.id);
    }
  });
  return initial;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

interface BindingEditorProps {
  binding: AnimatableBinding;
  targetId: string;
  label: string;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  issues?: readonly string[];
  onBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  onBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
    slotId?: string,
  ) => void;
  onAddBindingSlot: (targetId: string) => void;
  onRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onBindingExpressionChange: (targetId: string, expression: string) => void;
  onBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  onRequestCreateStandardInput?: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  onResetBinding?: (targetId: string) => void;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
  expandable?: boolean;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  outputDefaults?: RemapOutputDefaults;
}

export function BindingEditor({
  binding,
  targetId,
  label,
  standardInputs,
  standardInputLookup,
  issues,
  onBindingInputChange,
  onBindingRemapChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onRequestCreateStandardInput: _onRequestCreateStandardInput,
  onResetBinding,
  headerActions,
  children,
  expandable = true,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  outputDefaults,
}: BindingEditorProps) {
  const isControlled = typeof expanded === "boolean";
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = isControlled ? (expanded as boolean) : internalExpanded;

  const slots = binding.slots ?? [];

  const [manualAnchorSlots, setManualAnchorSlots] = useState<Set<string>>(() =>
    computeInitialManualAnchorSlots(slots),
  );
  const [slotFilters, setSlotFilters] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [openSlotSelects, setOpenSlotSelects] = useState<Set<string>>(
    () => new Set(),
  );
  const slotContainerRefs = useRef(new Map<string, HTMLDivElement | null>());
  const slotFilterInputRefs = useRef(
    new Map<string, HTMLInputElement | null>(),
  );

  useEffect(() => {
    setSlotFilters((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      const validKeys = new Set(slots.map((slot) => `${targetId}:${slot.id}`));
      let changed = false;
      const next = new Map(previous);
      previous.forEach((_, key) => {
        if (!validKeys.has(key)) {
          next.delete(key);
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [slots, targetId]);

  useEffect(() => {
    setOpenSlotSelects((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      const validKeys = new Set(slots.map((slot) => `${targetId}:${slot.id}`));
      let changed = false;
      const next = new Set<string>();
      previous.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [slots, targetId]);

  const updateSlotFilter = useCallback((key: string, nextValue: string) => {
    setSlotFilters((previous) => {
      const currentValue = previous.get(key) ?? "";
      if (currentValue === nextValue) {
        return previous;
      }
      const next = new Map(previous);
      if (nextValue.length === 0) {
        next.delete(key);
      } else {
        next.set(key, nextValue);
      }
      return next;
    });
  }, []);

  const openSlotDropdown = useCallback((key: string) => {
    setOpenSlotSelects((previous) => {
      if (previous.has(key)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  }, []);

  const closeSlotDropdown = useCallback(
    (key: string) => {
      setOpenSlotSelects((previous) => {
        if (!previous.has(key)) {
          return previous;
        }
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
      updateSlotFilter(key, "");
    },
    [updateSlotFilter],
  );

  useEffect(() => {
    if (openSlotSelects.size === 0) {
      return;
    }
    openSlotSelects.forEach((key) => {
      const inputNode = slotFilterInputRefs.current.get(key);
      if (inputNode) {
        inputNode.focus({ preventScroll: true });
        if (inputNode.value.length > 0) {
          inputNode.setSelectionRange(
            inputNode.value.length,
            inputNode.value.length,
          );
        }
      }
    });
  }, [openSlotSelects]);

  useEffect(() => {
    if (openSlotSelects.size === 0) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const keysToClose: string[] = [];
      setOpenSlotSelects((previous) => {
        if (previous.size === 0) {
          return previous;
        }
        let changed = false;
        const next = new Set(previous);
        previous.forEach((key) => {
          const container = slotContainerRefs.current.get(key);
          if (container && !container.contains(target)) {
            next.delete(key);
            keysToClose.push(key);
            changed = true;
          }
        });
        if (!changed) {
          keysToClose.length = 0;
          return previous;
        }
        return next;
      });
      if (keysToClose.length > 0) {
        keysToClose.forEach((key) => updateSlotFilter(key, ""));
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openSlotSelects, updateSlotFilter]);

  useEffect(() => {
    setManualAnchorSlots((previous) => {
      const next = new Set(previous);
      const slotIds = new Set(slots.map((slot) => slot.id));
      let changed = false;

      Array.from(next).forEach((slotId) => {
        if (!slotIds.has(slotId)) {
          next.delete(slotId);
          changed = true;
        }
      });

      slots.forEach((slot) => {
        if (!next.has(slot.id) && !anchorsMatchMidpoint(slot.remap)) {
          next.add(slot.id);
          changed = true;
        }
      });

      if (!changed || setsEqual(next, previous)) {
        return previous;
      }
      return next;
    });
  }, [slots]);

  const toggleExpanded = useCallback(() => {
    if (!expandable) {
      return;
    }
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  }, [expandable, isExpanded, isControlled, onExpandedChange]);

  const animatablePreset = useMemo<RemapPreset | null>(() => {
    if (!outputDefaults) {
      return null;
    }
    const anchor = clamp(
      outputDefaults.defaultValue,
      outputDefaults.rangeMin,
      outputDefaults.rangeMax,
    );
    return {
      outLow: outputDefaults.rangeMin,
      outAnchor: anchor,
      outHigh: outputDefaults.rangeMax,
    };
  }, [outputDefaults]);
  const expressionValue = binding.expression ?? slots[0]?.alias ?? "";

  const aliasHints = useMemo(() => {
    return slots
      .map((slot) => {
        if (slot.inputId === SELF_BINDING_ID) {
          return `${slot.alias} → Slider`;
        }
        const inputMeta =
          slot.inputId !== null ? standardInputLookup.get(slot.inputId) : null;
        if (inputMeta) {
          return `${slot.alias} → ${inputMeta.path}`;
        }
        return slot.alias;
      })
      .filter(Boolean)
      .join(", ");
  }, [slots, standardInputLookup]);

  const issueList = useMemo(
    () => (issues ? [...new Set(issues)] : []),
    [issues],
  );

  const handleAnchorToggle = useCallback(
    (slot: AnimatableBinding["slots"][number], makeManual: boolean) => {
      setManualAnchorSlots((previous) => {
        const next = new Set(previous);
        if (makeManual) {
          next.add(slot.id);
        } else {
          next.delete(slot.id);
        }
        return next;
      });
      if (!makeManual) {
        const nextInAnchor = computeMidpoint(
          slot.remap.inLow,
          slot.remap.inHigh,
        );
        const nextOutAnchor = computeMidpoint(
          slot.remap.outLow,
          slot.remap.outHigh,
        );
        if (!isApproximatelyEqual(slot.remap.inAnchor, nextInAnchor)) {
          onBindingRemapChange(targetId, "inAnchor", nextInAnchor, slot.id);
        }
        if (!isApproximatelyEqual(slot.remap.outAnchor, nextOutAnchor)) {
          onBindingRemapChange(targetId, "outAnchor", nextOutAnchor, slot.id);
        }
      }
    },
    [onBindingRemapChange, targetId],
  );

  const header = (
    <div className="feature-tree__property-main feature-panel__binding-header">
      {expandable && (
        <button
          type="button"
          className="feature-tree__disclosure-btn"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${label}`}
        />
      )}
      <span className="feature-tree__property-label">
        Property {label} Drivers Config
      </span>
      {headerActions}
      {onResetBinding && (
        <button
          type="button"
          className="feature-panel__input-action feature-panel__input-action--secondary feature-tree__unbind-btn"
          onClick={() => onResetBinding(targetId)}
        >
          Reset
        </button>
      )}
    </div>
  );

  const handleAddSlot = useCallback(() => {
    onAddBindingSlot(targetId);
  }, [onAddBindingSlot, targetId]);

  if (expandable && !isExpanded) {
    return (
      <div className="feature-tree__property-row">
        {header}
        {issueList.length > 0 && (
          <ul className="feature-tree__expression-errors">
            {issueList.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="feature-tree__property-row feature-tree__property-row--binding">
      {header}
      <div className="feature-tree__binding-editor">
        <div className="feature-tree__binding-slots">
          {slots.map((slot, index) => {
            const slotInputId = slot.inputId ?? "";
            const showAnchor = manualAnchorSlots.has(slot.id);
            const filterKey = `${targetId}:${slot.id}`;
            const slotFilter = slotFilters.get(filterKey) ?? "";
            const normalizedFilter = slotFilter.trim().toLowerCase();

            const baseFilteredInputs =
              normalizedFilter.length === 0
                ? standardInputs
                : standardInputs.filter((candidate) => {
                    const lowerPath = candidate.path.toLowerCase();
                    const lowerId = candidate.id.toLowerCase();
                    const lowerLabel = candidate.label
                      ? candidate.label.toLowerCase()
                      : "";
                    return (
                      lowerPath.includes(normalizedFilter) ||
                      lowerId.includes(normalizedFilter) ||
                      (lowerLabel.length > 0 &&
                        lowerLabel.includes(normalizedFilter))
                    );
                  });

            let filteredInputs = baseFilteredInputs;

            const selectedInput =
              slotInputId && slotInputId !== SELF_BINDING_ID
                ? standardInputLookup.get(slotInputId)
                : null;
            if (
              selectedInput &&
              !filteredInputs.some((entry) => entry.id === selectedInput.id)
            ) {
              filteredInputs = [selectedInput, ...filteredInputs];
            }

            const showNoMatches =
              normalizedFilter.length > 0 && baseFilteredInputs.length === 0;

            const isDropdownOpen = openSlotSelects.has(filterKey);

            const currentLabel =
              slotInputId === ""
                ? "Unbound"
                : slotInputId === SELF_BINDING_ID
                  ? "Slider (self)"
                  : selectedInput
                    ? selectedInput.path
                    : (standardInputLookup.get(slotInputId)?.path ??
                      slotInputId);

            const optionEntries: Array<{
              key: string;
              label: string;
              value: string | null;
            }> = [
              { key: "unbound", label: "Unbound", value: null },
              { key: "self", label: "Slider (self)", value: SELF_BINDING_ID },
              ...filteredInputs.map((input) => ({
                key: `input:${input.id}`,
                label: input.path,
                value: input.id,
              })),
            ];

            const selectOption = (value: string | null) => {
              if (
                (value === null && !slotInputId) ||
                (value === SELF_BINDING_ID &&
                  slotInputId === SELF_BINDING_ID) ||
                (typeof value === "string" &&
                  value !== SELF_BINDING_ID &&
                  value === slotInputId)
              ) {
                closeSlotDropdown(filterKey);
                return;
              }
              onBindingInputChange(targetId, value, slot.id);
              closeSlotDropdown(filterKey);
            };

            const handleFilterInputKeyDown = (
              event: KeyboardEvent<HTMLInputElement>,
            ) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                const container = slotContainerRefs.current.get(filterKey);
                const firstOption = container?.querySelector<HTMLButtonElement>(
                  'button[data-option="true"]',
                );
                firstOption?.focus();
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                const container = slotContainerRefs.current.get(filterKey);
                const buttons = container?.querySelectorAll<HTMLButtonElement>(
                  'button[data-option="true"]',
                );
                const lastButton =
                  buttons && buttons.length > 0
                    ? buttons[buttons.length - 1]
                    : null;
                lastButton?.focus();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const firstMatch = baseFilteredInputs[0];
                if (firstMatch) {
                  selectOption(firstMatch.id);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeSlotDropdown(filterKey);
              }
            };

            const handleOptionKeyDown = (
              event: KeyboardEvent<HTMLButtonElement>,
              value: string | null,
            ) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const container = slotContainerRefs.current.get(filterKey);
                if (!container) {
                  return;
                }
                const buttons: HTMLButtonElement[] = Array.from(
                  container.querySelectorAll<HTMLButtonElement>(
                    'button[data-option="true"]',
                  ),
                );
                const index = buttons.indexOf(event.currentTarget);
                if (index === -1) {
                  return;
                }
                if (event.key === "ArrowUp" && index === 0) {
                  const inputNode = slotFilterInputRefs.current.get(filterKey);
                  inputNode?.focus();
                  return;
                }
                const nextIndex =
                  event.key === "ArrowDown"
                    ? Math.min(buttons.length - 1, index + 1)
                    : Math.max(0, index - 1);
                buttons[nextIndex]?.focus();
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectOption(value);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeSlotDropdown(filterKey);
              }
            };

            const handleComboboxToggle = () => {
              if (isDropdownOpen) {
                closeSlotDropdown(filterKey);
              } else {
                openSlotDropdown(filterKey);
              }
            };

            const inputFields = showAnchor
              ? REMAP_INPUT_FIELDS
              : REMAP_INPUT_FIELDS.filter(({ field }) => field !== "inAnchor");
            const outputFields = showAnchor
              ? REMAP_OUTPUT_FIELDS
              : REMAP_OUTPUT_FIELDS.filter(
                  ({ field }) => field !== "outAnchor",
                );

            const handleFieldChange = (field: BindingField, value: number) => {
              onBindingRemapChange(targetId, field, value, slot.id);

              if (manualAnchorSlots.has(slot.id)) {
                return;
              }

              if (field === "inLow" || field === "inHigh") {
                const nextLow = field === "inLow" ? value : slot.remap.inLow;
                const nextHigh = field === "inHigh" ? value : slot.remap.inHigh;
                const nextAnchor = computeMidpoint(nextLow, nextHigh);
                if (!isApproximatelyEqual(slot.remap.inAnchor, nextAnchor)) {
                  onBindingRemapChange(
                    targetId,
                    "inAnchor",
                    nextAnchor,
                    slot.id,
                  );
                }
              }

              if (field === "outLow" || field === "outHigh") {
                const nextLow = field === "outLow" ? value : slot.remap.outLow;
                const nextHigh =
                  field === "outHigh" ? value : slot.remap.outHigh;
                const nextAnchor = computeMidpoint(nextLow, nextHigh);
                if (!isApproximatelyEqual(slot.remap.outAnchor, nextAnchor)) {
                  onBindingRemapChange(
                    targetId,
                    "outAnchor",
                    nextAnchor,
                    slot.id,
                  );
                }
              }
            };

            const handlePreset = (preset: RemapPreset) => {
              const manual = manualAnchorSlots.has(slot.id);
              const nextOutLow = preset.outLow;
              const nextOutHigh = preset.outHigh;
              const nextOutAnchor = manual
                ? preset.outAnchor
                : computeMidpoint(nextOutLow, nextOutHigh);

              onBindingRemapChange(targetId, "outLow", nextOutLow, slot.id);
              onBindingRemapChange(targetId, "outHigh", nextOutHigh, slot.id);

              if (
                manual ||
                !isApproximatelyEqual(slot.remap.outAnchor, nextOutAnchor)
              ) {
                onBindingRemapChange(
                  targetId,
                  "outAnchor",
                  nextOutAnchor,
                  slot.id,
                );
              }
            };

            return (
              <div key={slot.id} className="feature-tree__binding-slot">
                <div className="feature-tree__binding-slot-header">
                  <span className="feature-tree__property-label">
                    Input Alias:
                  </span>
                  <input
                    className="feature-tree__binding-slot-alias-input"
                    value={slot.alias}
                    placeholder={slot.id}
                    onChange={(event) =>
                      onBindingSlotAliasChange(
                        targetId,
                        slot.id,
                        event.target.value,
                      )
                    }
                    aria-label={`Alias for ${label} slot ${index + 1}`}
                    spellCheck={false}
                  />
                  <span className="feature-tree__property-label">
                    (Used Below)
                  </span>

                  {index > 0 && (
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--danger feature-tree__binding-slot-remove"
                      onClick={() => onRemoveBindingSlot(targetId, slot.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div
                  className="feature-tree__binding-slot-controls"
                  ref={(node) => {
                    if (node) {
                      slotContainerRefs.current.set(filterKey, node);
                    } else {
                      slotContainerRefs.current.delete(filterKey);
                    }
                  }}
                >
                  <span className="feature-tree__property-label">
                    Driver Binding:
                  </span>
                  <div className="feature-tree__binding-slot-combobox">
                    <button
                      type="button"
                      className="feature-tree__property-select"
                      data-open={isDropdownOpen}
                      onClick={handleComboboxToggle}
                      aria-haspopup="listbox"
                      aria-expanded={isDropdownOpen}
                    >
                      {currentLabel}
                    </button>
                    {isDropdownOpen && (
                      <div className="feature-tree__binding-slot-menu">
                        <input
                          className="feature-panel__input-text feature-tree__binding-slot-filter"
                          ref={(node) => {
                            if (node) {
                              slotFilterInputRefs.current.set(filterKey, node);
                            } else {
                              slotFilterInputRefs.current.delete(filterKey);
                            }
                          }}
                          value={slotFilter}
                          onChange={(event) =>
                            updateSlotFilter(filterKey, event.target.value)
                          }
                          onKeyDown={handleFilterInputKeyDown}
                          placeholder="Search inputs"
                          aria-label="Filter bindings"
                        />
                        <div
                          className="feature-tree__binding-slot-option-list"
                          role="listbox"
                        >
                          {optionEntries.map((option) => {
                            const value = option.value;
                            const isSelected =
                              (value === null && !slotInputId) ||
                              (value === SELF_BINDING_ID &&
                                slotInputId === SELF_BINDING_ID) ||
                              (typeof value === "string" &&
                                value !== SELF_BINDING_ID &&
                                value === slotInputId);
                            return (
                              <button
                                key={option.key}
                                type="button"
                                role="option"
                                data-option="true"
                                aria-selected={isSelected}
                                className="feature-tree__binding-slot-option"
                                onClick={() => selectOption(value)}
                                onKeyDown={(event) =>
                                  handleOptionKeyDown(event, value)
                                }
                              >
                                {option.label}
                              </button>
                            );
                          })}
                          {showNoMatches && (
                            <div className="feature-tree__binding-slot-option feature-tree__binding-slot-option--empty">
                              No matches
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() =>
                      onBindingInputChange(targetId, null, slot.id)
                    }
                    disabled={!slot.inputId}
                  >
                    Unbind
                  </button>
                  {/* {onRequestCreateStandardInput && (
                    <button
                      type="button"
                      className="feature-panel__input-action feature-panel__input-action--primary"
                      onClick={() => {
                        const created = onRequestCreateStandardInput();
                        if (created) {
                          onBindingInputChange(targetId, created.id, slot.id);
                        }
                      }}
                    >
                      New
                    </button>
                  )} */}
                </div>
                <div className="feature-tree__matrix-columns feature-tree__matrix-columns--slots">
                  <div className="feature-tree__property-column">
                    <h4>Input remap</h4>
                    <div className="feature-tree__matrix-grid">
                      {inputFields.map(({ field, label: columnLabel }) => (
                        <label key={field}>
                          <span>{columnLabel}</span>
                          <input
                            type="number"
                            step={0.01}
                            value={slot.remap[field]}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              if (Number.isFinite(parsed)) {
                                handleFieldChange(field, parsed);
                              }
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="feature-tree__property-column">
                    <h4>Output remap</h4>
                    <div className="feature-tree__matrix-grid">
                      {outputFields.map(({ field, label: columnLabel }) => (
                        <label key={field}>
                          <span>{columnLabel}</span>
                          <input
                            type="number"
                            step={0.01}
                            value={slot.remap[field]}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              if (Number.isFinite(parsed)) {
                                handleFieldChange(field, parsed);
                              }
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="feature-tree__remap-anchor">
                  <span className="feature-tree__remap-anchor-label">
                    Anchor:
                  </span>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => handleAnchorToggle(slot, !showAnchor)}
                  >
                    {showAnchor ? "Remove anchor" : "Set anchor"}
                  </button>
                  {!showAnchor && (
                    <span className="feature-tree__remap-anchor-hint">
                      follows midpoint
                    </span>
                  )}
                </div>
                <div className="feature-tree__remap-presets">
                  <span className="feature-tree__remap-presets-label">
                    Set Remap:
                  </span>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() =>
                      handlePreset({
                        outLow: slot.remap.inLow,
                        outAnchor: slot.remap.inAnchor,
                        outHigh: slot.remap.inHigh,
                      })
                    }
                  >
                    Input
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => {
                      if (animatablePreset) {
                        handlePreset(animatablePreset);
                      }
                    }}
                    disabled={!animatablePreset}
                  >
                    Animatable
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => handlePreset(SCALE_PRESET)}
                  >
                    Scale
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => handlePreset(ROTATION_PRESET)}
                  >
                    Rotation
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="feature-panel__input-action feature-panel__input-action--primary feature-tree__slot-add"
            onClick={handleAddSlot}
          >
            Add control
          </button>
        </div>
        <div className="feature-tree__expression-editor">
          <label htmlFor={`binding-expression-${targetId}`}>Expression</label>
          <textarea
            id={`binding-expression-${targetId}`}
            value={expressionValue}
            onChange={(event) =>
              onBindingExpressionChange(targetId, event.target.value)
            }
            aria-invalid={issueList.length > 0}
            spellCheck={false}
          />
          {aliasHints && (
            <p className="feature-tree__expression-hints">
              Aliases: {aliasHints}
            </p>
          )}
          {issueList.length > 0 && (
            <ul className="feature-tree__expression-errors">
              {issueList.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

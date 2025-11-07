import { useMemo, useState, useCallback, useEffect } from "react";
import {
  SELF_BINDING_ID,
  type StandardRigInput,
  type RemapSettings,
} from "@vizij/utils";
import type {
  AnimatableBinding,
  BindingOperatorType,
} from "@vizij/node-graph-authoring";
import {
  bindingOperatorDefinitions,
  EXPRESSION_FUNCTION_VOCABULARY,
  RESERVED_EXPRESSION_VARIABLES,
} from "@vizij/node-graph-authoring";
import { REMAP_INPUT_FIELDS, REMAP_OUTPUT_FIELDS } from "./bindingFields";
import {
  FilterableSelect,
  type FilterableSelectOption,
} from "../common/FilterableSelect";
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
  onBindingOperatorToggle: (
    targetId: string,
    operator: BindingOperatorType,
    enabled: boolean,
  ) => void;
  onBindingOperatorParamChange: (
    targetId: string,
    operator: BindingOperatorType,
    paramId: string,
    value: number,
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
  onBindingOperatorToggle,
  onBindingOperatorParamChange,
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
  const operatorByType = useMemo(() => {
    const map = new Map<
      BindingOperatorType,
      NonNullable<AnimatableBinding["operators"]>[number]
    >();
    (binding.operators ?? []).forEach((operator) => {
      map.set(operator.type as BindingOperatorType, operator);
    });
    return map;
  }, [binding.operators]);

  const [manualAnchorSlots, setManualAnchorSlots] = useState<Set<string>>(() =>
    computeInitialManualAnchorSlots(slots),
  );
  const handleOperatorToggle = useCallback(
    (operator: BindingOperatorType, enabled: boolean) => {
      onBindingOperatorToggle(targetId, operator, enabled);
    },
    [onBindingOperatorToggle, targetId],
  );
  const handleOperatorParamChange = useCallback(
    (operator: BindingOperatorType, paramId: string, value: number) => {
      onBindingOperatorParamChange(targetId, operator, paramId, value);
    },
    [onBindingOperatorParamChange, targetId],
  );
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

  const functionHints = useMemo(() => {
    const maxEntries = 8;
    const entries = EXPRESSION_FUNCTION_VOCABULARY.slice(0, maxEntries)
      .map((entry) => `${entry.name}()`)
      .join(", ");
    if (!entries) {
      return "";
    }
    const suffix =
      EXPRESSION_FUNCTION_VOCABULARY.length > maxEntries ? ", …" : "";
    return `Functions: ${entries}${suffix}`;
  }, []);

  const reservedHints = useMemo(() => {
    const available = RESERVED_EXPRESSION_VARIABLES.filter(
      (variable) => variable.available !== false,
    )
      .map((variable) => variable.name)
      .join(", ");
    return available ? `Reserved: ${available}` : "";
  }, []);

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
            const rawSlotInputId = slot.inputId ?? "";
            const normalizedSlotInputId =
              rawSlotInputId === "" ? null : rawSlotInputId;
            const showAnchor = manualAnchorSlots.has(slot.id);

            const selectedInput =
              normalizedSlotInputId && normalizedSlotInputId !== SELF_BINDING_ID
                ? standardInputLookup.get(normalizedSlotInputId)
                : null;

            const currentLabel =
              normalizedSlotInputId === null
                ? "Unbound"
                : normalizedSlotInputId === SELF_BINDING_ID
                  ? "Slider (self)"
                  : selectedInput
                    ? selectedInput.path
                    : (standardInputLookup.get(normalizedSlotInputId)?.path ??
                      normalizedSlotInputId);

            const baseOptions: FilterableSelectOption[] = [
              {
                value: null,
                label: "Unbound",
                keywords: ["unbound", "none", "null"],
              },
              {
                value: SELF_BINDING_ID,
                label: "Slider (self)",
                keywords: ["self", "slider", "manual"],
              },
              ...standardInputs.map((input) => ({
                value: input.id,
                label: input.path,
                keywords: [input.path, input.id, input.label ?? ""].filter(
                  (entry) => entry.length > 0,
                ),
              })),
            ];

            const selectOptions =
              normalizedSlotInputId &&
              !baseOptions.some(
                (option) => option.value === normalizedSlotInputId,
              )
                ? [
                    ...baseOptions,
                    {
                      value: normalizedSlotInputId,
                      label: currentLabel,
                      keywords: [currentLabel],
                    },
                  ]
                : baseOptions;

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
                <div className="feature-tree__binding-slot-controls">
                  <span className="feature-tree__property-label">
                    Driver Binding:
                  </span>
                  <FilterableSelect
                    value={normalizedSlotInputId}
                    onChange={(nextValue) =>
                      onBindingInputChange(targetId, nextValue, slot.id)
                    }
                    options={selectOptions}
                    placeholder="Select binding input"
                    currentLabelOverride={currentLabel}
                    className="feature-tree__binding-slot-combobox"
                    triggerClassName="feature-tree__property-select"
                    menuClassName="feature-tree__binding-slot-menu"
                    listClassName="feature-tree__binding-slot-option-list"
                    filterInputClassName="feature-panel__input-text feature-tree__binding-slot-filter"
                    optionClassName="feature-tree__binding-slot-option"
                    optionHighlightClassName="feature-tree__binding-slot-option--highlighted"
                    emptyClassName="feature-tree__binding-slot-option feature-tree__binding-slot-option--empty"
                    dataOptionAttribute="data-option"
                  />
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() =>
                      onBindingInputChange(targetId, null, slot.id)
                    }
                    disabled={!normalizedSlotInputId}
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
          {functionHints && (
            <p className="feature-tree__expression-hints">{functionHints}</p>
          )}
          {reservedHints && (
            <p className="feature-tree__expression-hints">{reservedHints}</p>
          )}
          {issueList.length > 0 && (
            <ul className="feature-tree__expression-errors">
              {issueList.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="feature-tree__operators">
          <h4 className="feature-tree__section-title">Operators</h4>
          {bindingOperatorDefinitions.map((definition) => {
            const operator = operatorByType.get(definition.type);
            const enabled = operator?.enabled ?? false;
            return (
              <div key={definition.type} className="feature-tree__operator">
                <label className="feature-tree__operator-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      handleOperatorToggle(
                        definition.type,
                        event.target.checked,
                      )
                    }
                  />
                  <span>{definition.label}</span>
                </label>
                {definition.description && (
                  <p className="feature-tree__operator-description">
                    {definition.description}
                  </p>
                )}
                {enabled && definition.params.length > 0 && (
                  <div className="feature-tree__operator-params">
                    {definition.params.map((param) => {
                      const currentValue =
                        operator?.params?.[param.id] ?? param.defaultValue;
                      return (
                        <label
                          key={param.id}
                          className="feature-tree__operator-param"
                        >
                          <span>{param.label}</span>
                          <input
                            type="number"
                            value={currentValue}
                            min={param.min}
                            max={param.max ?? undefined}
                            step={0.01}
                            onChange={(event) =>
                              handleOperatorParamChange(
                                definition.type,
                                param.id,
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
}

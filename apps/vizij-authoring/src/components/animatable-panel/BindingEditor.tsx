import { useMemo, useState, useCallback } from "react";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
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
  onRequestCreateStandardInput,
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

  const applyOutputPreset = useCallback(
    (slotId: string, preset: RemapPreset) => {
      onBindingRemapChange(targetId, "outLow", preset.outLow, slotId);
      onBindingRemapChange(targetId, "outAnchor", preset.outAnchor, slotId);
      onBindingRemapChange(targetId, "outHigh", preset.outHigh, slotId);
    },
    [onBindingRemapChange, targetId],
  );

  const slots = binding.slots ?? [];
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
      <span className="feature-tree__property-label">{label}</span>
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
            return (
              <div key={slot.id} className="feature-tree__binding-slot">
                <div className="feature-tree__binding-slot-header">
                  <label>Input Alias</label>
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
                  Binding
                  <select
                    className="feature-tree__property-select"
                    value={slotInputId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      onBindingInputChange(
                        targetId,
                        nextValue.length > 0 ? nextValue : null,
                        slot.id,
                      );
                    }}
                  >
                    <option value="">Unbound</option>
                    <option value={SELF_BINDING_ID}>Slider (self)</option>
                    {standardInputs.map((input) => (
                      <option key={input.id} value={input.id}>
                        {input.path}
                      </option>
                    ))}
                  </select>
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
                  {onRequestCreateStandardInput && (
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
                      Create
                    </button>
                  )}
                </div>
                <div className="feature-tree__matrix-columns feature-tree__matrix-columns--slots">
                  <div className="feature-tree__property-column">
                    <h4>Input remap</h4>
                    <div className="feature-tree__matrix-grid">
                      {REMAP_INPUT_FIELDS.map(
                        ({ field, label: columnLabel }) => (
                          <label key={field}>
                            <span>{columnLabel}</span>
                            <input
                              type="number"
                              step={0.01}
                              value={slot.remap[field]}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (Number.isFinite(parsed)) {
                                  onBindingRemapChange(
                                    targetId,
                                    field,
                                    parsed,
                                    slot.id,
                                  );
                                }
                              }}
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="feature-tree__property-column">
                    <h4>Output remap</h4>
                    <div className="feature-tree__matrix-grid">
                      {REMAP_OUTPUT_FIELDS.map(
                        ({ field, label: columnLabel }) => (
                          <label key={field}>
                            <span>{columnLabel}</span>
                            <input
                              type="number"
                              step={0.01}
                              value={slot.remap[field]}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (Number.isFinite(parsed)) {
                                  onBindingRemapChange(
                                    targetId,
                                    field,
                                    parsed,
                                    slot.id,
                                  );
                                }
                              }}
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                </div>
                <div className="feature-tree__remap-presets">
                  <span className="feature-tree__remap-presets-label">
                    Set Remap:
                  </span>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() =>
                      applyOutputPreset(slot.id, {
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
                        applyOutputPreset(slot.id, animatablePreset);
                      }
                    }}
                    disabled={!animatablePreset}
                  >
                    Animatable
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => applyOutputPreset(slot.id, SCALE_PRESET)}
                  >
                    Scale
                  </button>
                  <button
                    type="button"
                    className="feature-panel__input-action feature-panel__input-action--secondary"
                    onClick={() => applyOutputPreset(slot.id, ROTATION_PRESET)}
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

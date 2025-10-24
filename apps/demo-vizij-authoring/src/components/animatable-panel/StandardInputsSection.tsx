import type { StandardRigInput } from "@vizij/utils";
import type { StandardInputValues } from "../../rig/state";

interface InputUsage {
  targetId: string;
  label: string;
}

interface StandardInputsSectionProps {
  faceId: string;
  onFaceIdChange: (value: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  standardInputs: StandardRigInput[];
  inputValues: StandardInputValues;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onEditInput: (input: StandardRigInput) => void;
  onClearInputMappings: (input: StandardRigInput) => void;
  onDeleteInput: (input: StandardRigInput) => void;
  onUnbindTarget: (targetId: string) => void;
}

export function StandardInputsSection({
  faceId,
  onFaceIdChange,
  isCollapsed,
  onToggleCollapsed,
  standardInputs,
  inputValues,
  effectiveInputRanges,
  inputUsage,
  onInputValueChange,
  onCreateInput,
  onEditInput,
  onClearInputMappings,
  onDeleteInput,
  onUnbindTarget,
}: StandardInputsSectionProps) {
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
          <div className="feature-panel__inputs">
            <div className="feature-panel__input-actions">
              <button
                type="button"
                onClick={onCreateInput}
                className="feature-panel__input-add"
              >
                Add standard input
              </button>
            </div>
            {standardInputs.map((input) => {
              const range = effectiveInputRanges.get(input.id) ?? input.range;
              const value = inputValues[input.id] ?? input.defaultValue;
              const step = Math.max((range.max - range.min) / 200, 0.001);
              const usage = inputUsage.get(input.id) ?? [];
              const hasMappings = usage.length > 0;
              return (
                <div key={input.id} className="feature-panel__input-row">
                  <div className="feature-panel__input-meta">
                    <div className="feature-panel__input-meta-header">
                      <strong>{input.label}</strong>
                      <div className="feature-panel__input-meta-actions">
                        <button
                          type="button"
                          className="feature-panel__input-action"
                          onClick={() => onEditInput(input)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="feature-panel__input-action feature-panel__input-action--secondary"
                          onClick={() => onClearInputMappings(input)}
                          disabled={!hasMappings}
                          title={
                            hasMappings ? undefined : "No mappings to clear yet"
                          }
                        >
                          Clear mappings
                        </button>
                      </div>
                    </div>
                    <span>{input.path}</span>
                  </div>
                  <input
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={step}
                    value={value}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (Number.isFinite(parsed)) {
                        onInputValueChange(input.id, parsed);
                      }
                    }}
                  />
                  <div className="feature-panel__input-number-wrapper">
                    <input
                      className="feature-panel__input-number"
                      type="number"
                      value={value}
                      min={range.min}
                      max={range.max}
                      step={step}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (Number.isFinite(parsed)) {
                          onInputValueChange(input.id, parsed);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="feature-panel__input-delete"
                      onClick={() => onDeleteInput(input)}
                      aria-label={`Delete ${input.label} input`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="feature-panel__input-tracker">
                    <span className="feature-panel__input-tracker-label">
                      Mapped to:
                    </span>
                    {hasMappings ? (
                      <ul className="feature-panel__input-tracker-list">
                        {usage.map(({ targetId, label }) => (
                          <li key={targetId}>
                            <button
                              type="button"
                              className="feature-panel__input-tracker-chip"
                              onClick={() => onUnbindTarget(targetId)}
                              title={`Remove mapping from ${label}`}
                            >
                              {label}
                              <span aria-hidden="true">×</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="feature-panel__input-tracker--unmapped">
                        Unmapped
                      </span>
                    )}
                  </div>
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
  );
}

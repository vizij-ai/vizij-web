import { useCallback, useMemo } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { ManagedStandardInput } from "../../hooks/useRigController";
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
  inputs: ManagedStandardInput[];
  roots: string[];
  selectedRoots: string[];
  onSelectedRootsChange: (next: string[]) => void;
  inputValues: StandardInputValues;
  effectiveInputRanges: Map<string, { min: number; max: number }>;
  inputUsage: Map<string, InputUsage[]>;
  onInputValueChange: (inputId: string, value: number) => void;
  onCreateInput: () => void;
  onUpdateInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  onClearInputMappings: (input: StandardRigInput) => void;
  onDeleteInput: (input: StandardRigInput) => void;
  onToggleInput: (path: string, enabled: boolean) => void;
  onUnbindTarget: (targetId: string) => void;
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
  roots,
  selectedRoots,
  onSelectedRootsChange,
  inputValues,
  effectiveInputRanges,
  inputUsage,
  onInputValueChange,
  onCreateInput,
  onUpdateInput,
  onClearInputMappings,
  onDeleteInput,
  onToggleInput,
  onUnbindTarget,
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

  const selectedSet = useMemo(
    () => new Set<string>(selectedRoots),
    [selectedRoots],
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
          {(roots.length > 0 ||
            inputs.some((entry) => entry.source === "custom")) && (
            <div className="feature-panel__input-toolbar">
              {roots.length > 0 && (
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
                    {roots.map((root) => (
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
                const isAuto = source === "auto";
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
                            {usage.map(({ targetId, label }) => (
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
                            ))}
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
                          disabled={usage.length === 0}
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
                          disabled={disabled}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (Number.isFinite(parsed)) {
                              onInputValueChange(input.id, parsed);
                            }
                          }}
                        />
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

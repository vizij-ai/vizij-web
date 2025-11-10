import { ChangeEvent, useId, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, StandardInputId } from "../types";
import { FilterableSelect } from "../../components/common/FilterableSelect";
import { formatRigPathLabel } from "../../utils/rigPaths";

interface PoseEditorProps {
  pose: PoseDefinition | null;
  neutralValues: Record<StandardInputId, number>;
  currentValues: Record<StandardInputId, number>;
  inputs: StandardRigInput[];
  faceId?: string | null;
  disabled?: boolean;
  onRename: (name: string) => void;
  onCapture: () => void;
  onClear: () => void;
  onLiveValueChange: (inputId: string, value: number) => void;
  onRemoveInput: (inputId: string) => void;
  onAddInput: (inputId: string) => void;
  hasLiveAdjustments?: boolean;
}

const LIVE_EPSILON = 1e-6;

function formatGroupName(group: string | null | undefined): string {
  const segments = (group ?? "")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    )
    .filter(Boolean);
  if (segments.length === 0) {
    return "Root";
  }
  return segments.join(" / ");
}

function resolveRange(input: StandardRigInput): { min: number; max: number } {
  const defaultValue = input.defaultValue ?? 0;
  const min = Number.isFinite(input.range.min)
    ? input.range.min
    : defaultValue - 1;
  const max = Number.isFinite(input.range.max)
    ? input.range.max
    : defaultValue + 1;
  if (min === max) {
    return { min: defaultValue - 1, max: defaultValue + 1 };
  }
  return { min, max };
}

function computeStep(input: StandardRigInput): number {
  const { min, max } = resolveRange(input);
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span === 0) {
    return 0.01;
  }
  return span / 200;
}

export function PoseEditor({
  pose,
  neutralValues,
  currentValues,
  inputs,
  faceId,
  disabled,
  onRename,
  onCapture,
  onClear,
  onLiveValueChange,
  onRemoveInput,
  onAddInput,
  hasLiveAdjustments,
}: PoseEditorProps) {
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const controlsId = useId();

  const inputsById = useMemo(() => {
    return new Map(inputs.map((input) => [input.id, input]));
  }, [inputs]);

  const availableInputs = useMemo(() => {
    if (!pose) {
      return [];
    }
    return inputs.filter((input) => !(input.id in pose.values));
  }, [inputs, pose]);

  const availableInputOptions = useMemo(() => {
    return availableInputs.map((input) => ({
      value: input.id,
      label: input.label ?? input.path ?? input.id,
      keywords: [
        input.label ?? "",
        input.id,
        input.group ?? "",
        input.path ?? "",
      ].filter((entry) => entry.length > 0),
    }));
  }, [availableInputs]);

  const groupedEntries = useMemo(() => {
    if (!pose) {
      return new Map<string, Array<[StandardRigInput, number]>>();
    }
    const byGroup = new Map<string, Array<[StandardRigInput, number]>>();
    Object.entries(pose.values).forEach(([inputId, value]) => {
      const input = inputsById.get(inputId);
      if (!input) {
        return;
      }
      const key = input.group ?? "root";
      const list = byGroup.get(key) ?? [];
      list.push([input, value]);
      byGroup.set(key, list);
    });
    return byGroup;
  }, [inputsById, pose]);

  const handleValueChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: string,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onLiveValueChange(inputId, next);
    }
  };

  const handleAddInput = () => {
    if (!pendingInput) {
      return;
    }
    onAddInput(pendingInput);
    setPendingInput(null);
  };

  if (!pose) {
    return (
      <section className="pose-rig-panel pose-rig-panel--editor">
        <header className="pose-rig-panel__header">
          <div>
            <h3 className="pose-rig-panel__title">Pose Editor</h3>
          </div>
          <button
            type="button"
            className="pose-rig-panel__toggle feature-panel__section-toggle"
            aria-expanded={false}
            aria-controls={controlsId}
            disabled
            title="Toggle pose controls"
          >
            Toggle pose controls
          </button>
        </header>
        <div className="pose-rig-editor" id={controlsId}>
          <p className="pose-rig-empty">
            Select a saved pose to edit stored values.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pose-rig-panel pose-rig-panel--editor">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Editor</h3>
          <p className="pose-rig-panel__subtitle">
            Overwrite from the live rig or tweak channels manually (tweaked
            values are saved automatically).
          </p>
        </div>
        <button
          type="button"
          className="pose-rig-panel__toggle feature-panel__section-toggle"
          aria-expanded={!controlsCollapsed}
          aria-controls={controlsId}
          onClick={() => setControlsCollapsed((value) => !value)}
          title={
            controlsCollapsed
              ? "Expand pose controls"
              : "Collapse pose controls"
          }
        >
          Toggle pose controls
        </button>
      </header>
      <div
        className="pose-rig-editor pose-rig-editor--form"
        id={controlsId}
        hidden={controlsCollapsed}
        aria-hidden={controlsCollapsed}
      >
        <label className="field-label" htmlFor="pose-rig-name">
          Name
        </label>
        <input
          id="pose-rig-name"
          className="input"
          type="text"
          value={pose.name}
          disabled={disabled}
          onChange={(event) => onRename(event.target.value)}
        />

        <div className="pose-rig-button-row">
          <button
            type="button"
            className={
              hasLiveAdjustments
                ? "button primary pose-rig-button--overwrite-active"
                : "button primary"
            }
            onClick={onCapture}
            disabled={disabled}
          >
            Overwrite Saved Pose
          </button>
          <button
            type="button"
            className="button subtle"
            onClick={onClear}
            disabled={disabled}
          >
            Clear Values
          </button>
        </div>

        <div className="pose-rig-add-input">
          <FilterableSelect
            value={pendingInput}
            onChange={(nextValue) => setPendingInput(nextValue)}
            options={availableInputOptions}
            placeholder="Select rig input…"
            searchPlaceholder="Search inputs"
            noResultsLabel="No matches"
            disabled={disabled}
            className="pose-rig-input-select feature-tree__binding-slot-combobox"
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
            className="button"
            onClick={handleAddInput}
            disabled={disabled || !pendingInput}
          >
            Add
          </button>
        </div>

        {hasLiveAdjustments && (
          <p className="pose-rig-live-hint">
            Live slider tweaks are applied immediately but not saved. Overwrite
            the pose to persist them.
          </p>
        )}

        {groupedEntries.size === 0 ? (
          <p className="pose-rig-empty">
            No overrides saved yet. Overwrite from the current pose or add
            inputs manually.
          </p>
        ) : (
          Array.from(groupedEntries.entries()).map(([group, entries]) => (
            <section key={group} className="pose-rig-input-group">
              <header className="pose-rig-input-group__header">
                <h4>{formatGroupName(group)}</h4>
              </header>
              <ul className="pose-rig-input-list">
                {entries.map(([input, value]) => {
                  const range = resolveRange(input);
                  const step = computeStep(input);
                  const neutral =
                    neutralValues[input.id] ?? input.defaultValue ?? 0;
                  const saved = value ?? neutral;
                  const liveValue = currentValues[input.id] ?? saved ?? neutral;
                  const isDirty = Math.abs(liveValue - saved) > LIVE_EPSILON;
                  const formattedPath = formatRigPathLabel(input.path, faceId);
                  return (
                    <li
                      key={input.id}
                      className={
                        isDirty
                          ? "pose-rig-input-row pose-rig-input-row--dirty"
                          : "pose-rig-input-row"
                      }
                    >
                      <div className="pose-rig-input-meta">
                        <div className="pose-rig-input-meta-info">
                          <span className="pose-rig-input-label">
                            {input.label}
                          </span>
                          <span className="pose-rig-input-path">
                            Path: {formattedPath}
                          </span>
                        </div>
                        <span className="pose-rig-input-neutral">
                          Neutral {neutral.toFixed(3)}
                        </span>
                      </div>
                      <div className="pose-rig-input-controls">
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={step}
                          value={liveValue}
                          disabled={disabled}
                          onChange={(event) =>
                            handleValueChange(event, input.id)
                          }
                        />
                        <input
                          type="number"
                          className="input numeric"
                          step={step}
                          value={liveValue}
                          disabled={disabled}
                          onChange={(event) =>
                            handleValueChange(event, input.id)
                          }
                        />
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() => onRemoveInput(input.id)}
                          disabled={disabled}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

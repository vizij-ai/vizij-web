import { ChangeEvent, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, StandardInputId } from "../types";

interface PoseEditorProps {
  pose: PoseDefinition | null;
  neutralValues: Record<StandardInputId, number>;
  inputs: StandardRigInput[];
  disabled?: boolean;
  onRename: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onCapture: () => void;
  onClear: () => void;
  onValueChange: (inputId: string, value: number) => void;
  onRemoveInput: (inputId: string) => void;
  onAddInput: (inputId: string) => void;
}

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
  inputs,
  disabled,
  onRename,
  onDescriptionChange,
  onCapture,
  onClear,
  onValueChange,
  onRemoveInput,
  onAddInput,
}: PoseEditorProps) {
  const [pendingInput, setPendingInput] = useState<string>("");

  const inputsById = useMemo(() => {
    return new Map(inputs.map((input) => [input.id, input]));
  }, [inputs]);

  const availableInputs = useMemo(() => {
    if (!pose) {
      return [];
    }
    return inputs.filter((input) => !(input.id in pose.values));
  }, [inputs, pose]);

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
      onValueChange(inputId, next);
    }
  };

  const handleAddInput = () => {
    if (!pendingInput) {
      return;
    }
    onAddInput(pendingInput);
    setPendingInput("");
  };

  if (!pose) {
    return (
      <section className="pose-rig-panel pose-rig-panel--editor">
        <header className="pose-rig-panel__header">
          <h3 className="pose-rig-panel__title">Pose Details</h3>
        </header>
        <div className="pose-rig-editor">
          <p className="pose-rig-empty">
            Select a saved pose to edit captured values.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pose-rig-panel pose-rig-panel--editor">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Pose Details</h3>
          <p className="pose-rig-panel__subtitle">
            Capture from the live rig or tweak channels manually.
          </p>
        </div>
      </header>
      <div className="pose-rig-editor pose-rig-editor--form">
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

        <label className="field-label" htmlFor="pose-rig-description">
          Notes
        </label>
        <textarea
          id="pose-rig-description"
          className="textarea"
          rows={3}
          value={pose.description ?? ""}
          disabled={disabled}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />

        <div className="pose-rig-button-row">
          <button
            type="button"
            className="button primary"
            onClick={onCapture}
            disabled={disabled}
          >
            Capture Current Pose
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
          <select
            className="select"
            value={pendingInput}
            disabled={disabled}
            onChange={(event) => setPendingInput(event.target.value)}
          >
            <option value="">Add rig input…</option>
            {availableInputs.map((input) => (
              <option key={input.id} value={input.id}>
                {input.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            onClick={handleAddInput}
            disabled={disabled || !pendingInput}
          >
            Add
          </button>
        </div>

        {groupedEntries.size === 0 ? (
          <p className="pose-rig-empty">
            No overrides captured yet. Capture from the current pose or add
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
                  return (
                    <li key={input.id} className="pose-rig-input-row">
                      <div className="pose-rig-input-meta">
                        <span className="pose-rig-input-label">
                          {input.label}
                        </span>
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
                          value={value}
                          disabled={disabled}
                          onChange={(event) =>
                            handleValueChange(event, input.id)
                          }
                        />
                        <input
                          type="number"
                          className="input numeric"
                          step={step}
                          value={value}
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

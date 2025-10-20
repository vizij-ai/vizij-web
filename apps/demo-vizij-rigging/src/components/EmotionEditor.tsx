import { ChangeEvent, useMemo, useState } from "react";
import type { StandardRigInput } from "../low-level/standardRigInputs";
import type { EmotionDefinition } from "../rigging/types";

interface EmotionEditorProps {
  emotion: EmotionDefinition | null;
  neutralInputs: Record<string, number>;
  inputs: StandardRigInput[];
  onRename: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onCapture: () => void;
  onClear: () => void;
  onInputValueChange: (inputId: string, value: number) => void;
  onRemoveInput: (inputId: string) => void;
  onAddInput: (inputId: string) => void;
}

function formatGroupName(group: string): string {
  return group.replace(/_/g, " ");
}

export function EmotionEditor({
  emotion,
  neutralInputs,
  inputs,
  onRename,
  onDescriptionChange,
  onCapture,
  onClear,
  onInputValueChange,
  onRemoveInput,
  onAddInput,
}: EmotionEditorProps) {
  const [pendingInput, setPendingInput] = useState<string>("");

  const inputsById = useMemo(() => {
    const map = new Map<string, StandardRigInput>();
    inputs.forEach((input) => map.set(input.id, input));
    return map;
  }, [inputs]);

  const availableInputs = useMemo(() => {
    if (!emotion) {
      return [];
    }
    return inputs.filter((input) => !(input.id in emotion.values));
  }, [emotion, inputs]);

  const handleValueChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: string,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onInputValueChange(inputId, next);
    }
  };

  const handleAddInput = () => {
    if (!pendingInput) {
      return;
    }
    onAddInput(pendingInput);
    setPendingInput("");
  };

  const groupedEntries = useMemo(() => {
    if (!emotion) {
      return new Map<string, Array<[StandardRigInput, number]>>();
    }
    const entries = Object.entries(emotion.values);
    const byGroup = new Map<string, Array<[StandardRigInput, number]>>();
    entries.forEach(([inputId, value]) => {
      const input = inputsById.get(inputId);
      if (!input) {
        return;
      }
      const list = byGroup.get(input.group) ?? [];
      list.push([input, value]);
      byGroup.set(input.group, list);
    });
    return byGroup;
  }, [emotion, inputsById]);

  if (!emotion) {
    return (
      <div className="panel emotion-editor-panel">
        <div className="panel-header">
          <h2>Pose Details</h2>
        </div>
        <div className="panel-body">
          <p className="panel-placeholder">
            Select a pose to edit its configuration.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel emotion-editor-panel">
      <div className="panel-header">
        <h2>Pose Details</h2>
      </div>
      <div className="panel-body emotion-editor-body">
        <label className="field-label" htmlFor="pose-name">
          Name
        </label>
        <input
          id="pose-name"
          className="input"
          type="text"
          value={emotion.name}
          onChange={(event) => onRename(event.target.value)}
        />

        <label className="field-label" htmlFor="pose-description">
          Notes
        </label>
        <textarea
          id="pose-description"
          className="textarea"
          value={emotion.description ?? ""}
          onChange={(event) => onDescriptionChange(event.target.value)}
          rows={3}
        />

        <div className="button-row">
          <button type="button" className="button primary" onClick={onCapture}>
            Capture current pose
          </button>
          <button type="button" className="button subtle" onClick={onClear}>
            Clear values
          </button>
        </div>

        <div className="add-input-row">
          <select
            className="select"
            value={pendingInput}
            onChange={(event) => setPendingInput(event.target.value)}
          >
            <option value="">Add low-level input…</option>
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
            disabled={!pendingInput}
          >
            Add
          </button>
        </div>

        {groupedEntries.size === 0 ? (
          <p className="panel-placeholder">
            No overrides captured yet. Capture from the current pose or add
            inputs manually.
          </p>
        ) : (
          Array.from(groupedEntries.entries()).map(([group, entries]) => (
            <section key={group} className="emotion-input-group">
              <header className="emotion-input-group-header">
                <h3>{formatGroupName(group)}</h3>
              </header>
              <ul className="emotion-input-list">
                {entries.map(([input, value]) => {
                  const neutral = neutralInputs[input.id] ?? input.defaultValue;
                  return (
                    <li key={input.id} className="emotion-input-row">
                      <div className="emotion-input-meta">
                        <span className="emotion-input-label">
                          {input.label}
                        </span>
                        <span className="emotion-input-neutral">
                          Neutral {neutral.toFixed(3)}
                        </span>
                      </div>
                      <div className="emotion-input-controls">
                        <input
                          type="range"
                          min={input.range.min}
                          max={input.range.max}
                          step={(input.range.max - input.range.min) / 200}
                          value={value}
                          onChange={(event) =>
                            handleValueChange(event, input.id)
                          }
                        />
                        <input
                          type="number"
                          className="input numeric"
                          step={(input.range.max - input.range.min) / 200}
                          value={value}
                          onChange={(event) =>
                            handleValueChange(event, input.id)
                          }
                        />
                        <button
                          type="button"
                          className="button subtle"
                          onClick={() => onRemoveInput(input.id)}
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
    </div>
  );
}

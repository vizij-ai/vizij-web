import { ChangeEvent, useMemo } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { StandardInputId } from "../types";

interface NeutralEditorProps {
  inputs: StandardRigInput[];
  values: Record<StandardInputId, number>;
  onValueChange: (inputId: StandardInputId, value: number) => void;
  disabled?: boolean;
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

export function NeutralEditor({
  inputs,
  values,
  onValueChange,
  disabled,
}: NeutralEditorProps) {
  const groupedInputs = useMemo(() => {
    const grouped = new Map<string, StandardRigInput[]>();
    inputs.forEach((input) => {
      const key = input.group ?? "root";
      const list = grouped.get(key) ?? [];
      list.push(input);
      grouped.set(key, list);
    });
    return grouped;
  }, [inputs]);

  const handleSliderChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: StandardInputId,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onValueChange(inputId, next);
    }
  };

  const handleNumberChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: StandardInputId,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onValueChange(inputId, next);
    }
  };

  return (
    <section className="pose-rig-panel pose-rig-panel--editor">
      <header className="pose-rig-panel__header">
        <div>
          <h3 className="pose-rig-panel__title">Neutral Pose</h3>
          <p className="pose-rig-panel__subtitle">
            Adjust the live rig values that serve as your baseline.
          </p>
        </div>
      </header>
      <div className="pose-rig-editor">
        {groupedInputs.size === 0 ? (
          <p className="pose-rig-empty">
            No standard inputs detected. Load a rig and refresh bindings to
            begin editing.
          </p>
        ) : (
          Array.from(groupedInputs.entries()).map(([group, entries]) => (
            <section key={group} className="pose-rig-input-group">
              <header className="pose-rig-input-group__header">
                <h4>{formatGroupName(group)}</h4>
              </header>
              <ul className="pose-rig-input-list">
                {entries.map((input) => {
                  const value = values[input.id] ?? input.defaultValue ?? 0;
                  const range = resolveRange(input);
                  const step = computeStep(input);
                  return (
                    <li key={input.id} className="pose-rig-input-row">
                      <div className="pose-rig-input-meta">
                        <span className="pose-rig-input-label">
                          {input.label}
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
                            handleSliderChange(event, input.id)
                          }
                        />
                        <input
                          type="number"
                          className="input numeric"
                          step={step}
                          value={value}
                          disabled={disabled}
                          onChange={(event) =>
                            handleNumberChange(event, input.id)
                          }
                        />
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

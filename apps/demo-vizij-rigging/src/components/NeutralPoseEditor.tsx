import { ChangeEvent, useMemo } from "react";
import type { StandardRigInput } from "../low-level/standardRigInputs";
import type { StandardInputId } from "../rigging/types";

interface NeutralPoseEditorProps {
  inputs: StandardRigInput[];
  neutralInputs: Record<StandardInputId, number>;
  onChange: (inputId: StandardInputId, value: number) => void;
}

function formatGroupName(group: string): string {
  const segments = group
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    );
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
  const range = resolveRange(input);
  const span = Math.abs(range.max - range.min);
  if (!Number.isFinite(span) || span === 0) {
    return 0.01;
  }
  return span / 200;
}

export function NeutralPoseEditor({
  inputs,
  neutralInputs,
  onChange,
}: NeutralPoseEditorProps) {
  const groupedInputs = useMemo(() => {
    const grouped = new Map<string, StandardRigInput[]>();
    inputs.forEach((input) => {
      const list = grouped.get(input.group) ?? [];
      list.push(input);
      grouped.set(input.group, list);
    });
    return grouped;
  }, [inputs]);

  const handleSliderChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: StandardInputId,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onChange(inputId, next);
    }
  };

  const handleNumberChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: StandardInputId,
  ) => {
    const next = Number.parseFloat(event.target.value);
    if (Number.isFinite(next)) {
      onChange(inputId, next);
    }
  };

  return (
    <div className="panel emotion-editor-panel">
      <div className="panel-header">
        <h2>Neutral Pose</h2>
      </div>
      <div className="panel-body emotion-editor-body">
        {groupedInputs.size === 0 ? (
          <p className="panel-placeholder">
            No standard inputs detected. Load a low-level rig to begin.
          </p>
        ) : (
          Array.from(groupedInputs.entries()).map(([group, entries]) => (
            <section key={group} className="emotion-input-group">
              <header className="emotion-input-group-header">
                <h3>{formatGroupName(group)}</h3>
              </header>
              <ul className="emotion-input-list">
                {entries.map((input) => {
                  const value = neutralInputs[input.id] ?? 0;
                  const step = computeStep(input);
                  const range = resolveRange(input);
                  return (
                    <li key={input.id} className="emotion-input-row">
                      <div className="emotion-input-meta">
                        <span className="emotion-input-label">
                          {input.label}
                        </span>
                      </div>
                      <div className="emotion-input-controls">
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={step}
                          value={value}
                          onChange={(event) =>
                            handleSliderChange(event, input.id)
                          }
                        />
                        <input
                          type="number"
                          className="input numeric"
                          step={step}
                          value={value}
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
    </div>
  );
}

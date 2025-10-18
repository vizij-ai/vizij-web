import { ChangeEvent } from "react";
import type { StandardRigInput } from "../low-level/standardRigInputs";
import type { StandardInputId } from "../rigging/types";

interface LowLevelInputsPanelProps {
  inputs: StandardRigInput[];
  neutralValues: Record<StandardInputId, number>;
  appliedValues: Record<StandardInputId, number>;
  bindingsCount: Map<StandardInputId, number>;
  onChange: (inputId: StandardInputId, value: number) => void;
  disabled?: boolean;
}

function formatGroupName(group: StandardRigInput["group"]): string {
  return group.replace(/_/g, " ");
}

function computeStep(input: StandardRigInput): number {
  const span = Math.abs(input.range.max - input.range.min);
  if (span === 0) {
    return 0.01;
  }
  return span / 200;
}

export function LowLevelInputsPanel({
  inputs,
  neutralValues,
  appliedValues,
  bindingsCount,
  onChange,
  disabled,
}: LowLevelInputsPanelProps) {
  const grouped = new Map<StandardRigInput["group"], StandardRigInput[]>();
  inputs.forEach((input) => {
    const list = grouped.get(input.group) ?? [];
    list.push(input);
    grouped.set(input.group, list);
  });

  const handleSliderChange = (
    event: ChangeEvent<HTMLInputElement>,
    inputId: StandardInputId,
  ) => {
    const nextValue = Number.parseFloat(event.target.value);
    onChange(inputId, Number.isFinite(nextValue) ? nextValue : 0);
  };

  return (
    <div className="panel inputs-panel">
      <div className="panel-header">
        <h2>2 · Low-level Inputs</h2>
        <span className="panel-subtitle">
          Adjust base rig values (neutral pose)
        </span>
      </div>
      <div className="panel-body inputs-body">
        {Array.from(grouped.entries()).map(([group, groupInputs]) => (
          <section key={group} className="inputs-group">
            <header className="inputs-group-header">
              <h3>{formatGroupName(group)}</h3>
            </header>
            <ul className="inputs-list">
              {groupInputs.map((input) => {
                const neutral = neutralValues[input.id] ?? input.defaultValue;
                const applied = appliedValues[input.id] ?? neutral;
                const bindingCount = bindingsCount.get(input.id) ?? 0;
                return (
                  <li key={input.id} className="inputs-row">
                    <div className="inputs-metadata">
                      <span className="inputs-label">{input.label}</span>
                      <span className="inputs-binding">
                        {bindingCount > 0
                          ? `${bindingCount} binding${bindingCount > 1 ? "s" : ""}`
                          : "Unbound"}
                      </span>
                    </div>
                    <div className="inputs-slider">
                      <input
                        type="range"
                        min={input.range.min}
                        max={input.range.max}
                        step={computeStep(input)}
                        value={neutral}
                        disabled={disabled}
                        onChange={(event) =>
                          handleSliderChange(event, input.id)
                        }
                      />
                      <div className="inputs-values">
                        <span className="inputs-value">
                          Neutral: {neutral.toFixed(3)}
                        </span>
                        <span className="inputs-value">
                          Active: {applied.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

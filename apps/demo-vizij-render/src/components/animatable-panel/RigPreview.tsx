import type { StandardRigInput } from "../../rig/standardRigInputs";
import type { StandardInputValues } from "../../rig/state";
import type { BindingTarget } from "./types";

interface RigPreviewProps {
  targets: BindingTarget[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputValues: StandardInputValues;
  inputRanges: Map<string, { min: number; max: number }>;
  onInputValueChange: (inputId: string, value: number) => void;
}

export function RigPreview({
  targets,
  standardInputLookup,
  inputValues,
  inputRanges,
  onInputValueChange,
}: RigPreviewProps) {
  const uniqueInputs = new Map<
    string,
    {
      input: StandardRigInput;
      value: number;
    }
  >();

  targets.forEach((target) => {
    const inputId = target.binding?.inputId;
    if (!inputId) {
      return;
    }
    if (uniqueInputs.has(inputId)) {
      return;
    }
    const inputMeta = standardInputLookup.get(inputId);
    if (!inputMeta) {
      return;
    }
    const value = inputValues[inputId] ?? inputMeta.defaultValue;
    uniqueInputs.set(inputId, {
      input: inputMeta,
      value,
    });
  });

  if (uniqueInputs.size === 0) {
    return null;
  }

  return (
    <div className="feature-row__rig-preview">
      <div className="feature-row__rig-preview-inputs">
        {Array.from(uniqueInputs.entries()).map(([inputId, entry]) => {
          const range = inputRanges.get(inputId) ?? entry.input.range;
          const step = Math.max((range.max - range.min) / 200, 0.001);
          return (
            <div
              key={inputId}
              className="feature-panel__input-row feature-row__rig-preview-row"
            >
              <div className="feature-panel__input-meta">
                <strong>{entry.input.label}</strong>
                <span>{entry.input.path}</span>
              </div>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={step}
                value={entry.value}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (Number.isFinite(parsed)) {
                    onInputValueChange(inputId, parsed);
                  }
                }}
              />
              <div className="feature-panel__input-number-wrapper">
                <input
                  className="feature-panel__input-number"
                  type="number"
                  min={range.min}
                  max={range.max}
                  step={step}
                  value={entry.value}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      onInputValueChange(inputId, parsed);
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

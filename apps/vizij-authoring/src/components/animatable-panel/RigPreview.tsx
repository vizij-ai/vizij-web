import type { StandardRigInput } from "@vizij/utils";
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
      aliases: { target: string; alias: string }[];
    }
  >();

  targets.forEach((target) => {
    const slots = target.binding?.slots ?? [];
    slots.forEach((slot) => {
      const inputId = slot.inputId;
      if (!inputId) {
        return;
      }
      const inputMeta = standardInputLookup.get(inputId);
      if (!inputMeta) {
        return;
      }
      const value = inputValues[inputId] ?? inputMeta.defaultValue;
      const aliasEntry = {
        target: target.label,
        alias: slot.alias,
      };
      const existing = uniqueInputs.get(inputId);
      if (existing) {
        existing.value = value;
        if (
          !existing.aliases.some(
            (entry) =>
              entry.alias === slot.alias && entry.target === target.label,
          )
        ) {
          existing.aliases.push(aliasEntry);
        }
      } else {
        uniqueInputs.set(inputId, {
          input: inputMeta,
          value,
          aliases: [aliasEntry],
        });
      }
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
                <strong>{entry.input.path}</strong>
                {entry.aliases.length > 0 && (
                  <ul className="feature-row__rig-preview-aliases">
                    {entry.aliases.map(({ target, alias }) => (
                      <li key={`${target}-${alias}`}>
                        <span className="feature-row__rig-preview-alias">
                          {alias}
                        </span>
                        <span className="feature-row__rig-preview-target">
                          {target}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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

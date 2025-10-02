import { useEffect, useState } from "react";
import type { ValueKind } from "../types";
import { defaultValueForKind } from "../utils/valueHelpers";

interface ValueFieldProps {
  kind: ValueKind;
  value: any;
  onChange: (value: any) => void;
  allowDynamicLength?: boolean;
}

type ClampOptions = {
  positiveOnly?: boolean;
  unitRange?: boolean;
};

const VECTOR_KEYS = {
  vec2: ["x", "y"],
  vec3: ["x", "y", "z"],
  vec4: ["x", "y", "z", "w"],
  quat: ["x", "y", "z", "w"],
} as const;

function clampRange(value: number, options?: ClampOptions): [number, number] {
  const numeric = Number.isFinite(value) ? value : 0;
  if (options?.positiveOnly) {
    if (options.unitRange && numeric >= 0 && numeric <= 1) {
      return [0, 1];
    }
    const base = Math.max(Math.abs(numeric), 1);
    const upper = Math.max(2, Math.ceil(base * 1.5));
    return [0, upper];
  }
  const magnitude = Math.max(1, Math.abs(numeric));
  const upper = Math.max(2, Math.ceil(magnitude * 2));
  return [-upper, upper];
}

type SliderOptions = {
  positiveOnly?: boolean;
  unitRange?: boolean;
  step?: number;
  initialBounds?: [number, number];
};

function SliderWithBounds({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (next: number) => void;
  options?: SliderOptions;
}) {
  const numeric = Number.isFinite(value) ? value : 0;
  const step = options?.step ?? 0.01;
  const [{ min, max }, setBounds] = useState(() => {
    if (options?.initialBounds) {
      const [initialMin, initialMax] = options.initialBounds;
      return { min: initialMin, max: initialMax };
    }
    const [initialMin, initialMax] = clampRange(numeric, {
      positiveOnly: options?.positiveOnly,
      unitRange: options?.unitRange,
    });
    return { min: initialMin, max: initialMax };
  });

  const sliderMin = Math.min(min, max);
  const sliderMax = Math.max(min, max);

  const clampValue = (next: number) => {
    if (!Number.isFinite(next)) {
      return sliderMin;
    }
    return Math.min(sliderMax, Math.max(sliderMin, next));
  };

  const displayValue = clampValue(numeric);

  useEffect(() => {
    if (numeric !== displayValue) {
      onChange(displayValue);
    }
  }, [displayValue, numeric, onChange]);

  const handleMinChange = (next: number) => {
    if (!Number.isFinite(next)) {
      return;
    }
    setBounds((current) => {
      const adjustedMax = Math.max(next, current.max);
      return { min: next, max: adjustedMax };
    });
    if (displayValue < next) {
      onChange(next);
    }
  };

  const handleMaxChange = (next: number) => {
    if (!Number.isFinite(next)) {
      return;
    }
    setBounds((current) => {
      const adjustedMin = Math.min(current.min, next);
      return { min: adjustedMin, max: next };
    });
    if (displayValue > next) {
      onChange(next);
    }
  };

  return (
    <div className="slider-field">
      <input
        type="number"
        className="slider-bound"
        value={min}
        step={step}
        onChange={(event) => handleMinChange(Number(event.target.value))}
        aria-label="Minimum"
      />
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={displayValue}
        title={displayValue.toFixed(2)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        className="slider-bound"
        value={max}
        step={step}
        onChange={(event) => handleMaxChange(Number(event.target.value))}
        aria-label="Maximum"
      />
    </div>
  );
}

export function ValueField({
  kind,
  value,
  onChange,
  allowDynamicLength,
}: ValueFieldProps) {
  switch (kind) {
    case "float": {
      const numeric = Number(value ?? 0);
      const unitRange = numeric > 0 && numeric <= 1;
      return (
        <SliderWithBounds
          value={numeric}
          onChange={onChange}
          options={{
            positiveOnly: unitRange,
            unitRange,
          }}
        />
      );
    }
    case "bool":
      return (
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{Boolean(value) ? "True" : "False"}</span>
        </label>
      );
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat": {
      const keys = VECTOR_KEYS[kind];
      const state = value ?? defaultValueForKind(kind);
      return (
        <div className="vector-input">
          {keys.map((key) => {
            const component = Number(state?.[key] ?? 0);
            return (
              <div key={key} className="vector-column">
                <span>{key.toUpperCase()}</span>
                <SliderWithBounds
                  value={component}
                  onChange={(next) =>
                    onChange({
                      ...state,
                      [key]: next,
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      );
    }
    case "color": {
      const state = value ?? defaultValueForKind(kind);
      return (
        <div className="vector-input">
          {(["r", "g", "b", "a"] as const).map((key) => {
            const component = Number(state?.[key] ?? (key === "a" ? 1 : 1));
            return (
              <div key={key} className="vector-column">
                <span>{key.toUpperCase()}</span>
                <SliderWithBounds
                  value={component}
                  onChange={(next) =>
                    onChange({
                      ...state,
                      [key]: next,
                    })
                  }
                  options={{
                    initialBounds: [0, 1],
                    step: 0.01,
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    }
    case "vector": {
      const arr = Array.isArray(value) ? value : defaultValueForKind(kind);
      return (
        <div className="vector-list">
          {arr.map((entry: number, index: number) => {
            const component = Number(entry ?? 0);
            return (
              <div key={index} className="vector-column">
                <span>{index}</span>
                <SliderWithBounds
                  value={component}
                  onChange={(nextValue) => {
                    const next = [...arr];
                    next[index] = nextValue;
                    onChange(next);
                  }}
                />
              </div>
            );
          })}
          {allowDynamicLength ? (
            <div className="vector-actions">
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => onChange([...arr, 0])}
              >
                Add element
              </button>
              {arr.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-muted"
                  onClick={() => onChange(arr.slice(0, -1))}
                >
                  Remove last
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }
    case "transform": {
      const state = value ?? defaultValueForKind(kind);
      return (
        <div className="transform-editor">
          {(
            [
              ["position", "Position"],
              ["rotation", "Rotation"],
              ["scale", "Scale"],
            ] as const
          ).map(([key, label]) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              <div className="vector-input">
                {(["x", "y", "z"] as const).map((axis) => {
                  const fallback = key === "scale" ? 1 : 0;
                  const component = Number(state?.[key]?.[axis] ?? fallback);
                  return (
                    <div key={axis} className="vector-column">
                      <span>{axis.toUpperCase()}</span>
                      <SliderWithBounds
                        value={component}
                        onChange={(next) =>
                          onChange({
                            ...state,
                            [key]: {
                              ...(state?.[key] ?? {}),
                              [axis]: next,
                            },
                          })
                        }
                        options={{
                          positiveOnly: key === "scale",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      );
    }
    case "custom":
    default:
      return (
        <textarea
          value={
            typeof value === "string"
              ? value
              : JSON.stringify(value ?? {}, null, 2)
          }
          onChange={(event) => onChange(event.target.value)}
          rows={6}
        />
      );
  }
}

import { Fragment } from "react";
import type { ValueKind } from "../types";
import { defaultValueForKind } from "../utils/valueHelpers";

interface ValueFieldProps {
  kind: ValueKind;
  value: any;
  onChange: (value: any) => void;
  allowDynamicLength?: boolean;
}

export function ValueField({
  kind,
  value,
  onChange,
  allowDynamicLength,
}: ValueFieldProps) {
  switch (kind) {
    case "float":
      return (
        <input
          type="number"
          step={0.01}
          value={Number(value ?? 0)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      );
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
      const keys =
        kind === "vec2"
          ? ["x", "y"]
          : kind === "vec3"
            ? ["x", "y", "z"]
            : ["x", "y", "z", "w"];
      const state = value ?? defaultValueForKind(kind);
      return (
        <div className="vector-input">
          {keys.map((key) => (
            <label key={key}>
              <span>{key.toUpperCase()}</span>
              <input
                type="number"
                step={0.01}
                value={Number(state?.[key] ?? 0)}
                onChange={(event) =>
                  onChange({
                    ...state,
                    [key]: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      );
    }
    case "color": {
      const state = value ?? defaultValueForKind(kind);
      return (
        <div className="vector-input">
          {(["r", "g", "b", "a"] as const).map((key) => (
            <label key={key}>
              <span>{key.toUpperCase()}</span>
              <input
                type="number"
                min={0}
                max={key === "a" ? 1 : 255}
                step={0.01}
                value={Number(state?.[key] ?? (key === "a" ? 1 : 1))}
                onChange={(event) =>
                  onChange({
                    ...state,
                    [key]: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      );
    }
    case "vector": {
      const arr = Array.isArray(value) ? value : defaultValueForKind(kind);
      return (
        <div className="vector-list">
          {arr.map((entry: number, index: number) => (
            <label key={index}>
              <span>{index}</span>
              <input
                type="number"
                step={0.01}
                value={Number(entry ?? 0)}
                onChange={(event) => {
                  const next = [...arr];
                  next[index] = Number(event.target.value);
                  onChange(next);
                }}
              />
            </label>
          ))}
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
                {(["x", "y", "z"] as const).map((axis) => (
                  <label key={axis}>
                    <span>{axis.toUpperCase()}</span>
                    <input
                      type="number"
                      step={0.01}
                      value={Number(
                        state?.[key]?.[axis] ?? (key === "scale" ? 1 : 0),
                      )}
                      onChange={(event) =>
                        onChange({
                          ...state,
                          [key]: {
                            ...(state?.[key] ?? {}),
                            [axis]: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
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

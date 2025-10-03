import React from "react";
import {
  useAnimDerivative,
  useAnimTarget,
  valueAsNumber,
  valueAsNumericArray,
  valueAsTransform,
  type Value,
} from "@vizij/animation-react";

function formatNumericArray(
  data: readonly number[] | number[] | undefined,
): string {
  if (!data) return "—";
  return data
    .map((x) => (Number.isFinite(x) ? Number(x).toFixed(3) : String(x)))
    .join(", ");
}

function formatValue(value: Value | undefined): string | undefined {
  if (!value) return undefined;

  switch (value.type) {
    case "float": {
      const num = valueAsNumber(value);
      return typeof num === "number" ? num.toFixed(3) : String(value.data);
    }
    case "bool":
      return value.data ? "true" : "false";
    case "text":
      return String(value.data);
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat":
    case "colorrgba":
    case "vector":
      return formatNumericArray(valueAsNumericArray(value));
    case "transform": {
      const tr = valueAsTransform(value);
      if (!tr) return JSON.stringify(value.data ?? null);
      return [
        `translation: ${formatNumericArray(tr.translation)}`,
        `rotation: ${formatNumericArray(tr.rotation)}`,
        `scale: ${formatNumericArray(tr.scale)}`,
      ].join("\n");
    }
    case "enum": {
      const [tag, inner] = value.data;
      const innerDisplay = inner ? formatValue(inner) : "—";
      return `${tag}${innerDisplay !== "—" ? `: ${innerDisplay}` : ""}`;
    }
    case "record":
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(value.data).map(([key, val]) => [
            key,
            formatValue(val),
          ]),
        ),
      );
    case "array":
    case "list":
    case "tuple": {
      const items = value.data as Value[];
      return `[${items.map((entry) => formatValue(entry)).join(", ")}]`;
    }
    default:
      return JSON.stringify(value.data ?? null);
  }
}

function ValueCard({ label, keyPath }: { label: string; keyPath: string }) {
  const v = useAnimTarget(keyPath);
  const vd = useAnimDerivative(keyPath);

  const display = React.useMemo(() => {
    return formatValue(v);
  }, [v]);

  const derivativeDisplay = React.useMemo(() => {
    return formatValue(vd);
  }, [vd]);

  return (
    <div
      style={{
        background: "#1a1d21",
        border: "1px solid #2a2d31",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {display}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 8 }}>
        Derivative
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 500,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          color: "#9ca3af",
        }}
      >
        {derivativeDisplay ?? "—"}
      </div>
    </div>
  );
}

export default function LatestValues({ keys }: { keys: string[] }) {
  if (!keys || keys.length === 0) {
    return (
      <div style={{ opacity: 0.7, fontSize: 12, padding: 12 }}>
        No target keys detected. Load a preset or import an animation.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        padding: 12,
      }}
    >
      {keys.map((k) => (
        <ValueCard key={k} label={k} keyPath={k} />
      ))}
    </div>
  );
}

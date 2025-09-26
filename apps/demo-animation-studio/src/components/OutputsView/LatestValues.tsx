import React from "react";
import {
  useAnimDerivative,
  useAnimTarget,
  Value,
} from "@vizij/animation-react";

function formatNumericArray(data: readonly number[] | number[]): string {
  return data
    .map((x) => (Number.isFinite(x) ? Number(x).toFixed(3) : String(x)))
    .join(", ");
}

function formatValue(value: Value | undefined): string | undefined {
  if (!value) return undefined;
  const { type, data } = value as Value & { data: any };

  switch (type) {
    case "Float":
      return Number.isFinite(data) ? Number(data).toFixed(3) : String(data);
    case "Bool":
      return data ? "true" : "false";
    case "Vec2":
    case "Vec3":
    case "Vec4":
    case "Quat":
    case "ColorRgba":
      return Array.isArray(data) ? formatNumericArray(data) : String(data);
    case "Transform": {
      if (data && typeof data === "object") {
        const pos = data.translation ?? data.pos;
        const rot = data.rotation ?? data.rot;
        const scale = data.scale;
        const lines: string[] = [];
        if (Array.isArray(pos)) lines.push(`pos: ${formatNumericArray(pos)}`);
        if (Array.isArray(rot)) lines.push(`rot: ${formatNumericArray(rot)}`);
        if (Array.isArray(scale))
          lines.push(`scale: ${formatNumericArray(scale)}`);
        return lines.length > 0 ? lines.join("\n") : JSON.stringify(data);
      }
      return JSON.stringify(data);
    }
    case "Text":
      return String(data);
    default:
      return JSON.stringify(data ?? null);
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

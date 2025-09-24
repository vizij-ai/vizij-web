import React from "react";
import { useAnimTarget, Value } from "@vizij/animation-react";

function ValueCard({ label, keyPath }: { label: string; keyPath: string }) {
  const v = useAnimTarget(keyPath);
  console.log(keyPath, v);

  const display = React.useMemo(() => {
    if (!v) return undefined;

    const formatVec = (vec: readonly number[]) =>
      vec.map((x) => x.toFixed(3)).join(" \n");

    switch (v.type) {
      case "Float":
        return v.data.toFixed(3);
      case "Bool":
        return v.data ? "true" : "false";
      case "Vec2":
      case "Vec3":
      case "Vec4":
      case "Quat":
        return formatVec(v.data);
      case "ColorRgba":
        return formatVec(v.data);
      case "Transform": {
        const { pos, rot, scale } = v.data;
        return [
          `pos: ${formatVec(pos)}`,
          `rot: ${formatVec(rot)}`,
          `scale: ${formatVec(scale)}`,
        ].join("\n");
      }
      case "Text":
        return v.data;
      default:
        return "—";
    }
  }, [v]);

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
      <div style={{ fontSize: 18, fontWeight: 600, wordBreak: "break-word" }}>
        {display}
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

import React from "react";
import { useAnimTarget, Value } from "@vizij/animation-react";

function ValueCard({ label, keyPath }: { label: string; keyPath: string }) {
  const v = useAnimTarget(keyPath);
  console.log(keyPath, v);

  function GetDisplay(v: Value | undefined): React.ReactNode {
    let display: React.ReactNode;
    if (!v) return undefined;
    switch (v.type) {
      case "Scalar":
        console.log(v.type);
        display = v.data.toFixed(3);
        return display;
      case "Bool":
        console.log(v.type);
        display = v.data ? "true" : "false";
        return display;
      case "Vec2":
        console.log(v.type);
        display = String(v.data.map((x) => x.toFixed(3)).join(" \n"));
        return display;
      case "Vec3":
        console.log(v.type);
        display = String(v.data.map((x) => x.toFixed(3)).join(" \n"));
        return display;
      case "Vec4":
        console.log(v.type);
        display = String(v.data.map((x) => x.toFixed(3)).join(" \n"));
        return display;
      case "Color":
        console.log(v.type);
        display = String(v.data.map((x) => x.toFixed(3)).join(" \n"));
        return display;
      case "Quat":
        console.log(v.type);
        display = String(v.data.map((x) => x.toFixed(3)).join(" \n")); // w
        return display;
      case "Transform":
        console.log(v.type);
        display = String(v.data);
        return display;
      case "Text":
        console.log(v.type);
        display = String(v.data);
        return display;
      default:
        display = "—";
        return display;
    }
  }
  const display = GetDisplay(v);

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

import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import useGraphStore from "../../state/useGraphStore";
import { useNodeGraph } from "@vizij/node-graph-react";
import type { ValueJSON } from "@vizij/node-graph-wasm";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

function fromValueJSON(v?: ValueJSON): number | undefined {
  if (!v) return undefined;
  if ("float" in v) return v.float;
  if ("bool" in v) return v.bool ? 1 : 0;
  if ("vec3" in v) return v.vec3[0];
  return undefined;
}

type MultiSliderData = {
  label?: string;
  min?: number;
  max?: number;
  x?: number;
  y?: number;
  z?: number;
};

const MultiSliderNode = ({ id, data }: NodeProps<MultiSliderData>) => {
  const { setNodeData } = useGraphStore();
  const { outputs, setParam } = useNodeGraph();

  const o1 = outputs?.[id]?.o1;
  const o2 = outputs?.[id]?.o2;
  const o3 = outputs?.[id]?.o3;

  const x = fromValueJSON(o1) ?? (typeof data.x === "number" ? data.x : 0);
  const y = fromValueJSON(o2) ?? (typeof data.y === "number" ? data.y : 0);
  const z = fromValueJSON(o3) ?? (typeof data.z === "number" ? data.z : 0);

  const min = typeof data.min === "number" ? data.min : 0;
  const max = typeof data.max === "number" ? data.max : 1;
  const step = (max - min) / 100 || 0.01;

  const handleChange = (axis: "x" | "y" | "z") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value);
    setNodeData(id, { ...data, [axis]: n });
    setParam(id, axis, n);
  };

  return (
    <div style={{ padding: 16, minWidth: 240, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", position: "relative" }}>
      {/* Outputs */}
      <Handle type="source" id="o1" position={Position.Right} style={{ ...handleStyle, top: 24 }} />
      <Handle type="source" id="o2" position={Position.Right} style={{ ...handleStyle, top: 64 }} />
      <Handle type="source" id="o3" position={Position.Right} style={{ ...handleStyle, top: 104 }} />

      <div style={{ marginBottom: 8 }}>
        <strong>{data.label ?? "MultiSlider"}</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ textAlign: "right", color: "#aaa" }}>X</div>
        <input type="range" min={min} max={max} step={step} value={x} onChange={handleChange("x")} />
        <div style={{ textAlign: "right" }}>{x.toFixed(2)}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ textAlign: "right", color: "#aaa" }}>Y</div>
        <input type="range" min={min} max={max} step={step} value={y} onChange={handleChange("y")} />
        <div style={{ textAlign: "right" }}>{y.toFixed(2)}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px", alignItems: "center", gap: 8 }}>
        <div style={{ textAlign: "right", color: "#aaa" }}>Z</div>
        <input type="range" min={min} max={max} step={step} value={z} onChange={handleChange("z")} />
        <div style={{ textAlign: "right" }}>{z.toFixed(2)}</div>
      </div>
    </div>
  );
};

export default MultiSliderNode;

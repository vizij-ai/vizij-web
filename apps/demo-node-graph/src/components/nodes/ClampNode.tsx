import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

type ClampData = { label?: string; inputs?: string[]; min?: number; max?: number };

const ClampNodeBase = ({ id, data }: NodeProps<ClampData>) => {
  const value = useNodeOutput(id, "out");
  const input = useNodeOutput(data.inputs?.[0], "out");
  const min = data.min ?? 0;
  const max = data.max ?? 1;

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 170, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -40, fontSize: "0.8em", color: "#aaa" }}>
        In: {displayValue(input)}
      </div>

      <Handle type="target" id="min" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -40, fontSize: "0.8em", color: "#aaa" }}>
        Min: {min.toFixed(2)}
      </div>

      <Handle type="target" id="max" position={Position.Left} style={{ ...handleStyle, top: 85 }} />
      <div style={{ position: "absolute", top: 80, left: -40, fontSize: "0.8em", color: "#aaa" }}>
        Max: {max.toFixed(2)}
      </div>

      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />
      <NodeSeriesPanel samples={{ out: value }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Clamp"}</strong>
        <div style={{ fontSize: "0.8em", color: "#aaa" }}>
            min: {min}, max: {max}
        </div>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
    </div>
  );
};

const ClampNode = React.memo(
  ClampNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.min ?? 0) === (next.data.min ?? 0) &&
    (prev.data.max ?? 1) === (next.data.max ?? 1) &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "")
);

export default ClampNode;

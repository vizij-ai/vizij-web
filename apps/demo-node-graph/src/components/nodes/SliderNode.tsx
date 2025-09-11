import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

type SliderData = { label?: string };

const SliderNodeBase = ({ id, data }: NodeProps<SliderData>) => {
  // Read-only rendering: values are edited in the InspectorPanel
  const out = useNodeOutput(id, "out");

  return (
    <div style={{ padding: 20, minWidth: 200, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555" }}>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />
      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Slider"}</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", marginTop: 8 }}>
          {displayValue(out)}
        </div>
      </div>
    </div>
  );
};

const SliderNode = React.memo(
  SliderNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "")
);

export default SliderNode;

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

type SplitData = { label?: string; inputs?: string[] };

const Vec3SplitNodeBase = ({ id, data }: NodeProps<SplitData>) => {
  const vecIn = useNodeOutput(data.inputs?.[0], "out");

  const x = useNodeOutput(id, "x");
  const y = useNodeOutput(id, "y");
  const z = useNodeOutput(id, "z");

  return (
    <div style={{ padding: "45px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle, top: '50%' }} />
      <div style={{ position: "absolute", top: '50%', left: -60, transform: 'translateY(-50%)', fontSize: "0.8em", color: "#aaa" }}>In: {displayValue(vecIn)}</div>

      <Handle type="source" id="x" position={Position.Right} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, right: 40, fontSize: "0.8em", color: "#aaa" }}>X: {displayValue(x)}</div>
      <Handle type="source" id="y" position={Position.Right} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, right: 40, fontSize: "0.8em", color: "#aaa" }}>Y: {displayValue(y)}</div>
      <Handle type="source" id="z" position={Position.Right} style={{ ...handleStyle, top: 85 }} />
      <div style={{ position: "absolute", top: 80, right: 40, fontSize: "0.8em", color: "#aaa" }}>Z: {displayValue(z)}</div>

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Split Vector"}</strong>
      </div>
      <div style={{ marginTop: 8 }}>
        <NodeSeriesPanel samples={{ x, y, z }} />
      </div>
    </div>
  );
};

const Vec3SplitNode = React.memo(
  Vec3SplitNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "")
);

export default Vec3SplitNode;

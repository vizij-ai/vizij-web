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

type Vec3ScaleData = { label?: string; inputs?: string[] };

const Vec3ScaleNodeBase = ({ id, data }: NodeProps<Vec3ScaleData>) => {
  const value = useNodeOutput(id, "out");

  const inputVecValue = useNodeOutput(data.inputs?.[0], "out");
  const inputScaleValue = useNodeOutput(data.inputs?.[1], "out");

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="v" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>Vec: {displayValue(inputVecValue)}</div>
      <Handle type="target" id="scalar" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Scalar: {displayValue(inputScaleValue)}
      </div>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Vector Scale"}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(value)}</div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const Vec3ScaleNode = React.memo(
  Vec3ScaleNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "")
);

export default Vec3ScaleNode;

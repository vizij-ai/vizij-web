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

type LogData = { label?: string; inputs?: string[] };

const LogNodeBase = ({ id, data }: NodeProps<LogData>) => {
  const value = useNodeOutput(id, "out");
  const valIn = useNodeOutput(data.inputs?.[0], "out");
  const baseIn = useNodeOutput(data.inputs?.[1], "out");

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 180, position: "relative" }}>
      <Handle type="target" id="value" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Value: {displayValue(valIn)}
      </div>

      <Handle type="target" id="base" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Base: {displayValue(baseIn)}
      </div>

      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Log"}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(value)}</div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const LogNode = React.memo(
  LogNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "")
);

export default LogNode;

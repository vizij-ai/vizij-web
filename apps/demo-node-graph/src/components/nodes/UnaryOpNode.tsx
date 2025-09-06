import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph, type ValueJSON } from "@vizij/node-graph-react";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

function displayValue(v?: ValueJSON): string {
  if (!v) return "N/A";
  if ("float" in v) return v.float.toFixed(3);
  if ("bool" in v) return v.bool ? "true" : "false";
  return "N/A";
}

const UnaryOpNode = ({ id, data }: NodeProps<{ label?: string; op: string; inputs?: string[] }>) => {
  const { outputs } = useNodeGraph();
  const value = outputs?.[id];
  const inputValue = outputs?.[data.inputs?.[0] ?? ""];

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 150, position: "relative" }}>
      <Handle type="target" id="a" position={Position.Left} style={{ ...handleStyle, top: 38 }} />
      <div style={{ position: "absolute", top: 33, left: -40, fontSize: "0.8em", color: "#aaa" }}>In: {displayValue(inputValue)}</div>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? `${data.op} In`}</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(value)}</div>
      </div>
    </div>
  );
};

export default UnaryOpNode;

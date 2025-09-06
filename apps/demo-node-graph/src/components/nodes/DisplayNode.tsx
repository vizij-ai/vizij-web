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
  if ("float" in v) return v.float.toFixed(2);
  if ("bool" in v) return v.bool ? "true" : "false";
  if ("vec3" in v) return `[${v.vec3.map((n: number) => n.toFixed(2)).join(", ")}]`;
  return "N/A";
}

const DisplayNode = ({ id, data }: NodeProps<{ label?: string }>) => {
  const { outputs } = useNodeGraph();
  const value = outputs?.[id];

  return (
    <div style={{ padding: "10px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555" }}>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />
      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Value"}</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
    </div>
  );
};

export default DisplayNode;

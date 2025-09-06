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
  if ("vec3" in v) return `[${v.vec3.map((n:number) => n.toFixed(3)).join(", ")}]`;
  return "N/A";
}

const OutputNode = ({ id, data }: NodeProps<{ label?: string; inputs?: string[] }>) => {
  const { outputs } = useNodeGraph();

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", minWidth: 200, position: "relative" }}>
      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        <strong>{data.label ?? "Output"}</strong>
      </div>
      {data.inputs?.map((input, i) => {
        const val = outputs?.[data.inputs?.[i] ?? ""];
        return (
          <div key={input} style={{ position: "relative", marginBottom: "5px" }}>
            <Handle type="target" id={input} position={Position.Left} style={{ ...handleStyle, top: 25 + i * 30 }} />
            <div style={{ marginLeft: "20px" }}>
              <span>{input}: </span>
              <strong>{displayValue(val)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OutputNode;

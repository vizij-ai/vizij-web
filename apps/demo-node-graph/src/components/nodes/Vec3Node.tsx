import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const Vec3Node = ({ id, data }: NodeProps<{ label?: string; inputs?: string[] }>) => {
  const { outputs } = useNodeGraph();
  const value = outputs?.[id];

  const inputXValue = outputs?.[data.inputs?.[0] ?? ""];
  const inputYValue = outputs?.[data.inputs?.[1] ?? ""];
  const inputZValue = outputs?.[data.inputs?.[2] ?? ""];

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="x" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -40, fontSize: "0.8em", color: "#aaa" }}>X: {displayValue(inputXValue)}</div>
      <Handle type="target" id="y" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -40, fontSize: "0.8em", color: "#aaa" }}>Y: {displayValue(inputYValue)}</div>
      <Handle type="target" id="z" position={Position.Left} style={{ ...handleStyle, top: 85 }} />
      <div style={{ position: "absolute", top: 80, left: -40, fontSize: "0.8em", color: "#aaa" }}>Z: {displayValue(inputZValue)}</div>
      <Handle type="source" id="out" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Vector"}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(value)}</div>
      </div>
    </div>
  );
};

export default Vec3Node;

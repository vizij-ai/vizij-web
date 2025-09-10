import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const Vec3SplitNode = ({ id, data }: NodeProps<{ label?: string; inputs?: string[] }>) => {
  const { outputs } = useNodeGraph();
  const vecIn = outputs?.[data.inputs?.[0] ?? ""];
  
  const x = outputs?.[id]?.x;
  const y = outputs?.[id]?.y;
  const z = outputs?.[id]?.z;

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle, top: '50%' }} />
      <div style={{ position: "absolute", top: '50%', left: -60, transform: 'translateY(-50%)', fontSize: "0.8em", color: "#aaa" }}>In: {displayValue(vecIn)}</div>

      <Handle type="source" id="x" position={Position.Right} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, right: -40, fontSize: "0.8em", color: "#aaa" }}>X: {displayValue(x)}</div>
      <Handle type="source" id="y" position={Position.Right} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, right: -40, fontSize: "0.8em", color: "#aaa" }}>Y: {displayValue(y)}</div>
      <Handle type="source" id="z" position={Position.Right} style={{ ...handleStyle, top: 85 }} />
      <div style={{ position: "absolute", top: 80, right: -40, fontSize: "0.8em", color: "#aaa" }}>Z: {displayValue(z)}</div>

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Split Vector"}</strong>
      </div>
    </div>
  );
};

export default Vec3SplitNode;

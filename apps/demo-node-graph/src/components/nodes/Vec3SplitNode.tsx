import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph, valueAsVec3 } from "@vizij/node-graph-react";
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
  const asVec = valueAsVec3(vecIn) ?? [0, 0, 0];

  const selfOut = outputs?.[id]; // core returns a vec3; hosts can split
  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>In: {displayValue(vecIn)}</div>

      <Handle type="source" id="x" position={Position.Right} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, right: -40, fontSize: "0.8em", color: "#aaa" }}>X: {asVec[0].toFixed(3)}</div>
      <Handle type="source" id="y" position={Position.Right} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, right: -40, fontSize: "0.8em", color: "#aaa" }}>Y: {asVec[1].toFixed(3)}</div>
      <Handle type="source" id="z" position={Position.Right} style={{ ...handleStyle, top: 85 }} />
      <div style={{ position: "absolute", top: 80, right: -40, fontSize: "0.8em", color: "#aaa" }}>Z: {asVec[2].toFixed(3)}</div>

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Split Vector"}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(selfOut)}</div>
      </div>
    </div>
  );
};

export default Vec3SplitNode;

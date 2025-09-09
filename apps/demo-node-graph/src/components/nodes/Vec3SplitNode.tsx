import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import useGraphStore from "../../state/useGraphStore";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const Vec3SplitNode = ({ id, data }: NodeProps<{ label?: string; inputs?: string[], index?: number }>) => {
  const { outputs, setParam } = useNodeGraph();
  const { setNodeData } = useGraphStore();
  const value = outputs?.[id];
  const vecIn = outputs?.[data.inputs?.[0] ?? ""];
  const index = data.index ?? 0;

  const onIndexChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setNodeData(id, { ...data, index: newIndex });
    setParam(id, "index", newIndex);
  };

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 200, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>In: {displayValue(vecIn)}</div>

      <Handle type="source" id="out" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Split Vector"}</strong>
        <div style={{ margin: "10px 0" }}>
          <select value={index} onChange={onIndexChange} style={{width: "100%", background: "#1e1e1e", border: "1px solid #555", color: "#f0f0f0", borderRadius: 4, padding: 5}}>
            <option value={0}>X / R</option>
            <option value={1}>Y / G</option>
            <option value={2}>Z / B</option>
          </select>
        </div>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>{displayValue(value)}</div>
      </div>
    </div>
  );
};

export default Vec3SplitNode;

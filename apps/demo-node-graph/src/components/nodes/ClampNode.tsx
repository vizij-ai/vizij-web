import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const ClampNode = ({ id, data }: NodeProps<{ label?: string; inputs?: string[], min?: number, max?: number }>) => {
  const { outputs } = useNodeGraph();

  const value = outputs?.[id];
  const input = outputs?.[data.inputs?.[0] ?? ""];
  const min = data.min ?? 0;
  const max = data.max ?? 1;

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 170, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle, top: 40 }} />
      <div style={{ position: "absolute", top: 35, left: -40, fontSize: "0.8em", color: "#aaa" }}>
        In: {displayValue(input)}
      </div>

      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Clamp"}</strong>
        <div style={{ fontSize: "0.8em", color: "#aaa" }}>
            min: {min}, max: {max}
        </div>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
    </div>
  );
};

export default ClampNode;

import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const VectorOpNode = ({ id, data }: NodeProps<{ label?: string; op: string; inputs?: string[] }>) => {
  const { outputs } = useNodeGraph();
  const value = outputs?.[id];

  const inputAValue = outputs?.[data.inputs?.[0] ?? ""];
  const inputBValue = outputs?.[data.inputs?.[1] ?? ""];

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 180, position: "relative" }}>
      <Handle type="target" id="a" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -50, fontSize: "0.8em", color: "#aaa" }}>
        A: {displayValue(inputAValue)}
      </div>
      <Handle type="target" id="b" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -50, fontSize: "0.8em", color: "#aaa" }}>
        B: {displayValue(inputBValue)}
      </div>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? `A ${data.op} B`}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
    </div>
  );
};

export default VectorOpNode;

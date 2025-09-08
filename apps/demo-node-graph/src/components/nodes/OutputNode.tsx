import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

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

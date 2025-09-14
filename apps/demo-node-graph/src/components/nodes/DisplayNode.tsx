import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const DisplayNode = ({ id, data }: NodeProps<{ label?: string }>) => {
  const value = useNodeOutput(id, "out");

  return (
    <div
      style={{
        padding: "10px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle }}
      />
      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Value"}</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value, 2)}
        </div>
        <NodeSeriesPanel samples={{ out: value }} />
      </div>
    </div>
  );
};

export default DisplayNode;

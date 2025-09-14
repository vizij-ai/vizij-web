import React from "react";
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

type VectorConstantData = { label?: string };

const VectorConstantNodeBase = ({
  id,
  data,
}: NodeProps<VectorConstantData>) => {
  const value = useNodeOutput(id, "out");

  return (
    <div
      style={{
        padding: 20,
        minWidth: 200,
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
        <strong>{data.label ?? "Vector Constant"}</strong>
        <div style={{ fontSize: "1.1em", fontWeight: "bold", marginTop: 8 }}>
          {displayValue(value)}
        </div>
        <NodeSeriesPanel samples={{ out: value }} />
      </div>
    </div>
  );
};

const VectorConstantNode = React.memo(
  VectorConstantNodeBase,
  (prev, next) =>
    prev.id === next.id && (prev.data.label ?? "") === (next.data.label ?? ""),
);

export default VectorConstantNode;

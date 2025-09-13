import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";
import { useConnectedValue } from "../../lib/hooks";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

type VectorIndexData = { label?: string; inputs?: string[] };

const VectorIndexNodeBase = ({ id, data }: NodeProps<VectorIndexData>) => {
  const value = useNodeOutput(id, "out");
  const vecIn = useConnectedValue(id, "v", "out");
  const indexIn = useConnectedValue(id, "index", "out");

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 210, position: "relative" }}>
      <Handle type="target" id="v" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        V: {displayValue(vecIn)}
      </div>
      <Handle type="target" id="index" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Index: {displayValue(indexIn)}
      </div>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Vector Index"}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const VectorIndexNode = React.memo(
  VectorIndexNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "")
);

export default VectorIndexNode;

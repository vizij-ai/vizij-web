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

type VectorOpData = { label?: string; op: string; inputs?: string[] };

const VectorOpNodeBase = ({ id, data }: NodeProps<VectorOpData>) => {
  const value = useNodeOutput(id, "out");

  const inputAValue = useConnectedValue(id, "a", "out");
  const inputBValue = useConnectedValue(id, "b", "out");

  return (
    <div
      style={{
        padding: "15px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        width: 180,
        position: "relative",
      }}
    >
      <Handle
        type="target"
        id="a"
        position={Position.Left}
        style={{ ...handleStyle, top: 25 }}
      />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: -50,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        A: {displayValue(inputAValue)}
      </div>
      <Handle
        type="target"
        id="b"
        position={Position.Left}
        style={{ ...handleStyle, top: 55 }}
      />
      <div
        style={{
          position: "absolute",
          top: 50,
          left: -50,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        B: {displayValue(inputBValue)}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle }}
      />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? `A ${data.op} B`}</strong>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const VectorOpNode = React.memo(
  VectorOpNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    prev.data.op === next.data.op &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? ""),
);

export default VectorOpNode;

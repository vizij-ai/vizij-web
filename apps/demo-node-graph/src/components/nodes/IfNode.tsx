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

type IfData = { label?: string; inputs?: string[] };

const IfNodeBase = ({ id, data }: NodeProps<IfData>) => {
  const value = useNodeOutput(id, "out");
  const cond = useNodeOutput(data.inputs?.[0], "out");
  const thenVal = useNodeOutput(data.inputs?.[1], "out");
  const elseVal = useNodeOutput(data.inputs?.[2], "out");

  return (
    <div
      style={{
        padding: "15px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        width: 170,
        position: "relative",
      }}
    >
      <Handle
        type="target"
        id="cond"
        position={Position.Left}
        style={{ ...handleStyle, top: 25 }}
      />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: -70,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Condition: {displayValue(cond)}
      </div>

      <Handle
        type="target"
        id="then"
        position={Position.Left}
        style={{ ...handleStyle, top: 55 }}
      />
      <div
        style={{
          position: "absolute",
          top: 50,
          left: -70,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Then: {displayValue(thenVal)}
      </div>

      <Handle
        type="target"
        id="else"
        position={Position.Left}
        style={{ ...handleStyle, top: 85 }}
      />
      <div
        style={{
          position: "absolute",
          top: 80,
          left: -70,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Else: {displayValue(elseVal)}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle }}
      />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "If"}</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const IfNode = React.memo(
  IfNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "") &&
    (prev.data.inputs?.[2] ?? "") === (next.data.inputs?.[2] ?? ""),
);

export default IfNode;

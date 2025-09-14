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

type RemapData = {
  label?: string;
  inputs?: string[];
  in_min?: number;
  in_max?: number;
  out_min?: number;
  out_max?: number;
};

const RemapNodeBase = ({ id, data }: NodeProps<RemapData>) => {
  const value = useNodeOutput(id, "out");
  const input = useNodeOutput(data.inputs?.[0], "out");
  const in_min = data.in_min ?? 0;
  const in_max = data.in_max ?? 1;
  const out_min = data.out_min ?? 0;
  const out_max = data.out_max ?? 1;

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
        id="in"
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
        In: {displayValue(input)}
      </div>

      <Handle
        type="target"
        id="in_min"
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
        In Min: {in_min.toFixed(2)}
      </div>

      <Handle
        type="target"
        id="in_max"
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
        In Max: {in_max.toFixed(2)}
      </div>

      <Handle
        type="target"
        id="out_min"
        position={Position.Left}
        style={{ ...handleStyle, top: 115 }}
      />
      <div
        style={{
          position: "absolute",
          top: 110,
          left: -70,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Out Min: {out_min.toFixed(2)}
      </div>

      <Handle
        type="target"
        id="out_max"
        position={Position.Left}
        style={{ ...handleStyle, top: 145 }}
      />
      <div
        style={{
          position: "absolute",
          top: 140,
          left: -70,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Out Max: {out_max.toFixed(2)}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle }}
      />
      <NodeSeriesPanel samples={{ out: value }} />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Remap"}</strong>
        <div style={{ fontSize: "0.7em", color: "#aaa" }}>
          from [{in_min}, {in_max}] to [{out_min}, {out_max}]
        </div>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
    </div>
  );
};

const RemapNode = React.memo(
  RemapNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.in_min ?? 0) === (next.data.in_min ?? 0) &&
    (prev.data.in_max ?? 1) === (next.data.in_max ?? 1) &&
    (prev.data.out_min ?? 0) === (next.data.out_min ?? 0) &&
    (prev.data.out_max ?? 1) === (next.data.out_max ?? 1) &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? ""),
);
export default RemapNode;

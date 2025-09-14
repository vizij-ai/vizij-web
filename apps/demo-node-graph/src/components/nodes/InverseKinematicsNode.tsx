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

type IKData = {
  label?: string;
  inputs?: string[];
  bone1?: number;
  bone2?: number;
  bone3?: number;
};

const InverseKinematicsNodeBase = ({ id, data }: NodeProps<IKData>) => {
  const value = useNodeOutput(id, "out");
  const x = useNodeOutput(data.inputs?.[0], "out");
  const y = useNodeOutput(data.inputs?.[1], "out");
  const theta = useNodeOutput(data.inputs?.[2], "out");

  const bone1len = data.bone1 ?? 1;
  const bone2len = data.bone2 ?? 1;
  const bone3len = data.bone3 ?? 0.5;

  return (
    <div
      style={{
        padding: "15px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        width: 220,
        position: "relative",
      }}
    >
      <Handle
        type="target"
        id="x"
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
        X: {displayValue(x)}
      </div>

      <Handle
        type="target"
        id="y"
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
        Y: {displayValue(y)}
      </div>

      <Handle
        type="target"
        id="theta"
        position={Position.Left}
        style={{ ...handleStyle, top: 85 }}
      />
      <div
        style={{
          position: "absolute",
          top: 80,
          left: -50,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Theta: {displayValue(theta)}
      </div>

      <Handle
        type="target"
        id="bone1"
        position={Position.Left}
        style={{ ...handleStyle, top: 115 }}
      />
      <div
        style={{
          position: "absolute",
          top: 110,
          left: -60,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Bone1: {bone1len.toFixed(2)}
      </div>

      <Handle
        type="target"
        id="bone2"
        position={Position.Left}
        style={{ ...handleStyle, top: 145 }}
      />
      <div
        style={{
          position: "absolute",
          top: 140,
          left: -60,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Bone2: {bone2len.toFixed(2)}
      </div>

      <Handle
        type="target"
        id="bone3"
        position={Position.Left}
        style={{ ...handleStyle, top: 175 }}
      />
      <div
        style={{
          position: "absolute",
          top: 170,
          left: -60,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        Bone3: {bone3len.toFixed(2)}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ ...handleStyle }}
      />

      <div style={{ textAlign: "center" }}>
        <strong>{data.label ?? "Inverse Kinematics"}</strong>
        <div style={{ fontSize: "0.7em", color: "#aaa" }}>
          Bones: [{bone1len.toFixed(2)}, {bone2len.toFixed(2)},{" "}
          {bone3len.toFixed(2)}]
        </div>
        <div style={{ fontSize: "1.2em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(value)}
        </div>
      </div>
      <NodeSeriesPanel samples={{ out: value }} />
    </div>
  );
};

const InverseKinematicsNode = React.memo(
  InverseKinematicsNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    (prev.data.bone1 ?? 1) === (next.data.bone1 ?? 1) &&
    (prev.data.bone2 ?? 1) === (next.data.bone2 ?? 1) &&
    (prev.data.bone3 ?? 0.5) === (next.data.bone3 ?? 0.5) &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "") &&
    (prev.data.inputs?.[2] ?? "") === (next.data.inputs?.[2] ?? ""),
);

export default InverseKinematicsNode;

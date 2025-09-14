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

type MultiSliderData = {
  label?: string;
};

const MultiSliderNodeBase = ({ id, data }: NodeProps<MultiSliderData>) => {
  // Read-only: values are edited in the InspectorPanel
  const o1 = useNodeOutput(id, "x");
  const o2 = useNodeOutput(id, "y");
  const o3 = useNodeOutput(id, "z");

  return (
    <div
      style={{
        padding: 16,
        minWidth: 240,
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        position: "relative",
      }}
    >
      {/* Outputs */}
      <Handle
        type="source"
        id="x"
        position={Position.Right}
        style={{ ...handleStyle, top: 24 }}
      />
      <Handle
        type="source"
        id="y"
        position={Position.Right}
        style={{ ...handleStyle, top: 64 }}
      />
      <Handle
        type="source"
        id="z"
        position={Position.Right}
        style={{ ...handleStyle, top: 104 }}
      />

      <div style={{ marginBottom: 8, textAlign: "center" }}>
        <strong>{data.label ?? "MultiSlider"}</strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ textAlign: "right", color: "#aaa" }}>X</div>
        <div style={{ textAlign: "left", fontWeight: 600 }}>
          {displayValue(o1)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ textAlign: "right", color: "#aaa" }}>Y</div>
        <div style={{ textAlign: "left", fontWeight: 600 }}>
          {displayValue(o2)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ textAlign: "right", color: "#aaa" }}>Z</div>
        <div style={{ textAlign: "left", fontWeight: 600 }}>
          {displayValue(o3)}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <NodeSeriesPanel samples={{ x: o1, y: o2, z: o3 }} />
      </div>
    </div>
  );
};

const MultiSliderNode = React.memo(
  MultiSliderNodeBase,
  (prev, next) =>
    prev.id === next.id && (prev.data.label ?? "") === (next.data.label ?? ""),
);

export default MultiSliderNode;

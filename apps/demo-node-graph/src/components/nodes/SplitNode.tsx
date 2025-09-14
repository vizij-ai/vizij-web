import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph, useNodeOutput } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";
import type { ValueJSON } from "@vizij/node-graph-wasm";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

type SplitData = { label?: string; sizes?: number[] };

const SplitNodeBase = ({ id, data }: NodeProps<SplitData>) => {
  const { outputs } = useNodeGraph();
  const inVal = useNodeOutput(id, "in");

  const sizes = Array.isArray(data.sizes)
    ? data.sizes.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    : [];
  const partsCount = Math.max(1, sizes.length); // render at least one part for UX

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
        id="in"
        position={Position.Left}
        style={{ ...handleStyle, top: 20 }}
      />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: -60,
          fontSize: "0.8em",
          color: "#aaa",
        }}
      >
        In: {displayValue(inVal)}
      </div>

      {/* Dynamic outputs: read values from graph.outputs without hooks in loop */}
      {Array.from({ length: partsCount }).map((_, i) => {
        const key = `part${i + 1}`;
        const y = 25 + i * 22;
        const nodeOuts = outputs?.[id] as Record<string, ValueJSON> | undefined;
        const val = nodeOuts ? nodeOuts[key] : undefined;
        return (
          <React.Fragment key={key}>
            <Handle
              type="source"
              id={key}
              position={Position.Right}
              style={{ ...handleStyle, top: y }}
            />
            <div
              style={{
                position: "absolute",
                top: y - 6,
                right: -210,
                fontSize: "0.8em",
                color: "#aaa",
                width: 200,
                textAlign: "right",
              }}
            >
              {key}: {displayValue(val)}
            </div>
          </React.Fragment>
        );
      })}

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <strong>{data.label ?? "Split"}</strong>
      </div>

      <NodeSeriesPanel
        samples={{
          in: inVal,
          // show up to first three parts
          part1: (outputs?.[id] as Record<string, ValueJSON> | undefined)
            ?.part1,
          part2: (outputs?.[id] as Record<string, ValueJSON> | undefined)
            ?.part2,
          part3: (outputs?.[id] as Record<string, ValueJSON> | undefined)
            ?.part3,
        }}
      />
    </div>
  );
};

const SplitNode = React.memo(
  SplitNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.label ?? "") === (next.data.label ?? "") &&
    JSON.stringify(prev.data.sizes ?? []) ===
      JSON.stringify(next.data.sizes ?? []),
);

export default SplitNode;

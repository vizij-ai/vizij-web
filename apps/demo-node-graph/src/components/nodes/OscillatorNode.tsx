import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeOutput, valueAsNumber } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

/**
 * Convention: inputs[0] = frequency, inputs[1] = phase.
 * Falls back to data.frequency / data.phase if no input is connected.
 */
type OscData = { inputs?: string[]; frequency?: number; phase?: number };

const OscillatorNodeBase = ({ id, data }: NodeProps<OscData>) => {
  const out = useNodeOutput(id, "out");

  const freqIn = useNodeOutput(data.inputs?.[0], "out");
  const phaseIn = useNodeOutput(data.inputs?.[1], "out");

  const freq = valueAsNumber(freqIn) ?? data.frequency ?? 1.0;
  const phase = valueAsNumber(phaseIn) ?? data.phase ?? 0.0;

  return (
    <div style={{ padding: 15, minWidth: 200, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", position: "relative" }}>
      <Handle type="target" id="frequency" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Freq: {freq.toFixed(2)}
      </div>
      <NodeSeriesPanel samples={{ out }} />

      <Handle type="target" id="phase" position={Position.Left} style={{ ...handleStyle, top: 55 }} />
      <div style={{ position: "absolute", top: 50, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Phase: {phase.toFixed(2)}
      </div>

      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

      <div style={{ textAlign: "center" }}>
        <strong>Oscillator</strong>
        <div style={{ fontSize: "1.5em", fontWeight: "bold", margin: "5px 0" }}>
          {displayValue(out)}
        </div>
      </div>
    </div>
  );
};

const OscillatorNode = React.memo(
  OscillatorNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    (prev.data.frequency ?? 0) === (next.data.frequency ?? 0) &&
    (prev.data.phase ?? 0) === (next.data.phase ?? 0) &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "")
);

export default OscillatorNode;

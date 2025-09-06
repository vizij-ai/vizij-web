import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph, type ValueJSON, valueAsNumber } from "@vizij/node-graph-react";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

function displayValue(v?: ValueJSON): string {
  if (!v) return "N/A";
  if ("float" in v) return v.float.toFixed(3);
  if ("bool" in v) return v.bool ? "true" : "false";
  if ("vec3" in v) return `[${v.vec3.map((n:number) => n.toFixed(3)).join(", ")}]`;
  return "N/A";
}

/**
 * Convention: inputs[0] = frequency, inputs[1] = phase.
 * Falls back to data.frequency / data.phase if no input is connected.
 */
const OscillatorNode = ({ id, data }: NodeProps<{ inputs?: string[]; frequency?: number; phase?: number }>) => {
  const { outputs } = useNodeGraph();

  const out = outputs?.[id];

  const freqIn = outputs?.[data.inputs?.[0] ?? ""];
  const phaseIn = outputs?.[data.inputs?.[1] ?? ""];
  const freq = valueAsNumber(freqIn) ?? data.frequency ?? 1.0;
  const phase = valueAsNumber(phaseIn) ?? data.phase ?? 0.0;

  return (
    <div style={{ padding: 15, minWidth: 200, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", position: "relative" }}>
      <Handle type="target" id="frequency" position={Position.Left} style={{ ...handleStyle, top: 25 }} />
      <div style={{ position: "absolute", top: 20, left: -60, fontSize: "0.8em", color: "#aaa" }}>
        Freq: {freq.toFixed(2)}
      </div>

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

export default OscillatorNode;

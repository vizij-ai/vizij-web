import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph } from "@vizij/node-graph-react";
import { displayValue } from "../../lib/display";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const RemapNode = ({ id, data }: NodeProps<{ label?: string; inputs?: string[], in_min?: number, in_max?: number, out_min?: number, out_max?: number }>) => {
  const { outputs } = useNodeGraph();

  const value = outputs?.[id];
  const input = outputs?.[data.inputs?.[0] ?? ""];
  const in_min = data.in_min ?? 0;
  const in_max = data.in_max ?? 1;
  const out_min = data.out_min ?? 0;
  const out_max = data.out_max ?? 1;

  return (
    <div style={{ padding: "15px 20px", background: "#2a2a2a", borderRadius: 8, border: "1px solid #555", width: 170, position: "relative" }}>
      <Handle type="target" id="in" position={Position.Left} style={{ ...handleStyle, top: 40 }} />
      <div style={{ position: "absolute", top: 35, left: -40, fontSize: "0.8em", color: "#aaa" }}>
        In: {displayValue(input)}
      </div>

      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />

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

export default RemapNode;

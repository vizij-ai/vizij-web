import { Handle, Position, type NodeProps } from "reactflow";
import useGraphStore from "../../state/useGraphStore";
import { useNodeGraph, type ValueJSON } from "@vizij/node-graph-react";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

function fromValueJSON(v?: ValueJSON): number | undefined {
  if (!v) return undefined;
  if ("float" in v) return v.float;
  if ("bool" in v) return v.bool ? 1 : 0;
  if ("vec3" in v) return v.vec3[0];
  return undefined;
}

const SliderNode = ({ id, data }: NodeProps<any>) => {
  const { setNodeData } = useGraphStore();
  const { outputs, setParam } = useNodeGraph();

  const out = outputs?.[id];
  const current =
    fromValueJSON(out) ?? (typeof data.value === "number" ? data.value : 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value);
    setNodeData(id, { ...data, value: n });   // update editor state
    setParam(id, "value", n);                  // drive the graph param live
  };

  const min = typeof data.min === "number" ? data.min : 0;
  const max = typeof data.max === "number" ? data.max : 1;
  const step = (max - min) / 100 || 0.01;

  return (
    <div style={{ padding: 20, minWidth: 200, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555" }}>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />
      <div>
        <strong>{data.label ?? "Slider"}</strong>
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={handleChange}
          style={{ width: "100%" }}
        />
        <div style={{ textAlign: "center", marginTop: 5 }}>{current.toFixed(2)}</div>
      </div>
    </div>
  );
};

export default SliderNode;

import { Handle, Position, type NodeProps } from "reactflow";
import useGraphStore from "../../state/useGraphStore";
import { useNodeGraph, type ValueJSON, valueAsNumber } from "@vizij/node-graph-react";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const ConstantNode = ({ id, data }: NodeProps<{ value?: number; label?: string }>) => {
  const { setNodeData } = useGraphStore();
  const { outputs, setParam } = useNodeGraph();

  // show live graph output if available; otherwise show editor default
  const out = outputs?.[id];
  const current = valueAsNumber(out) ?? (typeof data.value === "number" ? data.value : 0);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseFloat(e.target.value);
    setNodeData(id, { ...data, value: n }); // update editor state
    setParam(id, "value", n);                // update graph param immediately
  };

  return (
    <div style={{ padding: 20, minWidth: 170, background: "#2a2a2a", borderRadius: 8, border: "1px solid #555" }}>
      <Handle type="source" position={Position.Right} style={{ ...handleStyle }} />
      <div><strong>{data.label ?? "Constant"}</strong></div>
      <div style={{ marginTop: 10 }}>
        <input
          type="number"
          value={Number.isFinite(current) ? current : 0}
          onChange={onChange}
          style={{
            width: "100%",
            background: "#1e1e1e",
            border: "1px solid #555",
            color: "#f0f0f0",
            borderRadius: 4,
            padding: 5
          }}
        />
      </div>
    </div>
  );
};

export default ConstantNode;

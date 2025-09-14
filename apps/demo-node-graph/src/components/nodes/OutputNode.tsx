import React, { useState, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNodeGraph, valueAsNumber } from "@vizij/node-graph-react";
import useGraphStore from "../../state/useGraphStore";
import { displayValue } from "../../lib/display";
import HistoryChart from "./HistoryChart";

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: "#444",
  border: "2px solid #222",
};

const OutputNode = ({
  id,
  data,
}: NodeProps<{ label?: string; inputs?: string[] }>) => {
  const { setNodeData, edges } = useGraphStore();
  const { outputs } = useNodeGraph();
  const [history, setHistory] = useState<Record<string, number[]>>({});

  const addInput = useCallback(() => {
    const newInputs = [...(data.inputs ?? [])];
    let i = 1;
    while (newInputs.includes(`input_${i}`)) {
      i++;
    }
    newInputs.push(`input_${i}`);
    setNodeData(id, { ...data, inputs: newInputs });
  }, [id, data, setNodeData]);

  useEffect(() => {
    setHistory((prevHistory) => {
      const newHistory = { ...prevHistory };
      let needsUpdate = false;
      (data.inputs ?? []).forEach((inputHandle) => {
        const edge = edges.find(
          (e) => e.target === id && e.targetHandle === inputHandle,
        );
        if (edge) {
          const sourceVal = outputs?.[edge.source];
          const numVal = valueAsNumber(sourceVal);

          if (typeof numVal === "number" && isFinite(numVal)) {
            const h = [...(newHistory[inputHandle] ?? [])];
            h.push(numVal);
            if (h.length > 100) h.shift();
            newHistory[inputHandle] = h;
            needsUpdate = true;
          }
        }
      });
      return needsUpdate ? newHistory : prevHistory;
    });
  }, [outputs, data.inputs, id, edges]);

  return (
    <div
      style={{
        padding: "15px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        minWidth: 250,
        position: "relative",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        <strong>{data.label ?? "Output"}</strong>
      </div>
      {(data.inputs ?? []).map((inputHandle, i) => {
        const edge = edges.find(
          (e) => e.target === id && e.targetHandle === inputHandle,
        );
        const val = edge ? outputs?.[edge.source] : undefined;
        return (
          <div
            key={inputHandle}
            style={{ position: "relative", marginBottom: 15 }}
          >
            <Handle
              type="target"
              id={inputHandle}
              position={Position.Left}
              style={{ ...handleStyle, top: i * 80 + 25 }}
            />
            <div style={{ marginLeft: "20px" }}>
              <div>
                <span>{inputHandle}: </span>
                <strong>{displayValue(val)}</strong>
              </div>
              <div style={{ marginTop: 5 }}>
                <HistoryChart history={history[inputHandle]} />
              </div>
            </div>
          </div>
        );
      })}
      <button onClick={addInput} style={{ width: "100%", marginTop: 10 }}>
        + Add Input
      </button>
    </div>
  );
};

export default OutputNode;

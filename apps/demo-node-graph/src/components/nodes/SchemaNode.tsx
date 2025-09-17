import React, { useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  useNodeOutputs,
  useNodeOutput,
  valueAsNumber,
} from "@vizij/node-graph-react";
import { useRegistry } from "../../state/RegistryContext";
import { displayValue } from "../../lib/display";
import HistoryChart from "./HistoryChart";

interface SchemaNodeData {
  label?: string;
  path?: string;
  [key: string]: unknown;
}

const HANDLE_HEIGHT = 24;
const HANDLE_OFFSET = 16;

const SchemaNode: React.FC<NodeProps<SchemaNodeData>> = ({
  id,
  type,
  data,
}) => {
  const { registry } = useRegistry();
  const signature = useMemo(() => {
    const typeId = type?.toLowerCase();
    return registry?.nodes.find(
      (node) => node.type_id.toLowerCase() === typeId,
    );
  }, [registry, type]);

  const outputs = useNodeOutputs(id);
  const primaryOutput = useNodeOutput(id);

  const [history, setHistory] = useState<number[]>([]);
  const numericValue = valueAsNumber(primaryOutput);

  useEffect(() => {
    if (type !== "output") return;
    if (numericValue === undefined || Number.isNaN(numericValue)) return;
    setHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === numericValue) {
        return prev;
      }
      const next =
        prev.length >= 200
          ? [...prev.slice(prev.length - 199), numericValue]
          : [...prev, numericValue];
      return next;
    });
  }, [numericValue, type]);

  const label = data.label ?? signature?.name ?? type;

  const derivedInputs = useMemo(() => {
    if (signature?.inputs?.length) return signature.inputs;
    return [{ id: "in", label: "In" }];
  }, [signature]);

  const derivedOutputs = useMemo(() => {
    if (signature?.outputs?.length) return signature.outputs;
    if (outputs) {
      const keys = Object.keys(outputs);
      if (keys.length > 0) {
        return keys.map((key) => ({ id: key, label: key.toUpperCase() }));
      }
    }
    return [{ id: "out", label: "Out" }];
  }, [signature, outputs]);

  const renderHandles = (
    items: Array<{ id: string; label: string }>,
    direction: "input" | "output",
  ) =>
    items.map((item, index) => {
      const isInput = direction === "input";
      const top = HANDLE_OFFSET + index * HANDLE_HEIGHT;
      return (
        <div
          key={`${direction}-${item.id}`}
          style={{
            position: "relative",
            paddingLeft: isInput ? 20 : 0,
            paddingRight: isInput ? 0 : 20,
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: isInput ? "flex-start" : "flex-end",
            color: "#ccc",
            fontSize: 12,
          }}
        >
          {isInput ? (
            <Handle
              type="target"
              id={item.id}
              position={Position.Left}
              style={{ top, transform: "translateY(-50%)" }}
            />
          ) : null}
          <span>{item.label || item.id}</span>
          {!isInput ? (
            <Handle
              type="source"
              id={item.id}
              position={Position.Right}
              style={{ top, transform: "translateY(-50%)" }}
            />
          ) : null}
        </div>
      );
    });

  const renderOutputsPreview = () => {
    if (!outputs) return null;
    return Object.entries(outputs).map(([key, snapshot]) => (
      <div key={key} style={{ fontSize: 12, color: "#9aa0a6" }}>
        {key}: {displayValue(snapshot)}
      </div>
    ));
  };

  const isOutput = type === "output";

  return (
    <div
      style={{
        padding: 16,
        minWidth: 220,
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <strong>{label}</strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 4,
        }}
      >
        {renderHandles(derivedInputs, "input")}
        {renderHandles(derivedOutputs, "output")}
      </div>

      <div style={{ marginTop: 12 }}>{renderOutputsPreview()}</div>

      {isOutput && data.path ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#9aa0a6",
            wordBreak: "break-word",
          }}
        >
          Path: {data.path}
        </div>
      ) : null}

      {isOutput ? (
        <div style={{ marginTop: 12 }}>
          <HistoryChart history={history} />
        </div>
      ) : null}
    </div>
  );
};

export default SchemaNode;

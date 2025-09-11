import React from "react";
import useGraphStore from "../state/useGraphStore";
import { useNodeGraph, valueAsNumber } from "@vizij/node-graph-react";
import { displayValue } from "../lib/display";

const InspectorPanel = () => {
  const { nodes, edges, setNodeData } = useGraphStore();
  const { outputs, setParam } = useNodeGraph();
  const selectedNodes = nodes.filter((n) => n.selected);

  // Show “time” if you have a node with id "time"
  const timeVal = valueAsNumber(outputs?.time);

  // Local drafts so inputs don't immediately revert to node.data while typing
  const [drafts, setDrafts] = React.useState<Record<string, Record<string, string>>>({});

  const setDraft = (nodeId: string, key: string, v: string) => {
    setDrafts((prev) => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] ?? {}), [key]: v },
    }));
  };

  const clearDraft = (nodeId: string, key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      const nodeDraft = { ...(next[nodeId] ?? {}) };
      delete nodeDraft[key];
      if (Object.keys(nodeDraft).length === 0) {
        delete next[nodeId];
      } else {
        next[nodeId] = nodeDraft;
      }
      return next;
    });
  };

  const getDraft = (nodeId: string, key: string, fallback: unknown) => {
    const d = drafts[nodeId]?.[key];
    return d !== undefined ? d : String(fallback ?? "");
  };

  // Live engine update (no editor-state write) for numeric fields
  const onParamLive = (nodeId: string, key: string, value: string) => {
    // Always reflect what the user typed
    setDraft(nodeId, key, value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setParam(nodeId, key, num);
    }
  };

  // Commit numeric value to editor state (called on blur/Enter)
  const commitParam = (nodeId: string, key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setNodeData(nodeId, { [key]: num });
    }
    // Clear draft so future renders reflect committed node.data
    clearDraft(nodeId, key);
  };

  const onBoolParamChange = (nodeId: string, key: string, value: boolean) => {
    setNodeData(nodeId, { [key]: value });
    setParam(nodeId, key, value);
  };

  return (
    <div style={{ borderLeft: "1px solid #444", padding: 15, overflowY: "auto" }}>
      <h2 style={{ marginTop: 0 }}>Inspector</h2>
      <div>
        <strong>Time:</strong> {timeVal !== undefined ? `${timeVal.toFixed(2)}s` : "—"}
      </div>
      <hr style={{ borderColor: "#444" }} />
      {selectedNodes.length > 0 ? (
        selectedNodes.map((node) => {
          const out = outputs?.[node.id]?.out; // default output
          return (
            <div key={node.id}>
              <h3>{node.data.label ?? node.type}</h3>
              <p>ID: {node.id}</p>
              <p>Type: {node.type}</p>
              <div>
                <strong>Output: {displayValue(out)}</strong>
              </div>
              <hr style={{ borderColor: "#444" }} />
              <h4>Inputs</h4>
              {edges.filter((e) => e.target === node.id).length > 0 ? (
                edges
                  .filter((e) => e.target === node.id)
                  .map((edge) => {
                    const srcVal = outputs?.[edge.source];
                    return (
                      <div key={edge.id} style={{ marginBottom: 5 }}>
                        <span style={{ color: "#aaa" }}>
                          {edge.targetHandle ? `${edge.targetHandle.toUpperCase()}: ` : ""}
                        </span>
                        {edge.source} ({displayValue(srcVal)})
                      </div>
                    );
                  })
              ) : (
                <p>No inputs</p>
              )}
              <hr style={{ borderColor: "#444" }} />
              <h4>Parameters</h4>
              {node.type === "slider" ? (
                <div>
                  <div>
                    <label>value</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "value", node.data.value ?? 0)}
                      onChange={(e) => onParamLive(node.id, "value", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "value", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "value", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>min</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "min", node.data.min ?? 0)}
                      onChange={(e) => onParamLive(node.id, "min", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "min", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "min", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>max</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "max", node.data.max ?? 1)}
                      onChange={(e) => onParamLive(node.id, "max", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "max", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "max", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                </div>
              ) : node.type === "multislider" ? (
                <div>
                  <div>
                    <label>x</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "x", node.data.x ?? 0)}
                      onChange={(e) => onParamLive(node.id, "x", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "x", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "x", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>y</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "y", node.data.y ?? 0)}
                      onChange={(e) => onParamLive(node.id, "y", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "y", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "y", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>z</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "z", node.data.z ?? 0)}
                      onChange={(e) => onParamLive(node.id, "z", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "z", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "z", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>min</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "min", node.data.min ?? 0)}
                      onChange={(e) => onParamLive(node.id, "min", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "min", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "min", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                  <div>
                    <label>max</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "max", node.data.max ?? 1)}
                      onChange={(e) => onParamLive(node.id, "max", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "max", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "max", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                </div>
              ) : node.type === "constant" ? (
                <div>
                  <div>
                    <label>value</label>
                    <input
                      type="number"
                      value={getDraft(node.id, "value", node.data.value ?? 0)}
                      onChange={(e) => onParamLive(node.id, "value", e.target.value)}
                      onBlur={(e) => commitParam(node.id, "value", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, "value", (e.target as HTMLInputElement).value); }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                        marginTop: 5,
                      }}
                    />
                  </div>
                </div>
              ) : (
                Object.entries(node.data)
                  .filter(([key]) => key !== "label" && key !== "op" && key !== "inputs")
                  .map(([key, value]) => (
                    <div key={key}>
                      <label>{key}</label>
                      {typeof value === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => onBoolParamChange(node.id, key, e.target.checked)}
                          style={{ marginLeft: 10 }}
                        />
                      ) : (
                        <input
                          type="number"
                          value={getDraft(node.id, key, value)}
                          onChange={(e) => onParamLive(node.id, key, e.target.value)}
                          onBlur={(e) => commitParam(node.id, key, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") commitParam(node.id, key, (e.target as HTMLInputElement).value); }}
                          style={{
                            width: "100%",
                            background: "#1e1e1e",
                            border: "1px solid #555",
                            color: "#f0f0f0",
                            borderRadius: 4,
                            padding: 5,
                            marginTop: 5,
                          }}
                        />
                      )}
                    </div>
                  ))
              )}
            </div>
          );
        })
      ) : (
        <p>Select a node to inspect.</p>
      )}
    </div>
  );
};

export default InspectorPanel;

import React, { useCallback, useMemo, useState } from "react";
import useGraphStore from "../state/useGraphStore";
import {
  useNodeGraph,
  useGraphWrites,
  valueAsNumber,
} from "@vizij/node-graph-react";
import type {
  PortSnapshot,
  ParamSpec,
  Registry,
  ShapeJSON,
} from "@vizij/node-graph-wasm";
import { displayValue } from "../lib/display";
import { useRegistry } from "../state/RegistryContext";

const describeShape = (shape?: ShapeJSON): string => {
  if (!shape) return "unknown";
  return shape.id.toString();
};

const stringify = (value: unknown) =>
  typeof value === "string"
    ? value
    : JSON.stringify(value, (_key, val) => val ?? undefined, 2);

const coerceParamValue = (param: ParamSpec, raw: string) => {
  const trimmed = raw.trim();
  switch (param.ty) {
    case "float": {
      if (!trimmed) return { ui: undefined, wasm: undefined };
      const num = Number(trimmed);
      if (Number.isFinite(num)) {
        return { ui: num, wasm: { float: num } };
      }
      return { error: "Enter a valid number" };
    }
    case "bool":
      return {
        ui: trimmed === "true",
        wasm: { bool: trimmed === "true" },
      };
    case "vec3": {
      const parts = trimmed
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((p) => Number(p))
        .filter((n) => Number.isFinite(n));
      while (parts.length < 3) parts.push(0);
      return {
        ui: parts.slice(0, 3),
        wasm: { vec3: parts.slice(0, 3) },
      };
    }
    case "vector": {
      try {
        const vec = JSON.parse(trimmed);
        if (Array.isArray(vec)) {
          const cleaned = vec
            .map((entry) => Number(entry))
            .filter((n) => Number.isFinite(n));
          return { ui: cleaned, wasm: { vector: cleaned } };
        }
      } catch {
        const cleaned = trimmed
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((entry) => Number(entry))
          .filter((n) => Number.isFinite(n));
        return { ui: cleaned, wasm: { vector: cleaned } };
      }
      return { error: "Enter a numeric array" };
    }
    case "any": {
      if (!trimmed) return { ui: undefined, wasm: undefined };
      try {
        const parsed = JSON.parse(trimmed);
        return { ui: parsed, wasm: parsed };
      } catch (err) {
        return {
          error:
            err instanceof Error ? err.message : "Failed to parse JSON payload",
        };
      }
    }
    default:
      return { ui: trimmed, wasm: { text: trimmed } };
  }
};

const InspectorPanel = () => {
  const { registry } = useRegistry();
  const { nodes, edges, setNodeData, renameNode, updateNodeType, removeEdge } =
    useGraphStore();
  const { setParam, getNodeOutputSnapshot, getNodeOutput, clearWrites } =
    useNodeGraph();
  const writes = useGraphWrites();
  const spec = useGraphStore((state) => state.spec);
  const selectedNodes = nodes.filter((node) => node.selected);

  const timeVal = valueAsNumber(getNodeOutputSnapshot("time", "out"));

  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [specExpanded, setSpecExpanded] = useState(false);
  const specJson = useMemo(() => JSON.stringify(spec, null, 2), [spec]);
  const handleCopySpec = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(specJson).catch(() => {
      /* noop */
    });
  }, [specJson]);

  const setDraft = (nodeId: string, key: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] ?? {}), [key]: value },
    }));
  };

  const clearDraft = (nodeId: string, key: string) => {
    setDrafts((prev) => {
      const copy = { ...prev };
      const nodeDraft = { ...(copy[nodeId] ?? {}) };
      delete nodeDraft[key];
      if (Object.keys(nodeDraft).length === 0) {
        delete copy[nodeId];
      } else {
        copy[nodeId] = nodeDraft;
      }
      return copy;
    });
  };

  const setError = (nodeId: string, key: string, message?: string) => {
    setErrors((prev) => {
      const copy = { ...prev };
      const nodeErrors = { ...(copy[nodeId] ?? {}) };
      if (message) {
        nodeErrors[key] = message;
        copy[nodeId] = nodeErrors;
      } else {
        delete nodeErrors[key];
        if (Object.keys(nodeErrors).length === 0) {
          delete copy[nodeId];
        } else {
          copy[nodeId] = nodeErrors;
        }
      }
      return copy;
    });
  };

  const draftValue = (nodeId: string, key: string, fallback: unknown) => {
    const value = drafts[nodeId]?.[key];
    if (value !== undefined) return value;
    return fallback !== undefined ? String(fallback) : "";
  };

  const handleRename = (nodeId: string, value: string) => {
    renameNode(nodeId, value.trim());
    clearDraft(nodeId, "id");
  };

  const handleTypeChange = (
    nodeId: string,
    nextType: string,
    registryInstance: Registry,
  ) => {
    const signature = registryInstance.nodes.find(
      (entry) => entry.type_id.toLowerCase() === nextType.toLowerCase(),
    );
    const defaults: Record<string, unknown> = {};
    signature?.params.forEach((param) => {
      if (param.default_json) {
        defaults[param.id] = param.default_json;
        setParam(nodeId, param.id, param.default_json as any);
      }
    });
    if (signature?.name) {
      setNodeData(nodeId, { label: signature.name, ...defaults });
    } else {
      setNodeData(nodeId, defaults);
    }
    updateNodeType(nodeId, nextType, defaults);
  };

  const renderParamEditor = (
    nodeId: string,
    param: ParamSpec,
    nodeData: Record<string, unknown>,
  ) => {
    const error = errors[nodeId]?.[param.id];
    const inputType = param.ty === "float" ? "number" : "text";
    const placeholder = param.ty === "vector" ? "e.g. 0, 1, 2" : "";
    const value = draftValue(nodeId, param.id, stringify(nodeData?.[param.id]));

    if (param.ty === "bool") {
      const boolValue = value === "true" || value === "1";
      return (
        <label
          key={`${nodeId}-${param.id}`}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={boolValue}
            onChange={(event) => {
              const checked = event.target.checked;
              setNodeData(nodeId, { [param.id]: checked });
              setParam(nodeId, param.id, { bool: checked } as any);
              clearDraft(nodeId, param.id);
            }}
          />
          {param.label}
        </label>
      );
    }

    return (
      <div key={`${nodeId}-${param.id}`} style={{ marginBottom: 10 }}>
        <label>{param.label}</label>
        <input
          type={inputType}
          value={value}
          placeholder={placeholder}
          onChange={(event) => setDraft(nodeId, param.id, event.target.value)}
          onBlur={(event) => {
            const result = coerceParamValue(param, event.target.value);
            if (result.error) {
              setError(nodeId, param.id, result.error);
              return;
            }
            clearDraft(nodeId, param.id);
            setError(nodeId, param.id);
            if (result.ui !== undefined) {
              setNodeData(nodeId, { [param.id]: result.ui });
            }
            if (result.wasm !== undefined) {
              setParam(nodeId, param.id, result.wasm as any);
            }
          }}
          style={{
            width: "100%",
            background: "#1e1e1e",
            border: "1px solid #555",
            color: "#f0f0f0",
            borderRadius: 4,
            padding: 5,
            marginTop: 4,
          }}
        />
        {error ? (
          <div style={{ color: "#ff6b6b", marginTop: 4 }}>{error}</div>
        ) : null}
      </div>
    );
  };

  const renderOutputs = (outputs?: Record<string, PortSnapshot>) => {
    if (!outputs) return null;
    return Object.entries(outputs).map(([key, snapshot]) => (
      <div
        key={key}
        style={{
          marginBottom: 6,
          padding: 6,
          border: "1px solid #333",
          borderRadius: 4,
          background: "#1c1c1c",
        }}
      >
        <div style={{ fontWeight: 600 }}>{key}</div>
        <div style={{ fontSize: 12, color: "#9aa0a6" }}>
          Shape: {JSON.stringify(snapshot.shape?.id)}
        </div>
        <pre
          style={{
            marginTop: 4,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            color: "#d0d0d0",
          }}
        >
          {stringify(snapshot.value)}
        </pre>
      </div>
    ));
  };

  return (
    <div
      style={{ borderLeft: "1px solid #444", padding: 15, overflowY: "auto" }}
    >
      <h2 style={{ marginTop: 0 }}>Inspector</h2>
      <div>
        <strong>Time:</strong>{" "}
        {timeVal !== undefined ? `${timeVal.toFixed(2)}s` : "—"}
      </div>
      <section style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ marginBottom: 0 }}>Graph JSON</h3>
          <button
            onClick={() => setSpecExpanded((prev) => !prev)}
            style={{
              border: "1px solid #555",
              background: "#2a2a2a",
              color: "#f0f0f0",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 12,
            }}
          >
            {specExpanded ? "Hide" : "Show"}
          </button>
          {specExpanded ? (
            <button
              onClick={handleCopySpec}
              style={{
                border: "1px solid #555",
                background: "#2a2a2a",
                color: "#f0f0f0",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              Copy
            </button>
          ) : null}
        </div>
        {specExpanded ? (
          <pre
            style={{
              marginTop: 8,
              background: "#1c1c1c",
              borderRadius: 4,
              border: "1px solid #333",
              padding: 8,
              fontSize: 11,
              maxHeight: 260,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {specJson}
          </pre>
        ) : null}
      </section>
      <section style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Latest Writes</h3>
        {writes.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9aa0a6" }}>
            No writes yet — connect an Output node to emit typed paths.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {writes.map((write, idx) => (
              <div
                key={`${write.path}-${idx}`}
                style={{
                  padding: 8,
                  border: "1px solid #333",
                  borderRadius: 4,
                  background: "#1c1c1c",
                  fontSize: 12,
                  color: "#d0d0d0",
                }}
              >
                <div style={{ fontWeight: 600 }}>{write.path}</div>
                <div style={{ marginTop: 4 }}>
                  {displayValue(write.value)}
                  <span style={{ color: "#888", marginLeft: 6 }}>
                    ({write.shape?.id ?? "Unknown"})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {writes.length > 0 ? (
          <button
            onClick={() => clearWrites()}
            style={{
              marginTop: 10,
              padding: "6px 12px",
              background: "#2a2a2a",
              border: "1px solid #555",
              borderRadius: 4,
              color: "#f0f0f0",
              cursor: "pointer",
            }}
          >
            Clear writes
          </button>
        ) : null}
      </section>
      <hr style={{ borderColor: "#444" }} />
      {selectedNodes.length === 0 ? (
        <p>Select a node to inspect its parameters.</p>
      ) : null}
      {selectedNodes.map((node) => {
        const signature = registry?.nodes.find(
          (entry) => entry.type_id.toLowerCase() === node.type.toLowerCase(),
        );
        const outputSnapshot = getNodeOutputSnapshot(node.id, "out");
        const outputs = renderOutputs(getNodeOutput(node.id));
        const incomingEdges = edges.filter((edge) => edge.target === node.id);

        return (
          <div key={node.id} style={{ marginBottom: 24 }}>
            <h3>{node.data.label ?? signature?.name ?? node.type}</h3>
            <div style={{ fontSize: 12, color: "#9aa0a6" }}>
              Output Shape: {describeShape(outputSnapshot?.shape)}
            </div>
            <pre
              style={{
                background: "#1c1c1c",
                padding: 6,
                borderRadius: 4,
                fontSize: 11,
                whiteSpace: "pre-wrap",
                marginTop: 6,
              }}
            >
              {displayValue(outputSnapshot)}
            </pre>

            <section style={{ marginTop: 12 }}>
              <h4>Identity</h4>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <label>Name</label>
                  <input
                    type="text"
                    value={draftValue(node.id, "label", node.data.label ?? "")}
                    onChange={(event) =>
                      setDraft(node.id, "label", event.target.value)
                    }
                    onBlur={(event) => {
                      setNodeData(node.id, { label: event.target.value });
                      clearDraft(node.id, "label");
                    }}
                    style={{
                      width: "100%",
                      background: "#1e1e1e",
                      border: "1px solid #555",
                      color: "#f0f0f0",
                      borderRadius: 4,
                      padding: 5,
                    }}
                  />
                </div>
                <div>
                  <label>ID</label>
                  <input
                    type="text"
                    value={draftValue(node.id, "id", node.id)}
                    onChange={(event) =>
                      setDraft(node.id, "id", event.target.value)
                    }
                    onBlur={(event) =>
                      handleRename(node.id, event.target.value)
                    }
                    style={{
                      width: "100%",
                      background: "#1e1e1e",
                      border: "1px solid #555",
                      color: "#f0f0f0",
                      borderRadius: 4,
                      padding: 5,
                    }}
                  />
                </div>
                <div>
                  <label>Type</label>
                  <select
                    value={node.type}
                    onChange={(event) =>
                      registry &&
                      handleTypeChange(node.id, event.target.value, registry)
                    }
                    style={{
                      width: "100%",
                      background: "#1e1e1e",
                      border: "1px solid #555",
                      color: "#f0f0f0",
                      borderRadius: 4,
                      padding: 5,
                    }}
                  >
                    {registry?.nodes.map((entry) => (
                      <option
                        key={entry.type_id}
                        value={entry.type_id.toLowerCase()}
                      >
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
                {node.type === "output" ? (
                  <div>
                    <label>Typed Path</label>
                    <input
                      type="text"
                      value={draftValue(node.id, "path", node.data.path ?? "")}
                      onChange={(event) =>
                        setDraft(node.id, "path", event.target.value)
                      }
                      onBlur={(event) => {
                        const value = event.target.value;
                        setNodeData(node.id, { path: value });
                        setParam(node.id, "path", value);
                        clearDraft(node.id, "path");
                      }}
                      style={{
                        width: "100%",
                        background: "#1e1e1e",
                        border: "1px solid #555",
                        color: "#f0f0f0",
                        borderRadius: 4,
                        padding: 5,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section style={{ marginTop: 16 }}>
              <h4>Parameters</h4>
              {signature?.params?.length ? (
                signature.params.map((param) =>
                  renderParamEditor(node.id, param, node.data as any),
                )
              ) : (
                <div style={{ fontSize: 12, color: "#9aa0a6" }}>
                  No editable parameters exposed.
                </div>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              <h4>Outputs</h4>
              {outputs}
            </section>

            <section style={{ marginTop: 16 }}>
              <h4>Connections</h4>
              {incomingEdges.length === 0 ? (
                <div style={{ fontSize: 12, color: "#9aa0a6" }}>
                  No incoming inputs
                </div>
              ) : (
                incomingEdges.map((edge) => (
                  <div
                    key={edge.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                      padding: "6px 8px",
                      borderRadius: 4,
                      background: "#1c1c1c",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12 }}>
                      <div>
                        {edge.source} → {edge.targetHandle ?? "in"}
                      </div>
                      {(() => {
                        const snapshot = getNodeOutputSnapshot(
                          edge.source,
                          edge.sourceHandle ?? "out",
                        );
                        if (!snapshot) {
                          return (
                            <div style={{ color: "#9aa0a6", marginTop: 4 }}>
                              No signal
                            </div>
                          );
                        }
                        return (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ color: "#9aa0a6" }}>
                              Shape: {describeShape(snapshot.shape)}
                            </span>
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 11,
                                color: "#d0d0d0",
                              }}
                            >
                              {displayValue(snapshot)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => removeEdge(edge.id)}
                      style={{
                        border: "1px solid #444",
                        background: "transparent",
                        color: "#ff6b6b",
                        borderRadius: 4,
                        cursor: "pointer",
                        padding: "4px 8px",
                        fontSize: 12,
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                ))
              )}
            </section>

            <hr style={{ borderColor: "#444", marginTop: 20 }} />
          </div>
        );
      })}
    </div>
  );
};

export default InspectorPanel;

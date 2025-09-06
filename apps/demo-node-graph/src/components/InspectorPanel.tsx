import useGraphStore from "../state/useGraphStore";
import { useNodeGraph, valueAsNumber, valueAsBool } from "@vizij/node-graph-react";

function displayValue(v: any): string {
  if (!v) return "N/A";
  if ("float" in v) return v.float.toFixed(3);
  if ("bool" in v) return v.bool ? "true" : "false";
  if ("vec3" in v) return `[${v.vec3.map((n: number) => n.toFixed(3)).join(", ")}]`;
  return "N/A";
}

const InspectorPanel = () => {
  const { nodes, edges, setNodeData } = useGraphStore();
  const { outputs, setParam } = useNodeGraph();
  const selectedNodes = nodes.filter((n) => n.selected);

  // Show “time” if you have a node with id "time"
  const timeVal = valueAsNumber(outputs?.time);

  const onParamChange = (nodeId: string, key: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setNodeData(nodeId, { [key]: num });
      setParam(nodeId, key, num);
    }
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
          const out = outputs?.[node.id]; // node's current output
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
              {Object.entries(node.data)
                .filter(([key]) => key !== "label" && key !== "op")
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
                        value={String(value)}
                        onChange={(e) => onParamChange(node.id, key, e.target.value)}
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
                ))}
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

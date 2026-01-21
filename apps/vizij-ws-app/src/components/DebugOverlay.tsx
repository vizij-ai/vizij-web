import { useState, useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

export function DebugOverlay() {
  const { stepHz, ready, namespace, inputConstraints, outputPaths } =
    useVizijRuntime();
  const [visible, setVisible] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("vizij-ws-debug") === "true";
    }
    return false;
  });
  const [showNodes, setShowNodes] = useState(false);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vizij-ws-debug", String(visible));
    }
  }, [visible]);

  // Log all nodes to console when ready
  useEffect(() => {
    if (!ready) return;
    console.log("[vizij-ws] Namespace:", namespace);
    console.log("[vizij-ws] Input constraints:", inputConstraints);
    console.log("[vizij-ws] Output paths:", outputPaths);
  }, [ready, namespace, inputConstraints, outputPaths]);

  const inputPaths = useMemo(
    () => Object.keys(inputConstraints).sort(),
    [inputConstraints]
  );

  const sortedOutputPaths = useMemo(
    () => [...outputPaths].sort(),
    [outputPaths]
  );

  if (!ready) return null;

  const fps = stepHz && Number.isFinite(stepHz) ? stepHz.toFixed(1) : "—";

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 2000,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {visible ? "Hide Debug" : "Debug"}
      </button>
      {visible && (
        <div
          style={{
            marginTop: 8,
            minWidth: 280,
            maxWidth: 400,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(12,12,16,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: 10,
            color: "#edf2ff",
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 6, opacity: 0.7 }}>Orchestrator</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px 12px",
              marginBottom: 8,
            }}
          >
            <span style={{ opacity: 0.7 }}>Namespace:</span>
            <span style={{ fontFamily: "monospace" }}>{namespace ?? "—"}</span>
            <span style={{ opacity: 0.7 }}>Step Hz:</span>
            <span>{fps} fps</span>
            <span style={{ opacity: 0.7 }}>Inputs:</span>
            <span>{inputPaths.length}</span>
            <span style={{ opacity: 0.7 }}>Outputs:</span>
            <span>{sortedOutputPaths.length}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowNodes((v) => !v)}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            {showNodes ? "Hide Nodes" : "Show All Nodes"}
          </button>

          {showNodes && (
            <>
              {inputPaths.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      opacity: 0.7,
                      marginBottom: 4,
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      paddingBottom: 2,
                    }}
                  >
                    Inputs ({inputPaths.length})
                  </div>
                  {inputPaths.map((path) => (
                    <div
                      key={path}
                      style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        padding: "2px 0",
                        wordBreak: "break-all",
                      }}
                    >
                      {path}
                    </div>
                  ))}
                </div>
              )}

              {sortedOutputPaths.length > 0 && (
                <div>
                  <div
                    style={{
                      opacity: 0.7,
                      marginBottom: 4,
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      paddingBottom: 2,
                    }}
                  >
                    Outputs ({sortedOutputPaths.length})
                  </div>
                  {sortedOutputPaths.map((path) => (
                    <div
                      key={path}
                      style={{
                        fontFamily: "monospace",
                        fontSize: 10,
                        padding: "2px 0",
                        wordBreak: "break-all",
                      }}
                    >
                      {path}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  addRuntimeStatusListener,
  type RuntimeDebugStatus,
} from "../lib/runtimeDebug";

type RuntimeRow = RuntimeDebugStatus & { stale: boolean };

export function RuntimeDebugOverlay() {
  const [rows, setRows] = useState<Record<string, RuntimeRow>>({});
  const [visible, setVisible] = useState(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("vizij-debug-panel") === "true"
      : false,
  );

  useEffect(() => {
    const remove = addRuntimeStatusListener((status) => {
      setRows((prev) => {
        const next = { ...prev };
        next[status.namespace] = {
          ...status,
          stale: false,
        };
        return next;
      });
    });
    return remove;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setRows((prev) => {
        const next: Record<string, RuntimeRow> = {};
        Object.entries(prev).forEach(([ns, row]) => {
          const stale = now - row.timestamp > 5000;
          next[ns] = { ...row, stale };
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vizij-debug-panel", String(visible));
    }
  }, [visible]);

  const sorted = useMemo(
    () =>
      Object.values(rows).sort((a, b) =>
        (a.label ?? a.namespace).localeCompare(b.label ?? b.namespace),
      ),
    [rows],
  );

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        top: 12,
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
        {visible ? "Hide Vizij Stepping" : "Show Vizij Stepping"}
      </button>
      {visible && (
        <div
          style={{
            marginTop: 8,
            width: 280,
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              opacity: 0.8,
            }}
          >
            <span>Namespace</span>
            <span style={{ textAlign: "right" }}>Mode · FPS</span>
          </div>
          {sorted.map((row) => {
            const mode = deriveMode(row);
            const fps =
              row.stepHz && Number.isFinite(row.stepHz)
                ? row.stepHz.toFixed(1)
                : "—";
            return (
              <div
                key={row.namespace}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 6,
                  padding: "6px 8px",
                  marginBottom: 4,
                  borderRadius: 6,
                  background: row.stale
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.08)",
                  border: row.driver
                    ? "1px solid rgba(80,200,255,0.5)"
                    : "1px solid rgba(255,255,255,0.05)",
                  opacity: row.visible ? 1 : 0.72,
                }}
              >
                <div>
                  <strong>{row.label ?? row.namespace}</strong>
                  <div style={{ opacity: 0.7 }}>
                    ns: {row.namespace}
                    {row.driver ? " · driver" : ""}
                    {!row.visible ? " · hidden" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {mode} · {fps} fps
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function deriveMode(row: RuntimeDebugStatus): string {
  if (row.visible) {
    if (row.driver && row.autostart) return "raf (driver)";
    if (row.autostart) return "raf";
    return "paused";
  }
  if (row.driver && row.hiddenStepHz > 0) {
    return `${row.hiddenStepHz.toFixed(1)} Hz`;
  }
  return "paused";
}

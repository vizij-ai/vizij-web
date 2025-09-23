import React, { useCallback } from "react";
import { useEditorStore } from "../store/useEditorStore";

/**
 * PersistencePanel
 * - Export current canonical spec (using store.nodesToSpec) to a JSON file
 * - Import a canonical spec JSON file and load into the editor store (specToNodes)
 * - Quick localStorage Save/Load helpers for convenience
 */

export default function PersistencePanel(): JSX.Element {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setSpec = useEditorStore((s) => s.setSpec);
  const nodesToSpec = useEditorStore((s) => s.nodesToSpec);
  // const specToNodes = useEditorStore((s) => s.specToNodes);

  const exportSpec = useCallback(() => {
    // Build canonical GraphSpec (no edges) and persist layout separately
    const graph = nodesToSpec(nodes, edges);
    const layout: Record<string, { x: number; y: number }> = Object.fromEntries(
      nodes.map((n) => [
        n.id,
        { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      ]),
    );
    const payload = { graph, layout };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vizij-graph.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [nodes, edges, nodesToSpec]);

  const onFile = useCallback(
    (f?: File) => {
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const txt = String(ev.target?.result ?? "");
          const parsed = JSON.parse(txt);
          // setSpec accepts either plain GraphSpec or { graph, layout }
          setSpec(parsed);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to import spec:", err);
          window.alert("Failed to parse spec JSON. See console for details.");
        }
      };
      reader.readAsText(f);
    },
    [setSpec],
  );

  const importFromInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      onFile(f);
      e.currentTarget.value = "";
    },
    [onFile],
  );

  const saveToLocal = useCallback(() => {
    try {
      const graph = nodesToSpec(nodes, edges);
      const layout: Record<string, { x: number; y: number }> =
        Object.fromEntries(
          nodes.map((n) => [
            n.id,
            { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          ]),
        );
      const payload = { graph, layout };
      // Keep key name for backward-compat while storing composite payload
      localStorage.setItem("vizij_graph_spec", JSON.stringify(payload));
      window.alert("Graph saved to localStorage (vizij_graph_spec)");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save to localStorage:", err);
      window.alert("Failed to save to localStorage. See console.");
    }
  }, [nodes, edges, nodesToSpec]);

  const loadFromLocal = useCallback(() => {
    try {
      const txt = localStorage.getItem("vizij_graph_spec");
      if (!txt) {
        window.alert("No saved graph found in localStorage.");
        return;
      }
      const parsed = JSON.parse(txt);
      // parsed can be GraphSpec or { graph, layout }
      setSpec(parsed);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load from localStorage:", err);
      window.alert("Failed to load from localStorage. See console.");
    }
  }, [setSpec]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button onClick={exportSpec} style={{ padding: "6px 10px" }}>
        Export Spec
      </button>

      <label
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          background: "transparent",
        }}
      >
        <input
          type="file"
          accept=".json,application/json"
          onChange={importFromInput}
          style={{ display: "none" }}
        />
        <span
          style={{
            padding: "6px 10px",
            border: "1px solid #ccc",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Import Spec
        </span>
      </label>

      <button onClick={saveToLocal} style={{ padding: "6px 10px" }}>
        Save (local)
      </button>
      <button onClick={loadFromLocal} style={{ padding: "6px 10px" }}>
        Load (local)
      </button>
    </div>
  );
}

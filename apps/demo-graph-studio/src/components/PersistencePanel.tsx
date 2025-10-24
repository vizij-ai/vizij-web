import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import {
  listNodeGraphFixtures,
  loadNodeGraphSpec,
  normalizeGraphSpec,
} from "@vizij/node-graph-react";

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
  const [fixtures, setFixtures] = useState<string[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [selectedFixture, setSelectedFixture] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setFixturesLoading(true);
      try {
        const list = await listNodeGraphFixtures();
        if (!mounted) return;
        const sorted = [...list].sort((a, b) => a.localeCompare(b));
        setFixtures(sorted);
        if (sorted.length > 0) {
          setSelectedFixture((prev) =>
            prev && sorted.includes(prev) ? prev : sorted[0],
          );
        }
        setFixtureError(null);
      } catch (err: any) {
        if (!mounted) return;
        setFixtureError(err?.message ?? String(err));
      } finally {
        if (mounted) {
          setFixturesLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
      console.error("Failed to load from localStorage:", err);
      window.alert("Failed to load from localStorage. See console.");
    }
  }, [setSpec]);

  const loadFixture = useCallback(async () => {
    if (!selectedFixture) {
      window.alert("Select a fixture to load.");
      return;
    }
    try {
      const spec = await loadNodeGraphSpec(selectedFixture);
      setSpec(spec);
    } catch (err) {
      console.error("Failed to load fixture:", err);
      window.alert("Failed to load fixture graph. See console for details.");
    }
  }, [selectedFixture, setSpec]);

  const normalizeCurrent = useCallback(async () => {
    try {
      const graph = nodesToSpec(nodes, edges);
      const normalized = await normalizeGraphSpec(graph);
      setSpec(normalized);
      window.alert("Current graph normalized via wasm spec normalizer.");
    } catch (err) {
      console.error("Failed to normalize graph:", err);
      window.alert("Graph normalization failed. See console for details.");
    }
  }, [nodes, edges, nodesToSpec, setSpec]);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={exportSpec}
        style={{
          padding: "6px 10px",
          background: "rgba(96,165,250,0.2)",
          border: "1px solid rgba(96,165,250,0.4)",
          borderRadius: 6,
          color: "#bfdbfe",
          cursor: "pointer",
        }}
      >
        Export Spec
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={importFromInput}
        style={{ display: "none" }}
      />
      <button
        type="button"
        onClick={triggerFileDialog}
        style={{
          padding: "6px 10px",
          border: "1px solid rgba(148,163,184,0.35)",
          borderRadius: 6,
          cursor: "pointer",
          color: "#e2e8f0",
          background: "rgba(148,163,184,0.15)",
        }}
      >
        Load From File
      </button>

      <button
        onClick={saveToLocal}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid rgba(94,234,212,0.4)",
          background: "rgba(94,234,212,0.2)",
          color: "#ccfbf1",
          cursor: "pointer",
        }}
      >
        Save (local)
      </button>
      <button
        onClick={loadFromLocal}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid rgba(94,234,212,0.4)",
          background: "rgba(94,234,212,0.15)",
          color: "#a7f3d0",
          cursor: "pointer",
        }}
      >
        Load (local)
      </button>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={selectedFixture}
          onChange={(event) => setSelectedFixture(event.target.value)}
          disabled={fixturesLoading || fixtures.length === 0}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.6)",
            color: "#e2e8f0",
          }}
        >
          {fixtures.length === 0 ? (
            <option value="">
              {fixturesLoading ? "Loading fixtures…" : "No fixtures"}
            </option>
          ) : (
            fixtures.map((fixture) => (
              <option key={fixture} value={fixture}>
                {fixture}
              </option>
            ))
          )}
        </select>
        <button
          onClick={loadFixture}
          disabled={fixturesLoading || !selectedFixture}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid rgba(248,250,252,0.2)",
            background: "rgba(244,114,182,0.2)",
            color: "#fbcfe8",
            cursor: "pointer",
            opacity: fixturesLoading || !selectedFixture ? 0.6 : 1,
          }}
        >
          Load Fixture
        </button>
      </div>

      <button
        onClick={normalizeCurrent}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid rgba(165,180,252,0.35)",
          background: "rgba(129,140,248,0.2)",
          color: "#c7d2fe",
          cursor: "pointer",
        }}
      >
        Normalize Spec
      </button>

      {fixtureError ? (
        <span style={{ color: "#fda4af", fontSize: 12 }}>
          Fixture error: {fixtureError}
        </span>
      ) : null}
    </div>
  );
}

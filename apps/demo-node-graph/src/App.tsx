// App.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { NodeGraphProvider } from "@vizij/node-graph-react"; // new provider
import useGraphStore from "./state/useGraphStore";
import GraphCanvas from "./components/GraphCanvas";
import ControlsBar from "./components/ControlsBar";
import InspectorPanel from "./components/InspectorPanel";
import NodePalette from "./components/NodePalette";
import { nodesToSpec } from "./lib/graph";
import { loadGraphFromLocalStorage } from "./lib/persistence";

export default function App() {
  const { nodes, edges, setGraph } = useGraphStore();

  // load saved graph (your current behavior)
  useEffect(() => {
    const saved = loadGraphFromLocalStorage();
    if (saved) setGraph(saved);
  }, [setGraph]);

  // Build GraphSpec with stable identity to avoid unnecessary provider reloads
  // (e.g., selection/drag causing nodes array identity changes). This prevents
  // clobbering live setParam updates while editing in the Inspector.
  const specCacheRef = useRef<{ json: string; spec: ReturnType<typeof nodesToSpec> | null }>({
    json: "",
    spec: null,
  });

  const spec = useMemo(() => {
    const next = nodesToSpec(nodes, edges);
    const json = JSON.stringify(next);
    const prev = specCacheRef.current;
    if (prev.spec && prev.json === json) {
      return prev.spec;
    }
    specCacheRef.current = { json, spec: next };
    return next;
  }, [nodes, edges]);

  return (
    <NodeGraphProvider spec={spec} autostart updateHz={30}>
      <div className="app">
        <NodePalette />
        <main style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
          <ControlsBar />
          <GraphCanvas />
        </main>
        <InspectorPanel />
      </div>
    </NodeGraphProvider>
  );
}

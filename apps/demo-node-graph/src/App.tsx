// App.tsx
import React, { useEffect, useMemo } from "react";
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

  // build GraphSpec whenever editor state changes
  const spec = useMemo(() => nodesToSpec(nodes, edges), [nodes, edges]);

  return (
    <NodeGraphProvider spec={spec} autostart>
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

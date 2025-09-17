// App.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { NodeGraphProvider } from "@vizij/node-graph-react";
import useGraphStore from "./state/useGraphStore";
import GraphCanvas from "./components/GraphCanvas";
import ControlsBar from "./components/ControlsBar";
import InspectorPanel from "./components/InspectorPanel";
import NodePalette from "./components/NodePalette";
import { nodesToSpec } from "./lib/graph";
import { loadGraphFromLocalStorage } from "./lib/persistence";
import { RegistryProvider, useRegistry } from "./state/RegistryContext";

const GraphApp: React.FC = () => {
  const { registry, loading, error } = useRegistry();
  const { nodes, edges, setGraph } = useGraphStore();

  useEffect(() => {
    const saved = loadGraphFromLocalStorage();
    if (saved) setGraph(saved);
  }, [setGraph]);

  const specCacheRef = useRef<{
    json: string;
    spec: ReturnType<typeof nodesToSpec> | null;
  }>({ json: "", spec: null });

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

  if (loading) {
    return <div style={{ padding: 24 }}>Loading node schema…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: "#ff6b6b" }}>
        Failed to load node schema: {error}
      </div>
    );
  }

  if (!registry) {
    return (
      <div style={{ padding: 24 }}>
        Schema unavailable. Please try refreshing the page.
      </div>
    );
  }

  return (
    <NodeGraphProvider spec={spec} autostart={false} updateHz={30}>
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
};

export default function App() {
  return (
    <RegistryProvider>
      <GraphApp />
    </RegistryProvider>
  );
}

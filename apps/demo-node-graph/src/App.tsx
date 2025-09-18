// App.tsx
import React, { useCallback, useEffect, useState } from "react";
import { NodeGraphProvider } from "@vizij/node-graph-react";
import useGraphStore from "./state/useGraphStore";
import GraphCanvas from "./components/GraphCanvas";
import ControlsBar from "./components/ControlsBar";
import InspectorPanel from "./components/InspectorPanel";
import NodePalette from "./components/NodePalette";
import {
  listSavedGraphs,
  loadGraphFromLocalStorage,
  saveGraphToLocalStorage,
  deleteGraphFromLocalStorage,
  loadActiveGraphSelection,
  storeActiveGraphSelection,
  clearActiveGraphSelection,
  type GraphSelection,
} from "./lib/persistence";
import {
  graphPresets,
  getPresetById,
  clonePresetGraph,
  type GraphPreset,
} from "./assets/graph-presets";
import { RegistryProvider, useRegistry } from "./state/RegistryContext";
import { shallow } from "zustand/shallow";

const GraphApp: React.FC = () => {
  const { registry, loading, error } = useRegistry();
  const { spec, setGraph, nodes, edges } = useGraphStore(
    (state) => ({
      spec: state.spec,
      setGraph: state.setGraph,
      nodes: state.nodes,
      edges: state.edges,
    }),
    shallow,
  );
  const [savedGraphs, setSavedGraphs] = useState<string[]>(() =>
    listSavedGraphs(),
  );
  const [activeSelection, setActiveSelection] = useState<GraphSelection | null>(
    null,
  );

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId);
      if (!preset) return false;
      setGraph(clonePresetGraph(preset));
      const selection: GraphSelection = { type: "preset", name: preset.id };
      setActiveSelection(selection);
      storeActiveGraphSelection(selection);
      return true;
    },
    [setGraph],
  );

  const applySavedGraph = useCallback(
    (name: string) => {
      const graph = loadGraphFromLocalStorage(name);
      if (!graph) return false;
      setGraph(graph);
      const selection: GraphSelection = { type: "saved", name };
      setActiveSelection(selection);
      storeActiveGraphSelection(selection);
      return true;
    },
    [setGraph],
  );

  useEffect(() => {
    const selection = loadActiveGraphSelection();
    if (selection) {
      if (selection.type === "saved") {
        if (applySavedGraph(selection.name)) return;
      } else if (selection.type === "preset") {
        if (applyPreset(selection.name)) return;
      }
    }
    applyPreset(graphPresets[0].id);
  }, [applyPreset, applySavedGraph]);

  const refreshSavedGraphs = useCallback(() => {
    setSavedGraphs(listSavedGraphs());
  }, []);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      applyPreset(presetId);
    },
    [applyPreset],
  );

  const handleSaveGraph = useCallback(() => {
    const defaultName =
      activeSelection?.type === "saved" ? activeSelection.name : "My Graph";
    const name = window.prompt("Enter a name for this graph", defaultName);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    if (savedGraphs.includes(trimmed)) {
      const overwrite = window.confirm(
        `A graph named "${trimmed}" already exists. Overwrite?`,
      );
      if (!overwrite) return;
    }

    saveGraphToLocalStorage(trimmed, { nodes, edges });
    refreshSavedGraphs();
    const selection: GraphSelection = { type: "saved", name: trimmed };
    setActiveSelection(selection);
    storeActiveGraphSelection(selection);
  }, [activeSelection, edges, nodes, refreshSavedGraphs, savedGraphs]);

  const handleLoadSavedGraph = useCallback(
    (name: string) => {
      if (!applySavedGraph(name)) {
        window.alert(`Saved graph "${name}" could not be loaded.`);
      }
    },
    [applySavedGraph],
  );

  const handleDeleteSavedGraph = useCallback(
    (name: string) => {
      const confirmed = window.confirm(
        `Delete saved graph "${name}"? This cannot be undone.`,
      );
      if (!confirmed) return;
      deleteGraphFromLocalStorage(name);
      refreshSavedGraphs();
      if (activeSelection?.type === "saved" && activeSelection.name === name) {
        setActiveSelection(null);
        clearActiveGraphSelection();
      }
    },
    [activeSelection, refreshSavedGraphs],
  );

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
    <NodeGraphProvider spec={spec} autostart={false} updateHz={5}>
      <div className="app">
        <NodePalette />
        <main style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
          <ControlsBar
            presets={graphPresets}
            activeSelection={activeSelection}
            savedGraphs={savedGraphs}
            onPresetChange={handlePresetChange}
            onSaveGraph={handleSaveGraph}
            onLoadSavedGraph={handleLoadSavedGraph}
            onDeleteSavedGraph={handleDeleteSavedGraph}
          />
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

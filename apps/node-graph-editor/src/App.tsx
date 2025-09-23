import React from "react";
import { RegistryProvider } from "./contexts/RegistryProvider";
import { GraphProvider } from "@vizij/node-graph-react";
import { useEditorStore } from "./store/useEditorStore";
import EditorCanvas from "./components/EditorCanvas";
import NodePalette from "./components/NodePalette";
import InspectorPanel from "./components/InspectorPanel";
import TransportBar from "./components/TransportBar";
import PersistencePanel from "./components/PersistencePanel";
import ConnectionsAssistant from "./components/ConnectionsAssistant";

/**
 * App shell for node-graph-editor.
 * - Wraps the editor UI with RegistryProvider and GraphProvider
 * - GraphProvider configured to default to interval playback at 60Hz
 * - Layout composes Palette | Canvas | Inspector with TransportBar and persistence controls
 */

function AppShell(): JSX.Element {
  return (
    <div
      className="nge-root"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <header
        className="nge-header"
        style={{
          padding: 8,
          borderBottom: "1px solid #e6e6e6",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <strong>Vizij — Node Graph Editor</strong>
        <div style={{ marginLeft: "auto" }}>
          <PersistencePanel />
        </div>
      </header>

      <TransportBar />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside
          className="nge-palette"
          style={{
            width: 260,
            borderRight: "1px solid #e6e6e6",
            padding: 12,
            overflow: "auto",
            background: "#fafafa",
          }}
        >
          <NodePalette />
        </aside>

        <main
          className="nge-canvas"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            background: "#fff",
            position: "relative",
          }}
        >
          <div style={{ margin: "12px", flex: 1 }}>
            <EditorCanvas />
          </div>
          <ConnectionsAssistant />
        </main>

        <aside
          className="nge-inspector"
          style={{
            width: 360,
            borderLeft: "1px solid #e6e6e6",
            padding: 12,
            overflow: "auto",
            background: "#fafafa",
          }}
        >
          <InspectorPanel />
        </aside>
      </div>

      <footer
        className="nge-transport"
        style={{
          borderTop: "1px solid #e6e6e6",
          padding: 8,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ color: "#444" }}>Status: editing</div>
      </footer>
    </div>
  );
}

export default function App(): JSX.Element {
  // Wire the editor's canonical GraphSpec into the runtime so graphs actually load and evaluate.
  // Only positions are persisted separately; the runtime wiring is reconstructed from inputs.
  const spec = useEditorStore((s) => s.spec);

  return (
    <RegistryProvider>
      <GraphProvider
        spec={spec}
        autoStart={false}
        autoMode="interval"
        updateHz={60}
      >
        <AppShell />
      </GraphProvider>
    </RegistryProvider>
  );
}

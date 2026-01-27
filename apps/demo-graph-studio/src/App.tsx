import React, { useState } from "react";
import { GraphProvider } from "@vizij/node-graph-react";
import type { JSX } from "react/jsx-runtime";
import { RegistryProvider } from "./contexts/RegistryProvider";
import { useEditorStore } from "./store/useEditorStore";
import EditorCanvas from "./components/EditorCanvas";
import NodePalette from "./components/NodePalette";
import InputPanel from "./components/InputPanel";
import InspectorPanel from "./components/InspectorPanel";
import TransportBar from "./components/TransportBar";
import PersistencePanel from "./components/PersistencePanel";
import ConnectionsAssistant from "./components/ConnectionsAssistant";
import ExpressionAuthoringPanel from "./components/ExpressionAuthoringPanel";

/**
 * App shell for node-graph-editor.
 * - Wraps the editor UI with RegistryProvider and GraphProvider
 * - GraphProvider configured to default to interval playback at 60Hz
 * - Layout composes Palette | Canvas | Inspector with TransportBar and persistence controls
 */

function AppShell(): JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [inputsOpen, setInputsOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

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
          padding: "10px 16px",
          borderBottom: "1px solid rgba(148,163,184,0.25)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(15,23,42,0.95)",
          color: "#e2e8f0",
        }}
      >
        <strong style={{ fontSize: 16, letterSpacing: 0.2 }}>
          Vizij — Node Graph Editor
        </strong>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setInputsOpen((prev) => !prev)}
            style={{
              background: inputsOpen
                ? "rgba(251,191,36,0.2)"
                : "rgba(148,163,184,0.15)",
              color: "#fde68a",
              border: "1px solid rgba(251,191,36,0.45)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {inputsOpen ? "Hide Inputs" : "Show Inputs"}
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen((prev) => !prev)}
            style={{
              background: paletteOpen
                ? "rgba(59,130,246,0.2)"
                : "rgba(148,163,184,0.15)",
              color: "#bfdbfe",
              border: "1px solid rgba(59,130,246,0.5)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {paletteOpen ? "Hide Palette" : "Show Palette"}
          </button>
          <button
            type="button"
            onClick={() => setInspectorOpen((prev) => !prev)}
            style={{
              background: inspectorOpen
                ? "rgba(16,185,129,0.18)"
                : "rgba(148,163,184,0.15)",
              color: "#bbf7d0",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {inspectorOpen ? "Hide Inspector" : "Show Inspector"}
          </button>
          <PersistencePanel />
        </div>
      </header>

      <TransportBar />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {paletteOpen ? (
          <aside
            className="nge-palette"
            style={{
              width: 320,
              borderRight: "1px solid rgba(148,163,184,0.25)",
              padding: 12,
              overflow: "auto",
              background: "rgba(30,41,59,0.85)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ExpressionAuthoringPanel />
              <NodePalette />
            </div>
          </aside>
        ) : null}
        {inputsOpen ? <InputPanel /> : null}

        <main
          className="nge-canvas"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            background: "linear-gradient(145deg,#0f172a 0%,#020617 100%)",
            position: "relative",
          }}
        >
          <div style={{ margin: "12px", flex: 1, minWidth: 0 }}>
            <EditorCanvas />
          </div>
          <ConnectionsAssistant />
        </main>

        {inspectorOpen ? (
          <aside
            className="nge-inspector"
            style={{
              width: 360,
              borderLeft: "1px solid rgba(148,163,184,0.25)",
              padding: 12,
              overflow: "auto",
              background: "rgba(30,41,59,0.85)",
            }}
          >
            <InspectorPanel />
          </aside>
        ) : null}
      </div>

      <footer
        className="nge-transport"
        style={{
          borderTop: "1px solid rgba(148,163,184,0.25)",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(15,23,42,0.92)",
          color: "#cbd5f5",
        }}
      >
        {(() => {
          const parts: string[] = [];
          if (paletteOpen) parts.push("Palette");
          if (inputsOpen) parts.push("Inputs");
          if (inspectorOpen) parts.push("Inspector");
          const label = parts.length ? parts.join(", ") : "None";
          return (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Panels: {label}
            </div>
          );
        })()}
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

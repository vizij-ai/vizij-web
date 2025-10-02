import React from "react";
import {
  OrchestratorProvider,
  type WasmValue,
} from "@vizij/orchestrator-react";

import { DEMO_PATHS } from "./demoSpecs";
import { useDemoOrchestrator } from "./useDemoOrchestrator";

interface ValueCardProps {
  label: string;
  path: string;
  value: WasmValue | null | undefined;
}

function ValueCard({ label, path, value }: ValueCardProps) {
  const numericValue = value && value.type === "float" ? value.data : null;

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <code style={{ fontSize: "0.85rem", opacity: 0.7 }}>{path}</code>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {numericValue != null ? numericValue.toFixed(3) : "–"}
      </div>
      <pre
        style={{
          margin: 0,
          background: "#101215",
          color: "#f5f5f5",
          padding: "0.75rem",
          borderRadius: 6,
          fontSize: "0.8rem",
          overflowX: "auto",
        }}
      >
        {value ? JSON.stringify(value, null, 2) : "No value yet."}
      </pre>
    </div>
  );
}

function DemoPanel() {
  const {
    state: {
      ready,
      registered,
      status,
      focusPath,
      isPlaying,
      controllerIds,
      frame,
      mergedWrites,
      timings,
      values,
      focusedValue,
    },
    actions: { registerControllers, togglePlayback, stepOnce },
  } = useDemoOrchestrator();

  const totalMsCandidate = (timings as { total_ms?: unknown }).total_ms;
  const timingTotal =
    typeof totalMsCandidate === "number" ? totalMsCandidate.toFixed(2) : "–";

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        margin: "2rem auto",
        maxWidth: 880,
        padding: "0 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <header>
        <h1 style={{ margin: "0 0 0.25rem" }}>
          Dual Animation Orchestrator Demo
        </h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Two looping scalar animations feed a multiply graph whose output
          drives a second graph that raises ten to the power of that product.
          Watch each blackboard value update in real time.
        </p>
      </header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1rem",
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={registerControllers}
            disabled={!ready || registered}
          >
            {registered ? "Controllers ready" : "Register controllers"}
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            disabled={!ready || !registered}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={stepOnce} disabled={!ready}>
            Step 1 frame (dt = 1/60)
          </button>
        </div>

        <div style={{ fontSize: "0.9rem", opacity: 0.85 }}>
          <div>
            <strong>Ready:</strong> {ready ? "yes" : "no"}
          </div>
          <div>
            <strong>Controllers:</strong> {controllerIds.multiplyGraph ?? "–"} /{" "}
            {controllerIds.powerGraph ?? "–"} / {controllerIds.rampUp ?? "–"} /{" "}
            {controllerIds.rampDown ?? "–"}
          </div>
          <div>
            <strong>Latest status:</strong> {status ?? "Idle"}
          </div>
          <div>
            <strong>Focused target:</strong> {focusPath ?? "–"}
          </div>
          <div>
            <strong>Playback:</strong> {isPlaying ? "playing" : "stopped"}
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <ValueCard
          label="Ramp up animation"
          path={DEMO_PATHS.animations.rampUp}
          value={values.rampUp}
        />
        <ValueCard
          label="Ramp down animation"
          path={DEMO_PATHS.animations.rampDown}
          value={values.rampDown}
        />
        <ValueCard
          label="Product graph output"
          path={DEMO_PATHS.graphs.product}
          value={values.product}
        />
        <ValueCard
          label="10^product graph output"
          path={DEMO_PATHS.graphs.power}
          value={values.power}
        />
      </section>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Merged Writes</h2>
          {mergedWrites.length === 0 ? (
            <p style={{ opacity: 0.7 }}>
              No merged writes yet. The orchestrator will populate this once
              playback begins.
            </p>
          ) : (
            <pre
              style={{
                background: "#101215",
                color: "#f5f5f5",
                padding: "0.75rem",
                borderRadius: 6,
                overflowX: "auto",
                fontSize: "0.85rem",
              }}
            >
              {JSON.stringify(mergedWrites, null, 2)}
            </pre>
          )}
          {focusedValue !== undefined ? (
            <pre
              style={{
                background: "#f5f5f5",
                borderRadius: 6,
                padding: "0.75rem",
                marginTop: "0.75rem",
                overflowX: "auto",
                fontSize: "0.85rem",
              }}
            >
              {JSON.stringify(focusedValue, null, 2)}
            </pre>
          ) : null}
        </div>

        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Frame Diagnostics</h2>
          {frame ? (
            <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
              <li>epoch: {frame.epoch}</li>
              <li>dt: {frame.dt.toFixed(4)}s</li>
              <li>conflicts: {frame.conflicts?.length ?? 0}</li>
              <li>events: {frame.events?.length ?? 0}</li>
              <li>timings total: {timingTotal} ms</li>
            </ul>
          ) : (
            <p style={{ opacity: 0.7 }}>
              Step the orchestrator to see frame data.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  return (
    <OrchestratorProvider autostart={false}>
      <DemoPanel />
    </OrchestratorProvider>
  );
}

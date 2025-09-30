import React from "react";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
  type WasmValue,
  type GraphRegistrationInput,
  type AnimationRegistrationConfig,
  type AnimationSetup,
} from "@vizij/orchestrator-react";

const makeFloatValue = (value: number): WasmValue => ({
  type: "float",
  data: value,
});

const DEMO_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "anim_input",
        type: "input",
        params: {
          path: "demo/animation.value",
          value: makeFloatValue(0),
        },
      },
      {
        id: "gain_input",
        type: "input",
        params: {
          path: "demo/graph/gain",
          value: makeFloatValue(1.5),
        },
      },
      {
        id: "offset_input",
        type: "input",
        params: {
          path: "demo/graph/offset",
          value: makeFloatValue(0.25),
        },
      },
      {
        id: "scaled",
        type: "multiply",
        inputs: {
          a: { node_id: "anim_input" },
          b: { node_id: "gain_input" },
        },
      },
      {
        id: "output_sum",
        type: "add",
        inputs: {
          lhs: { node_id: "scaled" },
          rhs: { node_id: "offset_input" },
        },
      },
      {
        id: "out",
        type: "output",
        params: { path: "demo/output/value" },
        inputs: { in: { node_id: "output_sum" } },
      },
    ],
  },
  subs: {
    inputs: ["demo/animation.value", "demo/graph/gain", "demo/graph/offset"],
    outputs: ["demo/output/value"],
  },
};

const DEMO_ANIMATION_SETUP: AnimationSetup = {
  animation: {
    id: "demo-ramp",
    name: "Demo Ramp",
    duration: 2000,
    groups: [],
    tracks: [
      {
        id: "ramp-track",
        name: "Ramp Value",
        animatableId: "demo/animation.value",
        points: [
          { id: "start", stamp: 0, value: 0 },
          { id: "end", stamp: 1, value: 1 },
        ],
      },
    ],
  },
  player: {
    name: "demo-player",
    loop_mode: "loop",
  },
};

const DEMO_ANIMATION_CONFIG: AnimationRegistrationConfig = {
  setup: DEMO_ANIMATION_SETUP,
};

function DemoPanel() {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
    step,
    listControllers,
  } = useOrchestrator();
  const frame = useOrchFrame();
  const [focusPath, setFocusPath] = React.useState<string | null>(null);
  const focusedValue = useOrchTarget(focusPath);

  const [controllerIds, setControllerIds] = React.useState<{
    graph?: string;
    anim?: string;
  }>({});
  const [gainValue, setGainValue] = React.useState(1.5);
  const [offsetValue, setOffsetValue] = React.useState(0.25);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    createOrchestrator().catch((err) => {
      console.error("demo-orchestrator: failed to create orchestrator", err);
      setStatus("Failed to create orchestrator. Check console for details.");
    });
  }, [createOrchestrator]);

  const handleRegister = React.useCallback(async () => {
    try {
      await createOrchestrator();
      const existing = listControllers();
      let graphId = existing.graphs[0];
      let animId = existing.anims[0];
      if (!graphId) {
        graphId = registerGraph(DEMO_GRAPH_SPEC);
      }
      if (!animId) {
        animId = registerAnimation(DEMO_ANIMATION_CONFIG);
      }
      setInput("demo/graph/gain", makeFloatValue(gainValue));
      setInput("demo/graph/offset", makeFloatValue(offsetValue));
      setControllerIds({ graph: graphId, anim: animId });
      setStatus("Controllers registered");
    } catch (err) {
      setStatus(`Registration failed: ${(err as Error).message}`);
    }
  }, [
    createOrchestrator,
    listControllers,
    registerAnimation,
    registerGraph,
    gainValue,
    offsetValue,
    setInput,
  ]);

  const handleGainChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      setGainValue(next);
      if (!ready) {
        setStatus("Register controllers before adjusting gain.");
        return;
      }
      try {
        setInput("demo/graph/gain", makeFloatValue(next));
        setStatus(`Gain set to ${next.toFixed(2)}`);
      } catch (err) {
        setStatus(`Failed to set gain: ${(err as Error).message}`);
      }
    },
    [ready, setInput],
  );

  const handleOffsetChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      setOffsetValue(next);
      if (!ready) {
        setStatus("Register controllers before adjusting offset.");
        return;
      }
      try {
        setInput("demo/graph/offset", makeFloatValue(next));
        setStatus(`Offset set to ${next.toFixed(2)}`);
      } catch (err) {
        setStatus(`Failed to set offset: ${(err as Error).message}`);
      }
    },
    [ready, setInput],
  );

  const handleStep = React.useCallback(() => {
    try {
      const result = step(1 / 60);
      if (result) {
        setStatus(`Stepped epoch ${result.epoch}`);
      } else {
        setStatus("No orchestrator instance yet. Make sure it's created.");
      }
    } catch (err) {
      setStatus(`Step failed: ${(err as Error).message}`);
    }
  }, [step]);

  const mergedWrites = frame?.merged_writes ?? [];
  const timings = frame?.timings_ms ?? {};
  const processedValue = useOrchTarget("demo/output/value");
  const animationValue = useOrchTarget("demo/animation.value");

  React.useEffect(() => {
    if (!frame) {
      return;
    }
    const firstPath = frame.merged_writes[0]?.path;
    if (firstPath && firstPath !== focusPath) {
      setFocusPath(firstPath);
    }
  }, [frame, focusPath]);

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        margin: "2rem auto",
        maxWidth: 720,
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>Vizij Orchestrator Demo</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Register the demo controllers, watch the animation drive the graph, and
        adjust gain/offset live while the orchestrator loops.
      </p>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1rem",
          border: "1px solid #ccc",
          borderRadius: 8,
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" onClick={handleRegister} disabled={!ready}>
            Register controllers
          </button>
          <button type="button" onClick={handleStep} disabled={!ready}>
            Step 1 frame (dt = 1/60)
          </button>
        </div>

        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <span>Gain: {gainValue.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="3"
            step="0.01"
            value={gainValue}
            onChange={handleGainChange}
          />
        </label>

        <label
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <span>Offset: {offsetValue.toFixed(2)}</span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={offsetValue}
            onChange={handleOffsetChange}
          />
        </label>

        <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          <div>
            <strong>Ready:</strong> {ready ? "yes" : "no"}
          </div>
          <div>
            <strong>Graph output:</strong>{" "}
            {processedValue != null ? JSON.stringify(processedValue) : "–"}
          </div>
          <div>
            <strong>Animation ramp:</strong>{" "}
            {animationValue != null ? JSON.stringify(animationValue) : "–"}
          </div>
          <div>
            <strong>Controllers:</strong> {controllerIds.graph ?? "–"} /{" "}
            {controllerIds.anim ?? "–"}
          </div>
          <div>
            <strong>Latest status:</strong> {status ?? "Waiting"}
          </div>
          <div>
            <strong>Focused target:</strong> {focusPath ?? "–"}
          </div>
        </div>
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
              No merged writes yet. Step the orchestrator to see outputs.
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
              <li>
                timings total:{" "}
                {typeof timings.total_ms === "number"
                  ? timings.total_ms.toFixed(2)
                  : "–"}{" "}
                ms
              </li>
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
    <OrchestratorProvider autostart>
      <DemoPanel />
    </OrchestratorProvider>
  );
}

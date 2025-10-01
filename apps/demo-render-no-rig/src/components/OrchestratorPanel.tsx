import { useCallback, useEffect, useMemo, useState } from "react";
import { useVizijStore } from "@vizij/render";
import {
  useOrchestrator,
  useOrchTarget,
  type AnimationRegistrationConfig,
  type GraphRegistrationInput,
  type ValueJSON,
} from "@vizij/orchestrator-react";
import { getLookup } from "@vizij/utils";
import type { RawValue } from "@vizij/utils";

const GAIN_PATH = "demo/graph/gain";
const OFFSET_PATH = "demo/graph/offset";
const ANIMATION_OUTPUT_PATH = "demo/animation.value";

const DEMO_ANIMATION_CONFIG: AnimationRegistrationConfig = {
  setup: {
    animation: {
      id: "demo-ramp",
      name: "Demo Ramp",
      duration: 2000,
      groups: [],
      tracks: [
        {
          id: "ramp-track",
          name: "Ramp Value",
          animatableId: ANIMATION_OUTPUT_PATH,
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
  },
};

const makeFloatValue = (value: number): ValueJSON => ({
  type: "float",
  data: value,
});

function buildDemoGraph(outputPath: string): GraphRegistrationInput {
  return {
    spec: {
      nodes: [
        {
          id: "anim_input",
          type: "input",
          params: {
            path: ANIMATION_OUTPUT_PATH,
            value: makeFloatValue(0),
          },
        },
        {
          id: "gain_input",
          type: "input",
          params: {
            path: GAIN_PATH,
            value: makeFloatValue(1.5),
          },
        },
        {
          id: "offset_input",
          type: "input",
          params: {
            path: OFFSET_PATH,
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
          params: { path: outputPath },
          inputs: { in: { node_id: "output_sum" } },
        },
      ],
    },
    subs: {
      inputs: [ANIMATION_OUTPUT_PATH, GAIN_PATH, OFFSET_PATH],
      outputs: [outputPath],
    },
  };
}

function valueJSONToRaw(value?: ValueJSON): RawValue | undefined {
  if (value == null) return undefined;
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value as RawValue;
  }
  if (typeof value === "object") {
    if ("float" in value && typeof value.float === "number") {
      return value.float;
    }
    if (
      "data" in value &&
      typeof value.data === "number" &&
      value.type?.toLowerCase?.() === "float"
    ) {
      return value.data;
    }
  }
  return undefined;
}

export type OrchestratorAnimatableOption = {
  id: string;
  name: string;
  group: string;
  label: string;
  type: string;
  defaultValue: RawValue;
};

interface OrchestratorPanelProps {
  namespace: string;
  animatables: OrchestratorAnimatableOption[];
  selectedAnimId: string | null;
  onSelectAnim: (id: string) => void;
}

export function OrchestratorPanel({
  namespace,
  animatables,
  selectedAnimId,
  onSelectAnim,
}: OrchestratorPanelProps) {
  const orchestrator = useOrchestrator();
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    removeGraph,
    removeAnimation,
    setInput,
  } = orchestrator;

  const setVizijValue = useVizijStore((state) => state.setValue);

  const [gain, setGain] = useState(1.5);
  const [offset, setOffset] = useState(0.25);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [animationId, setAnimationId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedAnim = useMemo(
    () => animatables.find((item) => item.id === selectedAnimId) ?? null,
    [animatables, selectedAnimId],
  );

  const outputPath = selectedAnim
    ? getLookup(namespace, selectedAnim.id)
    : null;

  const handleConnect = useCallback(async () => {
    if (!selectedAnim || !outputPath) {
      setStatus("Select an animatable to target");
      return;
    }
    try {
      await createOrchestrator();
      let newAnimationId = animationId;
      if (!newAnimationId) {
        newAnimationId = registerAnimation(DEMO_ANIMATION_CONFIG);
        setAnimationId(newAnimationId);
      }
      if (graphId) {
        removeGraph(graphId);
      }
      const newGraphId = registerGraph(buildDemoGraph(outputPath));
      setGraphId(newGraphId);
      setInput(GAIN_PATH, makeFloatValue(gain));
      setInput(OFFSET_PATH, makeFloatValue(offset));
      setConnected(true);
      setStatus(`Connected to ${selectedAnim.label ?? selectedAnim.name}`);
    } catch (err) {
      console.error("demo-render-no-rig: orchestrator connect failed", err);
      setStatus(`Connect failed: ${(err as Error).message}`);
    }
  }, [
    animationId,
    createOrchestrator,
    gain,
    graphId,
    offset,
    outputPath,
    registerAnimation,
    registerGraph,
    removeGraph,
    selectedAnim,
    setInput,
  ]);

  const handleDisconnect = useCallback(() => {
    if (graphId) {
      removeGraph(graphId);
    }
    if (animationId) {
      removeAnimation(animationId);
    }
    setGraphId(null);
    setAnimationId(null);
    setConnected(false);
    setStatus("Disconnected");
  }, [animationId, graphId, removeAnimation, removeGraph]);

  useEffect(() => {
    if (!connected || !graphId) {
      return;
    }
    setInput(GAIN_PATH, makeFloatValue(gain));
  }, [connected, gain, graphId, setInput]);

  useEffect(() => {
    if (!connected || !graphId) {
      return;
    }
    setInput(OFFSET_PATH, makeFloatValue(offset));
  }, [connected, offset, graphId, setInput]);

  useEffect(() => {
    if (!connected || !ready || !selectedAnim || !outputPath) {
      return;
    }
    const newGraphId = registerGraph(buildDemoGraph(outputPath));
    setGraphId(newGraphId);
    setStatus(`Connected to ${selectedAnim.label ?? selectedAnim.name}`);
    return () => {
      removeGraph(newGraphId);
      setGraphId((prev) => (prev === newGraphId ? null : prev));
    };
  }, [connected, ready, outputPath, registerGraph, removeGraph, selectedAnim]);

  const orchestratorValue = useOrchTarget(connected ? outputPath : null);
  useEffect(() => {
    if (!connected || !selectedAnim || !outputPath) {
      return;
    }
    const raw = valueJSONToRaw(orchestratorValue);
    if (raw === undefined) {
      return;
    }
    setVizijValue(selectedAnim.id, namespace, raw);
  }, [
    connected,
    namespace,
    orchestratorValue,
    outputPath,
    selectedAnim,
    setVizijValue,
  ]);

  const currentValue = useMemo(
    () => valueJSONToRaw(orchestratorValue),
    [orchestratorValue],
  );

  return (
    <div className="panel orchestrator-panel">
      <div className="panel-header">
        <h2>Orchestrator Bridge</h2>
        <span className="tag">{ready ? "live" : "loading"}</span>
      </div>
      <div className="panel-body">
        <label className="toolbar-label" htmlFor="anim-target">
          Target animatable
        </label>
        <select
          id="anim-target"
          className="select-input"
          value={selectedAnimId ?? ""}
          onChange={(event) => onSelectAnim(event.target.value)}
          disabled={!animatables.length}
        >
          {animatables.length === 0 ? (
            <option value="">No animatables available</option>
          ) : (
            animatables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.group ? `${item.group} • ${item.label}` : item.label}
              </option>
            ))
          )}
        </select>

        <div className="orchestrator-controls">
          <label>
            <span>Gain ({gain.toFixed(2)})</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={gain}
              disabled={!connected}
              onChange={(event) => setGain(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Offset ({offset.toFixed(2)})</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={offset}
              disabled={!connected}
              onChange={(event) => setOffset(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="bridge-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={!selectedAnim}
          >
            Connect controllers
          </button>
          <button
            type="button"
            className="btn btn-muted"
            onClick={handleDisconnect}
            disabled={!connected}
          >
            Disconnect
          </button>
        </div>

        <div className="status-grid">
          <div>
            <span className="label">Orchestrator</span>
            <span>{ready ? "ready" : "initialising"}</span>
          </div>
          <div>
            <span className="label">Animation</span>
            <span>{animationId ? animationId : "–"}</span>
          </div>
          <div>
            <span className="label">Graph</span>
            <span>{graphId ?? "–"}</span>
          </div>
          <div>
            <span className="label">Output</span>
            <span>
              {currentValue == null
                ? "–"
                : typeof currentValue === "number"
                  ? currentValue.toFixed(3)
                  : String(currentValue)}
            </span>
          </div>
          <div>
            <span className="label">Status</span>
            <span>{status ?? "Waiting"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

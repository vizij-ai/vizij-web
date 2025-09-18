import React from "react";
import { useNodeGraph } from "@vizij/node-graph-react";
import type { GraphPreset } from "../assets/graph-presets";
import type { GraphSelection } from "../lib/persistence";

type ControlsBarProps = {
  presets: GraphPreset[];
  activeSelection: GraphSelection | null;
  savedGraphs: string[];
  onPresetChange: (presetId: string) => void;
  onSaveGraph: () => void;
  onLoadSavedGraph: (name: string) => void;
  onDeleteSavedGraph: (name: string) => void;
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9aa0a6",
  marginRight: 6,
};

const selectStyle: React.CSSProperties = {
  background: "#1e1e1e",
  color: "#f0f0f0",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "4px 6px",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #555",
  background: "#2a2a2a",
  color: "#f0f0f0",
  borderRadius: 4,
  padding: "6px 10px",
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

export default function ControlsBar({
  presets,
  activeSelection,
  savedGraphs,
  onPresetChange,
  onSaveGraph,
  onLoadSavedGraph,
  onDeleteSavedGraph,
}: ControlsBarProps) {
  const { setTime } = useNodeGraph();

  const rafRef = React.useRef<number | null>(null);
  const lastRef = React.useRef<number>(0);
  const tRef = React.useRef<number>(0);
  const [playing, setPlaying] = React.useState(false);
  const [presetSelection, setPresetSelection] = React.useState<string>(
    presets[0]?.id ?? "",
  );
  const [savedSelection, setSavedSelection] = React.useState<string>("");

  React.useEffect(() => {
    if (activeSelection?.type === "preset") {
      setPresetSelection(activeSelection.name);
    }
  }, [activeSelection]);

  React.useEffect(() => {
    if (activeSelection?.type === "saved") {
      setSavedSelection(activeSelection.name);
      return;
    }
    if (savedSelection && !savedGraphs.includes(savedSelection)) {
      setSavedSelection(savedGraphs[0] ?? "");
    } else if (!savedSelection && savedGraphs.length > 0) {
      setSavedSelection(savedGraphs[0]);
    } else if (savedGraphs.length === 0) {
      setSavedSelection("");
    }
  }, [activeSelection, savedGraphs]);

  const loop = React.useCallback(
    (ts: number) => {
      const last = lastRef.current || ts;
      const dt = (ts - last) / 1000;
      lastRef.current = ts;

      tRef.current += dt;
      setTime(tRef.current);
      rafRef.current = requestAnimationFrame(loop);
    },
    [setTime],
  );

  const play = React.useCallback(() => {
    if (playing) return;
    setPlaying(true);
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, playing]);

  const pause = React.useCallback(() => {
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const step = React.useCallback(
    (delta: number) => {
      tRef.current += delta;
      setTime(tRef.current);
    },
    [setTime],
  );

  const reset = React.useCallback(() => {
    pause();
    tRef.current = 0;
    setTime(0);
  }, [pause, setTime]);

  React.useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const savedDisabled = savedGraphs.length === 0 || !savedSelection;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: 8,
        borderBottom: "1px solid #ddd",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button onClick={playing ? pause : play}>
        {playing ? "Pause" : "Play"}
      </button>
      <button onClick={() => step(1 / 60)}>Step</button>
      <button onClick={reset}>Reset</button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginLeft: "auto",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={labelStyle}>Preset</span>
          <select
            value={presetSelection}
            onChange={(event) => {
              const value = event.target.value;
              setPresetSelection(value);
              if (value) onPresetChange(value);
            }}
            style={selectStyle}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={labelStyle}>Saved</span>
          <select
            value={savedSelection}
            onChange={(event) => setSavedSelection(event.target.value)}
            style={selectStyle}
          >
            {savedGraphs.length === 0 ? (
              <option value="" disabled>
                No saved graphs
              </option>
            ) : null}
            {savedGraphs.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => savedSelection && onLoadSavedGraph(savedSelection)}
            style={savedDisabled ? disabledButtonStyle : buttonStyle}
            disabled={savedDisabled}
          >
            Load
          </button>
          <button
            onClick={() => savedSelection && onDeleteSavedGraph(savedSelection)}
            style={savedDisabled ? disabledButtonStyle : buttonStyle}
            disabled={savedDisabled}
          >
            Delete
          </button>
        </div>

        <button onClick={onSaveGraph} style={buttonStyle}>
          Save Current
        </button>
      </div>
    </div>
  );
}

import React from "react";
import useGraphStore from "../state/useGraphStore";
import {
  saveGraphToLocalStorage,
  loadGraphFromLocalStorage,
} from "../lib/persistence";
import { useNodeGraph } from "@vizij/node-graph-react";

export default function ControlsBar() {
  const { nodes, edges, setGraph } = useGraphStore();
  const { setTime } = useNodeGraph();

  const rafRef = React.useRef<number | null>(null);
  const lastRef = React.useRef<number>(0);
  const tRef = React.useRef<number>(0);
  const [playing, setPlaying] = React.useState(false);

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

  const handleSave = () => saveGraphToLocalStorage({ nodes, edges });
  const handleLoad = () => {
    const graph = loadGraphFromLocalStorage();
    if (graph) setGraph(graph);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: 8,
        borderBottom: "1px solid #ddd",
      }}
    >
      <button onClick={playing ? pause : play}>
        {playing ? "Pause" : "Play"}
      </button>
      <button onClick={() => step(1 / 60)}>Step</button>
      <button onClick={reset}>Reset</button>
      <div style={{ marginLeft: "auto" }}>
        <button onClick={handleSave} style={{ marginRight: 8 }}>
          Save
        </button>
        <button onClick={handleLoad}>Load</button>
      </div>
    </div>
  );
}

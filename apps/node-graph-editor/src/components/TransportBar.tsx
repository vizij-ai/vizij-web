import React, { useCallback, useState } from "react";
import { useGraphPlayback } from "@vizij/node-graph-react";
import { useGraphRuntime } from "@vizij/node-graph-react";
import { useEditorStore } from "../store/useEditorStore";

/**
 * TransportBar
 * - Play / Pause / Step / Reset controls
 * - Mode selector: manual | raf | interval | timecode
 * - SetTime input + Eval Now button
 *
 * Notes:
 * - Uses useGraphPlayback for start/stop and reactive mode
 * - Uses runtime (useGraphRuntime) for setTime, step and evalAll operations
 */

export default function TransportBar(): JSX.Element {
  const playback = useGraphPlayback();
  const runtime = useGraphRuntime();
  const [intervalHz, setIntervalHz] = useState<number>(60);
  const [timeInput, setTimeInput] = useState<string>("0");
  const spec = useEditorStore((s) => s.spec);

  const currentMode = playback.getMode();
  const runtimeReady = runtime.ready;
  const controlsDisabled = !runtimeReady;

  const handlePlayPause = useCallback(() => {
    if (!runtimeReady) return;
    if (currentMode === "manual") {
      playback.start("interval", intervalHz);
    } else {
      playback.stop();
    }
  }, [currentMode, playback, intervalHz, runtimeReady]);

  const handleStep = useCallback(() => {
    if (!runtimeReady) return;
    // step by 1/frame at the configured interval Hz (approximate)
    const dt = 1 / Math.max(1, intervalHz);
    runtime.step?.(dt);
    runtime.evalAll?.();
  }, [runtime, intervalHz, runtimeReady]);

  const handleReset = useCallback(() => {
    if (!runtimeReady) return;
    playback.stop();
    runtime.setTime?.(0);
    runtime.evalAll?.();
  }, [playback, runtime, runtimeReady]);

  const handleModeChange = useCallback(
    (mode: string) => {
      if (!runtimeReady) return;
      if (mode === "manual") {
        playback.stop();
      } else if (mode === "raf") {
        playback.start("raf");
      } else if (mode === "interval") {
        playback.start("interval", intervalHz);
      } else if (mode === "timecode") {
        // Timecode mode: consumer will set time manually.
        playback.stop();
      }
    },
    [playback, intervalHz, runtimeReady],
  );

  const applyTime = useCallback(() => {
    if (!runtimeReady) return;
    const t = Number(timeInput);
    if (Number.isFinite(t)) {
      runtime.setTime?.(t);
      runtime.evalAll?.();
    } else {
      // ignore invalid input
    }
  }, [runtime, timeInput, runtimeReady]);

  // Manual controls to verify graph load/eval and debug current snapshot
  const handleReloadGraph = useCallback(async () => {
    if (!runtimeReady) return;
    try {
      console.info(
        "[Transport] ReloadGraph clicked. runtime.ready=",
        runtime?.ready,
        "spec nodes=",
        (spec as any)?.nodes?.length ?? 0,
      );
      runtime.stopPlayback?.();
      runtime.unloadGraph?.();
      if (spec) {
        await runtime.loadGraph?.(spec as any);
        const res = runtime.evalAll?.();
        console.info("[Transport] ReloadGraph -> evalAll result:", res);
      } else {
        console.warn("[Transport] No spec available to load.");
      }
    } catch (err) {
      console.error("[Transport] ReloadGraph error:", err);
    }
  }, [runtime, spec, runtimeReady]);

  const handleEvalNow = useCallback(() => {
    if (!runtimeReady) return;
    try {
      const res = runtime.evalAll?.();
      console.info("[Transport] EvalNow -> evalAll result:", res);
    } catch (err) {
      console.error("[Transport] EvalNow error:", err);
    }
  }, [runtime, runtimeReady]);

  const handleLogSnapshot = useCallback(() => {
    if (!runtimeReady) return;
    try {
      const snap = runtime.getSnapshot?.();
      console.info("[Transport] Snapshot:", snap);
      const nodes = (snap as any)?.evalResult?.nodes;
      console.info(
        "[Transport] Snapshot nodes keys:",
        nodes ? Object.keys(nodes) : null,
      );
    } catch (err) {
      console.error("[Transport] LogSnapshot error:", err);
    }
  }, [runtime, runtimeReady]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: 8,
        borderBottom: "1px solid #ddd",
      }}
    >
      <button
        onClick={handlePlayPause}
        style={{ padding: "6px 10px" }}
        disabled={controlsDisabled}
      >
        {currentMode === "manual" ? "Play" : "Pause"}
      </button>

      <button
        onClick={handleStep}
        style={{ padding: "6px 10px" }}
        disabled={controlsDisabled}
      >
        Step
      </button>

      <button
        onClick={handleReset}
        style={{ padding: "6px 10px" }}
        disabled={controlsDisabled}
      >
        Reset
      </button>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginLeft: 12,
        }}
      >
        <label style={{ fontSize: 13, color: "#666" }}>Mode</label>
        <select
          value={currentMode}
          onChange={(e) => handleModeChange(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 6 }}
          disabled={controlsDisabled}
        >
          <option value="manual">manual</option>
          <option value="raf">raf</option>
          <option value="interval">interval</option>
          <option value="timecode">timecode</option>
        </select>
      </div>

      {currentMode === "interval" ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginLeft: 12,
          }}
        >
          <label style={{ fontSize: 13, color: "#666" }}>Hz</label>
          <input
            type="number"
            min={1}
            value={String(intervalHz)}
            onChange={(e) => setIntervalHz(Number(e.target.value || 60))}
            style={{ width: 80, padding: "6px 8px", borderRadius: 6 }}
            disabled={controlsDisabled}
          />
          <button
            onClick={() => playback.start("interval", intervalHz)}
            style={{ padding: "6px 10px" }}
            disabled={controlsDisabled}
          >
            Start Interval
          </button>
        </div>
      ) : null}

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 13, color: "#666" }}>Time</label>
        <input
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          placeholder="seconds"
          style={{ width: 100, padding: "6px 8px", borderRadius: 6 }}
          disabled={controlsDisabled}
        />
        <button
          onClick={applyTime}
          style={{ padding: "6px 10px" }}
          disabled={controlsDisabled}
        >
          Set Time & Eval
        </button>

        {/* Debug / control buttons */}
        <button
          onClick={handleEvalNow}
          style={{ padding: "6px 10px" }}
          disabled={controlsDisabled}
        >
          Eval Now
        </button>
        <button
          onClick={handleReloadGraph}
          style={{ padding: "6px 10px" }}
          disabled={controlsDisabled}
        >
          Reload Graph
        </button>
        <button
          onClick={handleLogSnapshot}
          style={{ padding: "6px 10px" }}
          disabled={controlsDisabled}
        >
          Log Snapshot
        </button>
      </div>
    </div>
  );
}

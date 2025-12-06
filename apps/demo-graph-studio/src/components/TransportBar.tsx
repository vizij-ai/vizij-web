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
      console.log(
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
        console.log("[Transport] ReloadGraph -> evalAll result:", res);
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
      console.log("[Transport] EvalNow -> evalAll result:", res);
    } catch (err) {
      console.error("[Transport] EvalNow error:", err);
    }
  }, [runtime, runtimeReady]);

  const handleLogSnapshot = useCallback(() => {
    if (!runtimeReady) return;
    try {
      const snap = runtime.getSnapshot?.();
      console.log("[Transport] Snapshot:", snap);
      const nodes = (snap as any)?.evalResult?.nodes;
      console.log(
        "[Transport] Snapshot nodes keys:",
        nodes ? Object.keys(nodes) : null,
      );
    } catch (err) {
      console.error("[Transport] LogSnapshot error:", err);
    }
  }, [runtime, runtimeReady]);

  const buttonBase = {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid rgba(148,163,184,0.35)",
    background: "rgba(30,41,59,0.75)",
    color: "#e2e8f0",
    cursor: controlsDisabled ? "not-allowed" : "pointer",
    opacity: controlsDisabled ? 0.55 : 1,
  } as const;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: 8,
        borderBottom: "1px solid rgba(148,163,184,0.25)",
        background: "rgba(15,23,42,0.88)",
      }}
    >
      <button
        onClick={handlePlayPause}
        style={{
          ...buttonBase,
          background:
            currentMode === "manual"
              ? "rgba(96,165,250,0.35)"
              : "rgba(248,113,113,0.28)",
          border:
            currentMode === "manual"
              ? "1px solid rgba(96,165,250,0.5)"
              : "1px solid rgba(248,113,113,0.45)",
        }}
        disabled={controlsDisabled}
      >
        {currentMode === "manual" ? "Play" : "Pause"}
      </button>

      <button
        onClick={handleStep}
        style={{
          ...buttonBase,
          background: "rgba(129,140,248,0.28)",
          border: "1px solid rgba(129,140,248,0.45)",
        }}
        disabled={controlsDisabled}
      >
        Step
      </button>

      <button
        onClick={handleReset}
        style={{
          ...buttonBase,
          background: "rgba(248,250,252,0.08)",
        }}
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
        <label style={{ fontSize: 13, color: "#94a3b8" }}>Mode</label>
        <select
          value={currentMode}
          onChange={(e) => handleModeChange(e.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            background: "rgba(15,23,42,0.75)",
            border: "1px solid rgba(148,163,184,0.35)",
            color: "#e2e8f0",
          }}
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
          <label style={{ fontSize: 13, color: "#94a3b8" }}>Hz</label>
          <input
            type="number"
            min={1}
            value={String(intervalHz)}
            onChange={(e) => setIntervalHz(Number(e.target.value || 60))}
            style={{
              width: 80,
              padding: "6px 8px",
              borderRadius: 6,
              background: "rgba(15,23,42,0.75)",
              border: "1px solid rgba(148,163,184,0.35)",
              color: "#e2e8f0",
            }}
            disabled={controlsDisabled}
          />
          <button
            onClick={() => playback.start("interval", intervalHz)}
            style={{
              ...buttonBase,
              background: "rgba(45,212,191,0.25)",
              border: "1px solid rgba(45,212,191,0.4)",
            }}
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
        <label style={{ fontSize: 13, color: "#94a3b8" }}>Time</label>
        <input
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          placeholder="seconds"
          style={{
            width: 100,
            padding: "6px 8px",
            borderRadius: 6,
            background: "rgba(15,23,42,0.75)",
            border: "1px solid rgba(148,163,184,0.35)",
            color: "#e2e8f0",
          }}
          disabled={controlsDisabled}
        />
        <button
          onClick={applyTime}
          style={{
            ...buttonBase,
            background: "rgba(165,180,252,0.28)",
            border: "1px solid rgba(165,180,252,0.45)",
          }}
          disabled={controlsDisabled}
        >
          Set Time & Eval
        </button>

        {/* Debug / control buttons */}
        <button
          onClick={handleEvalNow}
          style={{
            ...buttonBase,
            background: "rgba(248,250,252,0.1)",
          }}
          disabled={controlsDisabled}
        >
          Eval Now
        </button>
        <button
          onClick={handleReloadGraph}
          style={{
            ...buttonBase,
            background: "rgba(248,113,113,0.25)",
            border: "1px solid rgba(248,113,113,0.45)",
          }}
          disabled={controlsDisabled}
        >
          Reload Graph
        </button>
        <button
          onClick={handleLogSnapshot}
          style={{
            ...buttonBase,
            background: "rgba(192,132,252,0.25)",
            border: "1px solid rgba(192,132,252,0.45)",
          }}
          disabled={controlsDisabled}
        >
          Log Snapshot
        </button>
      </div>
    </div>
  );
}

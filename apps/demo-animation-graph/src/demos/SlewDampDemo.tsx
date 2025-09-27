import React, { useEffect } from "react";
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber as animationValueAsNumber,
} from "@vizij/animation-react";
import {
  GraphProvider,
  useGraphRuntime,
  useNodeOutput,
  valueAsNumber,
} from "@vizij/node-graph-react";
import { animationValueToValueJSON } from "../utils/animationValueToGraph";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useTimeSeries } from "../utils/useTimeSeries";
import { slewAnimation, slewPaths } from "../data/slewAnimation";
import { slewGraphSpec } from "../data/slewGraph";

function SlewDampInner() {
  const runtime = useGraphRuntime();
  const driverValue = useAnimTarget(slewPaths.driver);
  const driverNumber = animationValueAsNumber(driverValue);

  useEffect(() => {
    if (!runtime.ready) return;
    const json = animationValueToValueJSON(driverValue);
    if (!json) return;
    runtime.stageInput(slewPaths.driver, json);
  }, [runtime, driverValue]);

  const rawSeries = useTimeSeries(driverNumber);

  const rawSnapshot = useNodeOutput("raw_out", "out");
  const slewSnapshot = useNodeOutput("slew_out", "out");
  const dampSnapshot = useNodeOutput("damp_out", "out");

  const rawOut = valueAsNumber(rawSnapshot);
  const slewOut = valueAsNumber(slewSnapshot);
  const dampOut = valueAsNumber(dampSnapshot);

  const rawOutSeries = useTimeSeries(rawOut);
  const slewSeries = useTimeSeries(slewOut);
  const dampSeries = useTimeSeries(dampOut);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: "#0b1120",
        borderRadius: 16,
        padding: 24,
        border: "1px solid #1e293b",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>
          Slew and damp nodes taming a jittery animation track
        </h2>
        <p style={{ margin: 0, color: "#e2e8f0", lineHeight: 1.5 }}>
          The driver track <code>{slewPaths.driver}</code> steps aggressively between
          values. The graph applies <code>slew</code> and <code>damp</code> nodes to
          generate smoother typed outputs for downstream joints.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div style={{
          background: "#111c2d",
          borderRadius: 12,
          padding: 16,
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <strong>Typed outputs</strong>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            <li>
              Slew limited → <code>{slewPaths.slew}</code>
            </li>
            <li>
              Damp smoothed → <code>{slewPaths.damp}</code>
            </li>
          </ul>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            Latest damped value: {dampOut?.toFixed(3) ?? "…"}
          </div>
        </div>

        <div style={{
          background: "#111c2d",
          borderRadius: 12,
          padding: 16,
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <strong>Driver sample</strong>
          <div style={{ fontFamily: "monospace", fontSize: 14 }}>
            {driverNumber !== undefined ? driverNumber.toFixed(3) : "…"}
          </div>
        </div>
      </div>

      <TimeSeriesChart
        title="Animation driver"
        series={[
          { label: "raw track", color: "#f87171", values: rawSeries },
        ]}
      />

      <TimeSeriesChart
        title="Graph processed outputs"
        series={[
          { label: "raw", color: "#fb7185", values: rawOutSeries },
          { label: "slew", color: "#fbbf24", values: slewSeries },
          { label: "damp", color: "#4ade80", values: dampSeries },
        ]}
      />
    </div>
  );
}

export function SlewDampDemo() {
  return (
    <AnimationProvider
      animations={slewAnimation}
      prebind={(path) => path}
      autostart
      updateHz={60}
    >
      <GraphProvider
        spec={slewGraphSpec}
        autoStart
        autoMode="raf"
        updateHz={60}
      >
        <SlewDampInner />
      </GraphProvider>
    </AnimationProvider>
  );
}

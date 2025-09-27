import React, { useEffect, useMemo } from "react";
import { AnimationProvider, useAnimTarget } from "@vizij/animation-react";
import {
  GraphProvider,
  useGraphRuntime,
  useNodeOutput,
  valueAsNumber,
} from "@vizij/node-graph-react";
import { animationValueToValueJSON } from "../utils/animationValueToGraph";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useTimeSeries } from "../utils/useTimeSeries";
import { ikAnimation, ikPaths } from "../data/ikAnimation";
import { ikGraphSpec } from "../data/ikGraph";

function IkGraphInner() {
  const runtime = useGraphRuntime();
  const targetValue = useAnimTarget(ikPaths.target);

  useEffect(() => {
    if (!runtime.ready) return;
    const json = animationValueToValueJSON(targetValue);
    if (!json) return;
    runtime.stageInput(ikPaths.target, json);
  }, [runtime, targetValue]);

  const targetVec = useMemo(() => {
    if (targetValue?.type === "Vec3") {
      return targetValue.data;
    }
    return [0, 0, 0];
  }, [targetValue]);

  const seriesX = useTimeSeries(targetVec[0]);
  const seriesY = useTimeSeries(targetVec[1]);
  const seriesZ = useTimeSeries(targetVec[2]);

  const reachSnapshot = useNodeOutput("reach_out", "out");
  const shoulderSnapshot = useNodeOutput("shoulder_out", "out");
  const elbowSnapshot = useNodeOutput("elbow_out", "out");
  const wristSnapshot = useNodeOutput("wrist_out", "out");

  const reachValue = valueAsNumber(reachSnapshot);
  const shoulderValue = valueAsNumber(shoulderSnapshot);
  const elbowValue = valueAsNumber(elbowSnapshot);
  const wristValue = valueAsNumber(wristSnapshot);

  const reachSeries = useTimeSeries(reachValue);
  const shoulderSeries = useTimeSeries(shoulderValue);
  const elbowSeries = useTimeSeries(elbowValue);
  const wristSeries = useTimeSeries(wristValue);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: "#020617",
        borderRadius: 16,
        padding: 24,
        border: "1px solid #1f2937",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, color: "#bfdbfe" }}>
          IK target animation feeding a joint-synthesis node graph
        </h2>
        <p style={{ margin: 0, color: "#cbd5f5", lineHeight: 1.5 }}>
          The animation clip drives a typed track <code>{ikPaths.target}</code>. The
          node graph consumes the same typed path via an <code>Input</code> node and
          produces joint angles on typed outputs for the shoulder, elbow and
          wrist. The shared builder keeps the path strings identical between the
          animation track and the graph specification.
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
          background: "#0f172a",
          borderRadius: 12,
          padding: 16,
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <strong>Typed outputs synthesised by the graph</strong>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            <li>
              Shoulder joint → <code>{ikPaths.shoulder}</code>
            </li>
            <li>
              Elbow joint → <code>{ikPaths.elbow}</code>
            </li>
            <li>
              Wrist twist → <code>{ikPaths.wrist}</code>
            </li>
            <li>
              Reach magnitude → <code>{ikPaths.reach}</code>
            </li>
          </ul>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            Current reach magnitude: {reachValue?.toFixed(3) ?? "…"}
          </div>
        </div>

        <div style={{
          background: "#0f172a",
          borderRadius: 12,
          padding: 16,
          color: "#e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <strong>Latest animation sample</strong>
          <div style={{ fontFamily: "monospace", fontSize: 14 }}>
            target = (
            {targetVec.map((component, idx) => (
              <span key={idx}>
                {component.toFixed(3)}
                {idx < targetVec.length - 1 ? ", " : ""}
              </span>
            ))}
            )
          </div>
        </div>
      </div>

      <TimeSeriesChart
        title="Animation target (vec3)"
        series={[
          { label: "x", color: "#60a5fa", values: seriesX },
          { label: "y", color: "#38bdf8", values: seriesY },
          { label: "z", color: "#22d3ee", values: seriesZ },
        ]}
      />

      <TimeSeriesChart
        title="Node graph joint outputs"
        series={[
          { label: "shoulder", color: "#f97316", values: shoulderSeries },
          { label: "elbow", color: "#facc15", values: elbowSeries },
          { label: "wrist", color: "#34d399", values: wristSeries },
          { label: "reach", color: "#a855f7", values: reachSeries },
        ]}
      />
    </div>
  );
}

export function IkGraphDemo() {
  return (
    <AnimationProvider
      animations={ikAnimation}
      prebind={(path) => path}
      autostart
      updateHz={60}
    >
      <GraphProvider
        spec={ikGraphSpec}
        autoStart
        autoMode="raf"
        updateHz={60}
      >
        <IkGraphInner />
      </GraphProvider>
    </AnimationProvider>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { valueAsNumber as animationValueAsNumber } from "@vizij/value-json";
import {
  GraphProvider,
  useGraphRuntime,
  useGraphOutputs,
  valueAsNumber,
} from "@vizij/node-graph-react";
import { minimalDemoTheme } from "@vizij/minimal-demo-ui";
import { useAnimationRuntime } from "../animationRuntime";
import { animationValueToValueJSON } from "../utils/animationValueToGraph";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { slewAnimation, slewPaths } from "../data/slewAnimation";
import { slewGraphSpec } from "../data/slewGraph";
import { useSyncedSeries } from "../utils/useSyncedSeries";
import { ParamEditor } from "../components/ParamEditor";

function SlewDampInner() {
  const runtime = useGraphRuntime();
  const anim = useAnimationRuntime(slewAnimation);
  const driverValue = anim.values[slewPaths.driver];
  const driverNumber = animationValueAsNumber(driverValue);

  const [maxRate, setMaxRate] = useState(1.5);
  const [halfLife, setHalfLife] = useState(0.22);

  useEffect(() => {
    if (!runtime.ready) return;
    const json = animationValueToValueJSON(driverValue);
    if (!json) return;
    runtime.stageInput(slewPaths.driver, json);
  }, [runtime, driverValue]);

  const frame = useGraphOutputs(
    (snap) => {
      const evalResult = snap?.evalResult;
      const nodes = evalResult?.nodes ?? {};
      const version = snap?.version ?? 0;
      const readPort = (nodeId: string) => {
        const entry = nodes?.[nodeId];
        if (!entry) return undefined;
        const outputs = (entry as any)?.outputs ?? entry;
        const port = outputs?.out ?? null;
        return valueAsNumber(port);
      };
      return {
        version,
        raw: readPort("raw_out"),
        slew: readPort("slew_out"),
        damp: readPort("damp_out"),
      };
    },
    (prev, next) => prev?.version === next?.version,
  );

  const seriesValues = useMemo(
    () => ({
      driver: driverNumber,
      raw: frame.raw,
      slew: frame.slew,
      damp: frame.damp,
    }),
    [driverNumber, frame.raw, frame.slew, frame.damp],
  );

  const series = useSyncedSeries(seriesValues, frame.version);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            background: minimalDemoTheme.card,
            borderRadius: 12,
            padding: 16,
            border: `1px solid ${minimalDemoTheme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <strong style={{ color: minimalDemoTheme.text }}>
            Typed outputs
          </strong>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            <li>
              Slew limited → <code>{slewPaths.slew}</code>
            </li>
            <li>
              Damp smoothed → <code>{slewPaths.damp}</code>
            </li>
          </ul>
          <div style={{ color: minimalDemoTheme.muted, fontSize: 14 }}>
            Latest damped value: {frame.damp?.toFixed(3) ?? "…"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <ParamEditor
              label="Slew max rate"
              value={maxRate}
              min={0.1}
              step={0.1}
              disabled={!runtime.ready}
              onCommit={(next) => {
                setMaxRate(next);
                runtime.setParam("slew_node", "max_rate", next);
              }}
              helpText="Radians per second"
            />
            <ParamEditor
              label="Damp half-life"
              value={halfLife}
              min={0.01}
              step={0.01}
              disabled={!runtime.ready}
              onCommit={(next) => {
                setHalfLife(next);
                runtime.setParam("damp_node", "half_life", next);
              }}
              helpText="Seconds"
            />
          </div>
        </div>

        <div
          style={{
            background: minimalDemoTheme.card,
            borderRadius: 12,
            padding: 16,
            border: `1px solid ${minimalDemoTheme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <strong style={{ color: minimalDemoTheme.text }}>
            Driver sample
          </strong>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 14,
              color: minimalDemoTheme.text,
            }}
          >
            {driverNumber !== undefined ? driverNumber.toFixed(3) : "…"}
          </div>
        </div>
      </div>

      <TimeSeriesChart
        title="Animation driver"
        series={[
          { label: "raw track", color: "#f87171", values: series.driver },
        ]}
      />

      <TimeSeriesChart
        title="Graph processed outputs"
        series={[
          { label: "raw", color: "#fb7185", values: series.raw },
          { label: "slew", color: "#fbbf24", values: series.slew },
          { label: "damp", color: "#4ade80", values: series.damp },
        ]}
      />
    </div>
  );
}

export function SlewDampDemo() {
  return (
    <GraphProvider spec={slewGraphSpec} autoStart autoMode="raf" updateHz={60}>
      <SlewDampInner />
    </GraphProvider>
  );
}

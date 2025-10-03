import React, { useEffect, useMemo, useRef } from "react";
import {
  valueAsNumber,
  valueAsNumericArray,
  valueAsTransform,
  type Value,
} from "@vizij/animation-react";

type Sample = { t: number; v: Value };
type HistoryEntry = { value: Sample[]; derivative: Sample[] };
type History = Record<string, HistoryEntry>;

function valueToSeries(v: Value): number[] | null {
  switch (v.type) {
    case "float": {
      const num = valueAsNumber(v);
      return [typeof num === "number" ? num : 0];
    }
    case "bool":
      return [v.data ? 1 : 0];
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat":
    case "colorrgba":
    case "vector": {
      const arr = valueAsNumericArray(v);
      return arr ? arr.map((n) => (Number.isFinite(n) ? Number(n) : 0)) : null;
    }
    case "transform": {
      const tr = valueAsTransform(v);
      if (!tr) return null;
      return [
        ...tr.translation.map((n) => (Number.isFinite(n) ? Number(n) : 0)),
        ...tr.rotation.map((n) => (Number.isFinite(n) ? Number(n) : 0)),
        ...tr.scale.map((n) => (Number.isFinite(n) ? Number(n) : 0)),
      ];
    }
    case "enum": {
      const [, inner] = v.data;
      return inner ? valueToSeries(inner) : null;
    }
    case "record":
      return (
        Object.values(v.data)
          .map((entry) => valueToSeries(entry))
          .find((series) => series && series.length > 0) ?? null
      );
    case "array":
    case "list":
    case "tuple":
      return v.data.length > 0 ? valueToSeries(v.data[0]) : null;
    case "text":
      return null;
    default:
      return null;
  }
}

const seriesColors = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#a78bfa",
  "#f87171",
  "#38bdf8",
];

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  samples: Sample[],
  windowSec: number,
  dashed: boolean,
) {
  const now = performance.now() / 1000;
  const startT = now - windowSec;

  // Build aligned series arrays per component index
  const time: number[] = [];
  const components: number[][] = [];

  for (const s of samples) {
    if (s.t < startT) continue;
    const ser = valueToSeries(s.v);
    if (!ser) continue;
    if (components.length < ser.length) {
      for (let i = components.length; i < ser.length; i++) components.push([]);
    }
    time.push(s.t);
    for (let i = 0; i < components.length; i++) {
      components[i].push(ser[i] ?? NaN);
    }
  }

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Axes style
  ctx.strokeStyle = "#2a2d31";
  ctx.lineWidth = 1;
  // X axis baseline
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(w, h - 0.5);
  ctx.stroke();

  if (time.length === 0) return;

  // Determine time domain
  const tMin = Math.min(startT, time[0]);
  const tMax = now;
  const tSpan = Math.max(0.001, tMax - tMin);

  // Compute per-series y domain
  const yMins: number[] = [];
  const yMaxs: number[] = [];
  for (const comp of components) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of comp) {
      if (!Number.isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = 0;
      mx = 1;
    }
    if (mn === mx) {
      // Expand degenerate range
      mn -= 0.5;
      mx += 0.5;
    }
    yMins.push(mn);
    yMaxs.push(mx);
  }

  let globalMin = Number.isFinite(Math.min(...yMins)) ? Math.min(...yMins) : 0;
  let globalMax = Number.isFinite(Math.max(...yMaxs)) ? Math.max(...yMaxs) : 1;
  if (globalMin === globalMax) {
    const delta = Math.abs(globalMin) > 1 ? Math.abs(globalMin) * 0.1 : 0.5;
    globalMin -= delta;
    globalMax += delta;
  }
  const span = Math.max(1e-6, globalMax - globalMin);

  const zeroInRange = globalMin <= 0 && globalMax >= 0;
  const zeroY = h - ((0 - globalMin) / span) * (h - 2) - 1;

  if (zeroInRange) {
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#9aa0a6";
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(globalMax.toFixed(2), 4, 4);
  ctx.textBaseline = "bottom";
  ctx.fillText(globalMin.toFixed(2), 4, h - 4);
  if (zeroInRange) {
    ctx.textBaseline = "alphabetic";
    ctx.fillText("0.00", 4, zeroY - 2);
  }
  ctx.restore();

  // Draw each series
  components.forEach((comp, idx) => {
    const col = seriesColors[idx % seriesColors.length];
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < comp.length; i++) {
      const t = time[i];
      const v = comp[i];
      if (!Number.isFinite(v)) continue;

      const x = ((t - tMin) / tSpan) * w;
      // Normalize y using shared global range so axis labels match
      const yNorm = (v - globalMin) / span;
      const y = h - yNorm * (h - 2) - 1;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
}

function ChartCanvas({
  samples,
  windowSec,
  variant = "value",
}: {
  samples: Sample[];
  windowSec: number;
  variant?: "value" | "derivative";
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (
        canvas.width !== Math.floor(rect.width * dpr) ||
        canvas.height !== Math.floor(rect.height * dpr)
      ) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawChart(
        ctx,
        rect.width,
        rect.height,
        samples,
        windowSec,
        variant === "derivative",
      );
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [samples, windowSec, variant]);

  return (
    <canvas
      ref={ref}
      style={{
        width: "100%",
        height: 160,
        display: "block",
        background: "#0f1113",
        borderRadius: 8,
        border: "1px solid #2a2d31",
      }}
    />
  );
}

export default function ChartsView({
  history,
  windowSec = 10,
}: {
  history: History;
  windowSec?: number;
}) {
  const entries = useMemo(() => Object.entries(history), [history]);

  if (entries.length === 0) {
    return (
      <div style={{ opacity: 0.7, fontSize: 12, padding: 12 }}>
        No numeric history yet. Start playback to populate charts.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
        padding: 12,
      }}
    >
      {entries.map(([key, entry]) => (
        <div key={key} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{key}</div>
          <ChartCanvas samples={entry.value} windowSec={windowSec} />
          <div style={{ fontSize: 11, opacity: 0.55 }}>Derivative</div>
          <ChartCanvas
            samples={entry.derivative}
            windowSec={windowSec}
            variant="derivative"
          />
        </div>
      ))}
    </div>
  );
}

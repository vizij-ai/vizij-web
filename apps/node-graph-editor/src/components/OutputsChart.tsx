import React, { useEffect, useRef } from "react";
import { useNodeOutput } from "@vizij/node-graph-react";

/**
 * OutputsChart
 * - Simple custom SVG time-series chart for a single output series.
 * - Props:
 *    - nodeId: string
 *    - outputKey: string
 *    - color?: string
 *    - maxPoints?: number (default 200)
 *
 * Behavior:
 * - Subscribes to the runtime output for nodeId/outputKey using useNodeOutput
 * - Extracts a numeric sample (best-effort) and appends to an internal circular buffer
 * - Renders a small SVG sparkline with min/max labels
 *
 * Notes:
 * - This is intentionally small and dependency-free. It focuses on floats/vec components.
 * - For complex shapes (vec3/vec4/array) it will attempt to extract the first numeric component.
 * - The buffer stores { t: timestamp, v: number } samples.
 */

type Props = {
  nodeId: string;
  outputKey: string;
  color?: string;
  maxPoints?: number;
  width?: number;
  height?: number;
  label?: string;
};

function extractNumericValue(value: any): number | null {
  if (value == null) return null;
  // Common shapes: { float: number }, { bool: boolean }, { vec3: [n,n,n] }, { vector: [n,...] }, plain number, or wrapped 'value'
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") {
    if ("float" in value && typeof value.float === "number") return value.float;
    if ("bool" in value && typeof value.bool === "boolean")
      return value.bool ? 1 : 0;
    if (
      "vec3" in value &&
      Array.isArray(value.vec3) &&
      typeof value.vec3[0] === "number"
    )
      return value.vec3[0];
    if (
      "vec4" in value &&
      Array.isArray(value.vec4) &&
      typeof value.vec4[0] === "number"
    )
      return value.vec4[0];
    if (
      "vector" in value &&
      Array.isArray(value.vector) &&
      typeof value.vector[0] === "number"
    )
      return value.vector[0];
    if ("value" in value) return extractNumericValue(value.value);
    // If it's an array-like
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "number"
    )
      return value[0];
  }
  return null;
}

export default function OutputsChart({
  nodeId,
  outputKey,
  color = "#22d3ee",
  maxPoints = 200,
  width = 300,
  height = 80,
  label,
}: Props): JSX.Element {
  const output = useNodeOutput(nodeId, outputKey);
  const bufferRef = useRef<{ t: number; v: number }[]>([]);
  const lastTRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const v = extractNumericValue(output);
    if (v == null) return;
    const buf = bufferRef.current;
    buf.push({ t: now, v });
    if (buf.length > maxPoints) {
      buf.splice(0, buf.length - maxPoints);
    }
    lastTRef.current = now;
    // no dependencies besides output (subscription via hook)
  }, [output, maxPoints]);

  // Prepare drawing data
  const samples = bufferRef.current.slice();
  if (samples.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          background: "#0f1720",
          borderRadius: 6,
        }}
      >
        <div style={{ textAlign: "center", fontSize: 12 }}>
          <div>{label ?? `${nodeId}.${outputKey}`}</div>
          <div style={{ fontSize: 11, color: "#666" }}>No data</div>
        </div>
      </div>
    );
  }

  const values = samples.map((s) => s.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const paddingLeft = 30;
  const paddingRight = 6;
  const paddingTop = 6;
  const paddingBottom = 18;
  const plotW = Math.max(1, width - paddingLeft - paddingRight);
  const plotH = Math.max(1, height - paddingTop - paddingBottom);

  const points = samples.map((s, i) => {
    const x = paddingLeft + (i / Math.max(1, samples.length - 1)) * plotW;
    const y = paddingTop + (1 - (s.v - min) / range) * plotH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const latest = values[values.length - 1];

  return (
    <div
      style={{
        width,
        height,
        background: "#071227",
        borderRadius: 6,
        padding: 6,
        color: "#ddd",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div style={{ fontSize: 12 }}>{label ?? `${nodeId}.${outputKey}`}</div>
        <div style={{ fontSize: 12, color: "#9aa0a6" }}>
          {latest.toFixed(3)}
        </div>
      </div>
      <svg
        width={width}
        height={height - 28}
        viewBox={`0 0 ${width} ${height - 28}`}
        style={{ background: "#071827", borderRadius: 4 }}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height - 28}
          fill="transparent"
        />
        {/* axis labels */}
        <text x={6} y={12} fontSize={10} fill="#7f8c8d">
          {max.toFixed(3)}
        </text>
        <text x={6} y={height - 40} fontSize={10} fill="#7f8c8d">
          {min.toFixed(3)}
        </text>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(" ")}
        />
      </svg>
    </div>
  );
}

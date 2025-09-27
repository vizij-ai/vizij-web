import React from "react";

export interface SeriesConfig {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  title: string;
  series: SeriesConfig[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 140;

function buildPath(values: number[], width: number, height: number, min: number, max: number) {
  if (values.length === 0) return "";
  const span = max - min || 1;
  return values
    .map((value, idx) => {
      const x =
        values.length > 1 ? (idx / (values.length - 1)) * width : width / 2;
      const clamped = Math.max(min, Math.min(max, value));
      const y = height - ((clamped - min) / span) * height;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TimeSeriesChart({
  title,
  series,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Props) {
  const allValues = series.flatMap((entry) => entry.values);
  const min =
    allValues.length > 0 ? Math.min(...allValues, 0) : 0;
  const max =
    allValues.length > 0 ? Math.max(...allValues, 1) : 1;
  const adjustedMin = min === max ? min - 1 : min;
  const adjustedMax = min === max ? max + 1 : max;

  return (
    <div
      style={{
        border: "1px solid #333",
        borderRadius: 12,
        padding: 16,
        background: "#0b0f1a",
        color: "#f8fafc",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{title}</div>
      <svg width={width} height={height} style={{ background: "#111827", borderRadius: 8 }}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#1f2937"
          strokeDasharray="4 4"
        />
        {series.map((entry) => (
          <path
            key={entry.label}
            d={buildPath(entry.values, width, height, adjustedMin, adjustedMax)}
            fill="none"
            stroke={entry.color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.9}
          />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        {series.map((entry) => {
          const latest = entry.values[entry.values.length - 1];
          return (
            <div key={entry.label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: entry.color,
                }}
              />
              <span style={{ fontSize: 14 }}>
                {entry.label}
                {typeof latest === "number"
                  ? `: ${latest.toFixed(3)}`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

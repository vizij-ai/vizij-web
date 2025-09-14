import React from "react";

type Series = Record<string, number[]>;

const COLORS = [
  "#00aaff",
  "#ff6b6b",
  "#51cf66",
  "#ffd43b",
  "#845ef7",
  "#ffa94d",
  "#4dabf7",
  "#e64980",
];

export default function MultiSeriesChart({
  series,
  width = 150,
  height = 60,
  background = "#1e1e1e",
  strokeWidth = 1,
  maxPoints = 100,
}: {
  series: Series;
  width?: number;
  height?: number;
  background?: string;
  strokeWidth?: number;
  maxPoints?: number;
}) {
  const keys = Object.keys(series);
  if (keys.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          border: "1px solid #444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          background,
          borderRadius: 4,
        }}
      >
        No data
      </div>
    );
  }

  // Clamp series length
  const clamped: Series = {};
  for (const k of keys) {
    const arr = series[k] ?? [];
    clamped[k] = arr.slice(Math.max(0, arr.length - maxPoints));
  }

  // Global min/max so lines share the same scale
  let minVal = Number.POSITIVE_INFINITY;
  let maxVal = Number.NEGATIVE_INFINITY;
  for (const k of keys) {
    const arr = clamped[k];
    for (const v of arr) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  if (!isFinite(minVal) || !isFinite(maxVal)) {
    minVal = 0;
    maxVal = 1;
  }
  const range = maxVal - minVal || 1;

  // Compute polylines
  const polylines = keys.map((k, idx) => {
    const arr = clamped[k];
    if (arr.length < 2) return null;
    const n = arr.length;
    const pts = arr
      .map((val, i) => {
        const x = (i / (n - 1)) * width;
        const y = height - ((val - minVal) / range) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    const color = COLORS[idx % COLORS.length];
    return (
      <polyline
        key={k}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        points={pts}
      />
    );
  });

  // Legend
  const legend = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      {keys.map((k, idx) => {
        const color = COLORS[idx % COLORS.length];
        return (
          <div
            key={k}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: "#aaa",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 2,
                background: color,
              }}
            />
            {k}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ background, borderRadius: 4, border: "1px solid #444" }}
      >
        {polylines}
      </svg>
      {legend}
    </div>
  );
}

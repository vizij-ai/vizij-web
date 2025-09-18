import React from "react";

export type HistoryPoint = {
  sample: number[];
  dt: number;
};

const COLORS = [
  "#22d3ee",
  "#a855f7",
  "#f97316",
  "#4ade80",
  "#eab308",
  "#f43f5e",
  "#38bdf8",
  "#6366f1",
];

const HistoryChart = ({
  history,
  width = 150,
  height = 40,
}: {
  history: HistoryPoint[];
  width?: number;
  height?: number;
}) => {
  if (!history || history.length < 2) {
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
          background: "#1e1e1e",
          borderRadius: 4,
        }}
      >
        No data
      </div>
    );
  }

  const normalized: number[][] = history.map((point) => point.sample);

  const seriesCount = normalized.reduce(
    (max, sample) => Math.max(max, sample.length || 0),
    0,
  );

  if (!seriesCount) {
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
          background: "#1e1e1e",
          borderRadius: 4,
        }}
      >
        No data
      </div>
    );
  }

  const values = normalized.flat().filter((val) => Number.isFinite(val));

  if (values.length === 0) {
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
          background: "#1e1e1e",
          borderRadius: 4,
        }}
      >
        No data
      </div>
    );
  }

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal;

  const labelPadding = 32;
  const rightPadding = 4;
  const plotWidth = Math.max(width - labelPadding - rightPadding, 1);

  const cumulativeTimes: number[] = [];
  let totalTime = 0;
  history.forEach((point) => {
    totalTime += Math.max(point.dt, 0);
    cumulativeTimes.push(totalTime);
  });

  const fallbackDomain = Math.max(history.length - 1, 1);
  const domain = totalTime > 0 ? totalTime : fallbackDomain;
  // const domain = fallbackDomain/100;

  const polylines = Array.from({ length: seriesCount }, (_, seriesIndex) => {
    const points = normalized
      .reduce<string[]>((acc, sample, sampleIndex) => {
        const val = sample[seriesIndex];
        if (typeof val !== "number" || !Number.isFinite(val)) {
          return acc;
        }

        const t = totalTime > 0 ? cumulativeTimes[sampleIndex] : sampleIndex;
        const x = labelPadding + (domain > 0 ? (t / domain) * plotWidth : 0);
        const y =
          range === 0 ? height / 2 : height - ((val - minVal) / range) * height;

        acc.push(`${x.toFixed(5)},${y.toFixed(5)}`);
        return acc;
      }, [])
      .join(" ");

    if (!points) {
      return null;
    }
    return (
      <polyline
        key={seriesIndex}
        fill="none"
        stroke={COLORS[seriesIndex % COLORS.length]}
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    );
  }).filter(Boolean);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: "#1e1e1e", borderRadius: 4 }}
    >
      <line
        x1={labelPadding}
        y1={0}
        x2={labelPadding}
        y2={height}
        stroke="#333"
        strokeWidth={1}
      />
      <text
        x={labelPadding - 4}
        y={10}
        fill="#9aa0a6"
        fontSize={9}
        textAnchor="end"
      >
        {maxVal.toFixed(2)}
      </text>
      <text
        x={labelPadding - 4}
        y={height - 4}
        fill="#9aa0a6"
        fontSize={9}
        textAnchor="end"
      >
        {minVal.toFixed(2)}
      </text>
      {polylines}
    </svg>
  );
};

export default HistoryChart;

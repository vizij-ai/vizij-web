import React, { useCallback, useMemo, useRef } from "react";

export type InstanceSpan = {
  id: number;
  start: number; // seconds in player time
  end: number; // seconds in player time (>= start)
  color?: string;
  label?: string;
};

export default function Timeline({
  length,
  time,
  windowStart,
  windowEnd,
  instances,
  onSeek,
  height = 36,
}: {
  length: number; // seconds, full player length (computed by engine)
  time: number; // seconds, current playhead
  windowStart?: number; // seconds
  windowEnd?: number | null; // seconds or null for open-ended
  instances: InstanceSpan[];
  onSeek?: (t: number) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const safeLen = length > 0 ? length : 1;

  const clamp = (v: number, mn: number, mx: number) =>
    Math.max(mn, Math.min(mx, v));

  const pct = useCallback(
    (t: number) => `${clamp(t / safeLen, 0, 1) * 100}%`,
    [safeLen],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const norm = rect.width > 0 ? x / rect.width : 0;
      const t = norm * safeLen;
      onSeek(t);
    },
    [onSeek, safeLen],
  );

  const playheadLeft = useMemo(() => pct(time), [pct, time]);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        height,
        background: "#0f1113",
        border: "1px solid #2a2d31",
        borderRadius: 6,
        cursor: onSeek ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {/* Instance spans */}
      {instances.map((inst) => {
        const left = pct(inst.start);
        const w = Math.max(0, inst.end - inst.start);
        const width = pct(w);
        return (
          <div
            key={inst.id}
            title={inst.label ?? `inst_${inst.id}`}
            style={{
              position: "absolute",
              left,
              top: 4,
              height: height - 8,
              width,
              background: inst.color ?? "rgba(96,165,250,0.35)", // blue-400-ish
              border: "1px solid rgba(96,165,250,0.6)",
              borderRadius: 4,
            }}
          />
        );
      })}

      {/* Window overlay */}
      {typeof windowStart === "number" && (
        <div
          style={{
            position: "absolute",
            left: pct(windowStart),
            top: 2,
            height: height - 4,
            width: pct((windowEnd ?? safeLen) - windowStart),
            background: "rgba(56,189,248,0.15)", // cyan overlay
            border: "1px dashed rgba(56,189,248,0.5)",
            borderRadius: 4,
          }}
          title={`window: ${windowStart.toFixed(2)}s → ${windowEnd ?? safeLen}s`}
        />
      )}

      {/* Playhead */}
      <div
        style={{
          position: "absolute",
          left: playheadLeft,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#f87171", // red-400
          transform: "translateX(-1px)",
        }}
        title={`t=${time.toFixed(2)}s / ${safeLen.toFixed(2)}s`}
      />

      {/* Ruler labels */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 6,
          fontSize: 10,
          color: "#9aa0a6",
        }}
      >
        0s
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 6,
          fontSize: 10,
          color: "#9aa0a6",
        }}
      >
        {safeLen.toFixed(2)}s
      </div>
    </div>
  );
}

import React, { useCallback, useMemo, useRef } from "react";

export type InstanceSpan = {
  id: number;
  start: number;
  end: number;
  color?: string;
  label?: string;
};

export type TimelineMarker = {
  id: string | number;
  time: number;
  color?: string;
  label?: string;
};

type TimelineProps = {
  length: number;
  time: number;
  windowStart?: number;
  windowEnd?: number | null;
  instances: InstanceSpan[];
  markers?: TimelineMarker[];
  onSeek?: (t: number) => void;
  height?: number;
  startTime?: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export default function Timeline({
  length,
  time,
  windowStart,
  windowEnd,
  instances,
  markers = [],
  onSeek,
  height = 36,
  startTime = 0,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const origin = Number.isFinite(startTime) ? startTime : 0;
  const spanRaw = length - origin;
  const span = spanRaw > 0 ? spanRaw : Math.max(length, 1);

  const clamp = (v: number, mn: number, mx: number) =>
    Math.max(mn, Math.min(mx, v));

  const toPct = useCallback(
    (t: number) => {
      const norm = (t - origin) / span;
      return `${clamp01(norm) * 100}%`;
    },
    [origin, span],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const norm = rect.width > 0 ? x / rect.width : 0;
      const nextTime = origin + norm * span;
      onSeek(nextTime);
    },
    [onSeek, origin, span],
  );

  const playheadLeft = useMemo(() => toPct(time), [toPct, time]);

  const overlayStart = typeof windowStart === "number" ? windowStart : origin;
  const overlayEnd = (() => {
    if (typeof windowEnd === "number") return windowEnd;
    if (windowEnd === null) return length;
    return origin + span;
  })();

  const overlayLeft = toPct(overlayStart);
  const overlayWidth = `${clamp01((overlayEnd - overlayStart) / span) * 100}%`;

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
      {instances.map((inst) => {
        const left = toPct(inst.start);
        const width = `${clamp01((inst.end - inst.start) / span) * 100}%`;
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
              background: inst.color ?? "rgba(96,165,250,0.35)",
              border: "1px solid rgba(96,165,250,0.6)",
              borderRadius: 4,
            }}
          />
        );
      })}

      {typeof windowStart === "number" && (
        <div
          style={{
            position: "absolute",
            left: overlayLeft,
            top: 2,
            height: height - 4,
            width: overlayWidth,
            background: "rgba(56,189,248,0.15)",
            border: "1px dashed rgba(56,189,248,0.5)",
            borderRadius: 4,
          }}
          title={`window: ${overlayStart.toFixed(2)}s → ${overlayEnd.toFixed(2)}s`}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: playheadLeft,
          top: 0,
          bottom: 0,
          width: 2,
          background: "#f87171",
          transform: "translateX(-1px)",
          zIndex: 3,
        }}
        title={`t=${time.toFixed(2)}s / ${(origin + span).toFixed(2)}s`}
      />

      {markers.map((marker) => {
        const left = toPct(marker.time);
        return (
          <div
            key={marker.id}
            title={
              marker.label
                ? `${marker.label} @ ${marker.time.toFixed(2)}s`
                : `${marker.time.toFixed(2)}s`
            }
            style={{
              position: "absolute",
              left,
              top: 0,
              bottom: 0,
              width: 2,
              background: marker.color ?? "rgba(255,255,255,0.65)",
              opacity: 0.9,
              transform: "translateX(-1px)",
              zIndex: 2,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 6,
          fontSize: 10,
          color: "#9aa0a6",
        }}
      >
        {origin.toFixed(2)}s
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
        {length.toFixed(2)}s
      </div>
    </div>
  );
}

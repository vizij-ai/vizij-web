import React, { useEffect, useMemo, useRef } from "react";
import { useAnimation } from "@vizij/animation-react";
import type {
  InstanceInfo,
  StoredAnimation,
  Value as WasmValue,
  BakedAnimationData,
} from "@vizij/animation-wasm";

type AnimationSourceMap =
  | Map<number, StoredAnimation>
  | Record<number, StoredAnimation>
  | undefined;

type PlotSample = { time: number; value: number };

type PlotCurve = {
  id: string;
  color: string;
  label: string;
  samples: PlotSample[];
};

type BakedTrackData = BakedAnimationData["tracks"][number];

type PlotData = {
  curves: PlotCurve[];
  minValue: number;
  maxValue: number;
  origin: number;
  end: number;
};

type BakedAnimationPlotProps = {
  playerLength: number;
  playerStartTime?: number;
  playheadTime: number;
  instances: InstanceInfo[];
  animationSourcesById?: AnimationSourceMap;
  fallbackColors?: string[];
};

const DEFAULT_COLORS = [
  "rgba(96,165,250,0.75)",
  "rgba(52,211,153,0.75)",
  "rgba(251,191,36,0.75)",
  "rgba(244,114,182,0.75)",
  "rgba(34,211,238,0.75)",
  "rgba(167,139,250,0.75)",
  "rgba(248,113,113,0.75)",
  "rgba(56,189,248,0.75)",
];

const toScalar = (value: WasmValue | null | undefined): number | null => {
  if (!value) return null;
  const { type, data } = value as WasmValue & { data: any };
  switch (type) {
    case "Scalar":
    case "Float":
      return Number.isFinite(data) ? Number(data) : null;
    case "Bool":
      return data ? 1 : 0;
    case "Vec2":
    case "Vec3":
    case "Vec4":
    case "Color":
    case "ColorRgba": {
      if (!Array.isArray(data)) return null;
      const nums = data.filter((n) => Number.isFinite(n)) as number[];
      if (nums.length === 0) return null;
      if (nums.length === 1) return nums[0];
      const squared = nums.reduce((acc, v) => acc + v * v, 0);
      return Math.sqrt(squared);
    }
    case "Quat": {
      if (!Array.isArray(data)) return null;
      const nums = data.filter((n) => Number.isFinite(n)) as number[];
      if (nums.length === 0) return null;
      const squared = nums.reduce((acc, v) => acc + v * v, 0);
      return Math.sqrt(squared);
    }
    case "Transform": {
      if (!data || typeof data !== "object") return null;
      const parts = [
        data.translation ?? data.pos,
        data.rotation ?? data.rot,
        data.scale,
      ];
      const nums = parts.flat().filter((n) => Number.isFinite(n)) as number[];
      if (nums.length === 0) return null;
      const squared = nums.reduce((acc, v) => acc + v * v, 0);
      return Math.sqrt(squared);
    }
    default:
      return null;
  }
};

const mapAnimationSources = (
  sources: AnimationSourceMap,
): Map<number, StoredAnimation> => {
  if (!sources) return new Map();
  if (sources instanceof Map) return sources;
  return new Map(
    Object.entries(sources).map(([key, value]) => [
      Number(key),
      value as StoredAnimation,
    ]),
  );
};

const resolveTrackColor = (
  anim: StoredAnimation | undefined,
  targetPath: string,
  fallback: string,
): string => {
  if (!anim) return fallback;
  const match = anim.tracks?.find((track: any) => {
    return track?.animatableId === targetPath || track?.id === targetPath;
  });
  const color = match?.settings?.color;
  return typeof color === "string" && color.trim().length > 0
    ? color
    : fallback;
};

const EPS = 1e-6;

function buildPlotData(
  bake: ((animIndexOrId: number) => BakedAnimationData | null) | undefined,
  instances: InstanceInfo[],
  playerLength: number,
  playerStartTime: number,
  animationSources: Map<number, StoredAnimation>,
  fallbackColors: string[],
): PlotData {
  if (typeof bake !== "function" || instances.length === 0) {
    return {
      curves: [],
      minValue: 0,
      maxValue: 1,
      origin: playerStartTime,
      end: Math.max(playerLength, playerStartTime + 1),
    };
  }

  const bakedCache = new Map<number, BakedAnimationData | null>();
  const getBaked = (animId: number) => {
    if (!bakedCache.has(animId)) {
      bakedCache.set(animId, bake(animId));
    }
    return bakedCache.get(animId);
  };

  const curves: PlotCurve[] = [];
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  let minTime = playerStartTime;
  let maxTime = playerLength;

  instances.forEach((instance, idx) => {
    const baked = getBaked(instance.animation);
    if (!baked) return;

    const sourceAnim = animationSources.get(instance.animation);
    const offset = Number(instance.cfg?.start_offset ?? 0) || 0;
    const rawScale = Number(instance.cfg?.time_scale ?? 1);
    const scale =
      Number.isFinite(rawScale) && Math.abs(rawScale) > EPS ? rawScale : 1;
    const absScale = Math.abs(scale);
    const direction = scale >= 0 ? 1 : -1;
    const clipSpan = baked.end_time - baked.start_time;
    const colorFallback =
      fallbackColors[idx % fallbackColors.length] ??
      DEFAULT_COLORS[idx % DEFAULT_COLORS.length];

    baked.tracks.forEach((track: BakedTrackData) => {
      const color = resolveTrackColor(
        sourceAnim,
        track.target_path,
        colorFallback,
      );
      const samples: PlotSample[] = [];

      track.values.forEach((value: WasmValue, sampleIndex: number) => {
        const scalar = toScalar(value);
        if (scalar === null) return;
        const clipTime = baked.start_time + sampleIndex / baked.frame_rate;
        const relative =
          direction >= 0
            ? clipTime - baked.start_time
            : baked.end_time - clipTime;
        const globalTime = offset + relative * absScale;
        samples.push({ time: globalTime, value: scalar });
        if (Number.isFinite(scalar)) {
          if (scalar < minValue) minValue = scalar;
          if (scalar > maxValue) maxValue = scalar;
        }
        if (Number.isFinite(globalTime)) {
          if (globalTime < minTime) minTime = globalTime;
          if (globalTime > maxTime) maxTime = globalTime;
        }
      });

      if (samples.length === 0) return;
      samples.sort((a, b) => a.time - b.time);
      curves.push({
        id: `${instance.id}:${track.target_path}`,
        color,
        label: track.target_path,
        samples,
      });
    });

    // Extend span by instance duration if baked data did not cover it fully.
    const instanceDuration = clipSpan / absScale;
    if (direction >= 0) {
      const potentialEnd = offset + instanceDuration;
      if (potentialEnd > maxTime) maxTime = potentialEnd;
    } else {
      const potentialStart = offset - instanceDuration;
      if (potentialStart < minTime) minTime = potentialStart;
    }
  });

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0;
    maxValue = 1;
  }
  if (minValue === maxValue) {
    const delta = Math.abs(minValue) > 1 ? Math.abs(minValue) * 0.05 : 0.5;
    minValue -= delta;
    maxValue += delta;
  }

  if (!Number.isFinite(minTime)) minTime = playerStartTime;
  if (!Number.isFinite(maxTime))
    maxTime = Math.max(playerLength, playerStartTime + 1);
  if (maxTime <= minTime) {
    maxTime = minTime + 1;
  }

  const origin = Math.min(playerStartTime, minTime);
  const end = Math.max(playerLength, maxTime);

  return { curves, minValue, maxValue, origin, end };
}

export default function BakedAnimationPlot({
  playerLength,
  playerStartTime = 0,
  playheadTime,
  instances,
  animationSourcesById,
  fallbackColors = DEFAULT_COLORS,
}: BakedAnimationPlotProps) {
  const animCtx = useAnimation() as any;
  const bakeAnimation = animCtx?.bakeAnimation as
    | ((animIndexOrId: number) => BakedAnimationData | null)
    | undefined;

  const animationSources = useMemo(
    () => mapAnimationSources(animationSourcesById),
    [animationSourcesById],
  );

  const plot = useMemo(
    () =>
      buildPlotData(
        bakeAnimation,
        instances,
        playerLength,
        playerStartTime,
        animationSources,
        fallbackColors,
      ),
    [
      bakeAnimation,
      instances,
      playerLength,
      playerStartTime,
      animationSources,
      fallbackColors,
    ],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
      const targetHeight = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlot(ctx, rect.width, rect.height, plot, playheadTime);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [plot, playheadTime]);

  if (plot.curves.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          opacity: 0.65,
          padding: "6px 8px",
          background: "#0f1113",
          border: "1px solid #2a2d31",
          borderRadius: 6,
        }}
      >
        Baked animation plot unavailable (no numeric tracks).
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 11, opacity: 0.75 }}>Baked animation preview</div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 160,
          display: "block",
          background: "#0f1113",
          borderRadius: 8,
          border: "1px solid #2a2d31",
        }}
      />
    </div>
  );
}

function drawPlot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  plot: PlotData,
  playheadTime: number,
) {
  ctx.clearRect(0, 0, width, height);

  // Baseline (X axis)
  ctx.strokeStyle = "#2a2d31";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();

  const valueSpan = plot.maxValue - plot.minValue;
  const safeValueSpan = Math.max(valueSpan, EPS);
  const zeroInRange = plot.minValue <= 0 && plot.maxValue >= 0;
  const zeroY =
    height - ((0 - plot.minValue) / safeValueSpan) * (height - 2) - 1;

  if (zeroInRange) {
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#9aa0a6";
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(plot.maxValue.toFixed(2), 4, 4);
  ctx.textBaseline = "bottom";
  ctx.fillText(plot.minValue.toFixed(2), 4, height - 4);
  if (zeroInRange) {
    ctx.textBaseline = "alphabetic";
    ctx.fillText("0.00", 4, zeroY - 2);
  }
  ctx.restore();

  const timeSpan = Math.max(plot.end - plot.origin, EPS);

  // Playhead
  const playheadNorm = (playheadTime - plot.origin) / timeSpan;
  if (playheadNorm >= 0 && playheadNorm <= 1) {
    const x = playheadNorm * width;
    ctx.save();
    ctx.strokeStyle = "#f87171";
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  plot.curves.forEach((curve) => {
    if (curve.samples.length === 0) return;
    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    let moved = false;
    curve.samples.forEach((sample) => {
      const x = ((sample.time - plot.origin) / timeSpan) * width;
      const yNorm = (sample.value - plot.minValue) / safeValueSpan;
      const y = height - yNorm * (height - 2) - 1;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!moved) {
        ctx.moveTo(x, y);
        moved = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.restore();
  });
}

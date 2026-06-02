import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  evaluateTrack,
  useAnimationStore,
  type AnimationKeyframe,
  type AnimationTimeDisplayMode,
  type AnimationTrack,
} from "../../state/animationStore";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { formatKeyframeTime } from "../../utils/animationTimeDisplay";
import { cn } from "../../utils/cn";

type DragTarget =
  | { kind: "keyframe"; keyframeId: string }
  | { kind: "outHandle"; segmentIndex: number }
  | { kind: "inHandle"; segmentIndex: number };

type PlotPoint = {
  time: number;
  value: number;
};

type SegmentGeometry = {
  start: AnimationKeyframe;
  end: AnimationKeyframe;
  startIndex: number;
  cp1: PlotPoint;
  cp2: PlotPoint;
};

const SVG_WIDTH = 920;
const SVG_HEIGHT = 132;
const PLOT = {
  left: 52,
  top: 12,
  right: 24,
  bottom: 22,
};
const EPSILON = 1e-6;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const quantize = (value: number): number => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function resolveTrackRange(
  track: AnimationTrack,
  inputRange?: { min?: number; max?: number } | null,
) {
  const values = track.keyframes
    .map((keyframe) => keyframe.value)
    .filter((value) => Number.isFinite(value));
  const inputMin = Number(inputRange?.min);
  const inputMax = Number(inputRange?.max);
  if (Number.isFinite(inputMin)) values.push(inputMin);
  if (Number.isFinite(inputMax)) values.push(inputMax);

  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = Math.max((max - min) * 0.14, 0.08);
  return { min: min - pad, max: max + pad };
}

function resolveSelectedSegmentIndex(
  track: AnimationTrack,
  selectedKeyframeId: string | null,
): number {
  const segmentCount = Math.max(track.keyframes.length - 1, 0);
  if (segmentCount === 0) {
    return 0;
  }
  const keyframeIndex = track.keyframes.findIndex(
    (keyframe) => keyframe.id === selectedKeyframeId,
  );
  if (keyframeIndex < 0) {
    return 0;
  }
  return Math.min(keyframeIndex, segmentCount - 1);
}

function resolveSegmentGeometry(
  track: AnimationTrack,
  segmentIndex: number,
): SegmentGeometry | null {
  const start = track.keyframes[segmentIndex];
  const end = track.keyframes[segmentIndex + 1];
  if (!start || !end) {
    return null;
  }
  const span = end.time - start.time;
  if (span <= EPSILON) {
    return null;
  }
  const slope = (end.value - start.value) / span;
  const outTangent =
    typeof start.outTangent === "number" ? start.outTangent : slope;
  const inTangent = typeof end.inTangent === "number" ? end.inTangent : slope;
  return {
    start,
    end,
    startIndex: segmentIndex,
    cp1: {
      time: start.time + span / 3,
      value: start.value + (outTangent * span) / 3,
    },
    cp2: {
      time: end.time - span / 3,
      value: end.value - (inTangent * span) / 3,
    },
  };
}

function resolveSegmentInterpolation(
  track: AnimationTrack,
  geometry: SegmentGeometry | null,
): AnimationTrack["interpolation"] {
  return geometry?.start.interpolation ?? track.interpolation;
}

function capturePointer(target: Element, pointerId: number) {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events in tests do not always have an active pointer.
  }
}

interface CurveEditorProps {
  timeDisplayMode?: AnimationTimeDisplayMode;
  onInspectTrack?: (trackId: string) => void;
}

export function CurveEditor({
  timeDisplayMode = "seconds",
  onInspectTrack,
}: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const {
    tracks,
    duration,
    currentTime,
    selectedTrackId,
    selectedKeyframeId,
    selectTrack,
    selectKeyframe,
    updateKeyframe,
  } = useAnimationStore();
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );

  const selectedTrack = useMemo(
    () =>
      selectedTrackId
        ? (tracks.find((track) => track.id === selectedTrackId) ?? null)
        : (tracks[0] ?? null),
    [selectedTrackId, tracks],
  );
  const selectedInputRange = selectedTrack
    ? standardInputsById.get(selectedTrack.variableId)?.range
    : null;
  const range = useMemo(
    () =>
      selectedTrack
        ? resolveTrackRange(selectedTrack, selectedInputRange)
        : { min: 0, max: 1 },
    [selectedInputRange, selectedTrack],
  );
  const segmentIndex = selectedTrack
    ? resolveSelectedSegmentIndex(selectedTrack, selectedKeyframeId)
    : 0;
  const geometry = selectedTrack
    ? resolveSegmentGeometry(selectedTrack, segmentIndex)
    : null;
  const segmentInterpolation = selectedTrack
    ? resolveSegmentInterpolation(selectedTrack, geometry)
    : "linear";

  const plotWidth = SVG_WIDTH - PLOT.left - PLOT.right;
  const plotHeight = SVG_HEIGHT - PLOT.top - PLOT.bottom;
  const safeDuration = Math.max(duration, EPSILON);
  const valueSpan = Math.max(range.max - range.min, EPSILON);
  const toX = (time: number) => PLOT.left + (time / safeDuration) * plotWidth;
  const toY = (value: number) =>
    PLOT.top + (1 - (value - range.min) / valueSpan) * plotHeight;
  const fromClientSvgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const svgX = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
    const svgY = ((clientY - rect.top) / rect.height) * SVG_HEIGHT;
    return {
      svgX,
      svgY,
      time: clamp(((svgX - PLOT.left) / plotWidth) * safeDuration, 0, duration),
      value: clamp(
        range.min + (1 - (svgY - PLOT.top) / plotHeight) * valueSpan,
        range.min,
        range.max,
      ),
    };
  };
  const fromClientPoint = (
    clientX: number,
    clientY: number,
  ): PlotPoint | null => {
    const svgPoint = fromClientSvgPoint(clientX, clientY);
    return svgPoint ? { time: svgPoint.time, value: svgPoint.value } : null;
  };

  const resolveDragTargetFromClient = (
    clientX: number,
    clientY: number,
  ): { target: DragTarget; keyframeId?: string } | null => {
    if (!selectedTrack) {
      return null;
    }
    const svgPoint = fromClientSvgPoint(clientX, clientY);
    if (!svgPoint) {
      return null;
    }
    const threshold = 18;
    if (geometry && segmentInterpolation === "cubic") {
      const outDistance = Math.hypot(
        svgPoint.svgX - toX(geometry.cp1.time),
        svgPoint.svgY - toY(geometry.cp1.value),
      );
      if (outDistance <= threshold) {
        return {
          target: {
            kind: "outHandle",
            segmentIndex: geometry.startIndex,
          },
        };
      }
      const inDistance = Math.hypot(
        svgPoint.svgX - toX(geometry.cp2.time),
        svgPoint.svgY - toY(geometry.cp2.value),
      );
      if (inDistance <= threshold) {
        return {
          target: {
            kind: "inHandle",
            segmentIndex: geometry.startIndex,
          },
        };
      }
    }

    let nearest: {
      distance: number;
      target: DragTarget;
      keyframeId: string;
    } | null = null;
    selectedTrack.keyframes.forEach((keyframe) => {
      const distance = Math.hypot(
        svgPoint.svgX - toX(keyframe.time),
        svgPoint.svgY - toY(keyframe.value),
      );
      if (distance > threshold) {
        return;
      }
      if (!nearest || distance < nearest.distance) {
        nearest = {
          distance,
          target: { kind: "keyframe", keyframeId: keyframe.id },
          keyframeId: keyframe.id,
        };
      }
    });
    return nearest;
  };

  const sampledPath = useMemo(() => {
    if (!selectedTrack || selectedTrack.keyframes.length === 0) {
      return "";
    }
    const samples = Math.max(48, Math.min(240, Math.ceil(safeDuration * 32)));
    const parts: string[] = [];
    for (let index = 0; index <= samples; index += 1) {
      const time = (safeDuration * index) / samples;
      const value = evaluateTrack(selectedTrack, time);
      if (!Number.isFinite(value)) {
        continue;
      }
      parts.push(
        `${parts.length === 0 ? "M" : "L"} ${toX(time).toFixed(2)} ${toY(
          value,
        ).toFixed(2)}`,
      );
    }
    return parts.join(" ");
  }, [range.max, range.min, safeDuration, selectedTrack]);

  const applyDragAt = (
    track: AnimationTrack,
    target: DragTarget,
    clientX: number,
    clientY: number,
  ) => {
    const point = fromClientPoint(clientX, clientY);
    if (!point) {
      return;
    }
    if (target.kind === "keyframe") {
      updateKeyframe(track.id, target.keyframeId, {
        time: quantize(point.time),
        value: quantize(point.value),
      });
      return;
    }

    const targetGeometry = resolveSegmentGeometry(track, target.segmentIndex);
    if (!targetGeometry) {
      return;
    }
    const minTime = targetGeometry.start.time + EPSILON;
    const maxTime = targetGeometry.end.time - EPSILON;
    const handle = {
      ...point,
      time: clamp(point.time, minTime, maxTime),
    };
    if (target.kind === "outHandle") {
      const span = Math.max(handle.time - targetGeometry.start.time, EPSILON);
      updateKeyframe(track.id, targetGeometry.start.id, {
        interpolation: "cubic",
        outTangent: quantize(
          (handle.value - targetGeometry.start.value) / span,
        ),
      });
      return;
    }
    const span = Math.max(targetGeometry.end.time - handle.time, EPSILON);
    updateKeyframe(track.id, targetGeometry.start.id, {
      interpolation: "cubic",
    });
    updateKeyframe(track.id, targetGeometry.end.id, {
      inTangent: quantize((targetGeometry.end.value - handle.value) / span),
    });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragTarget || !selectedTrack) {
      return;
    }
    applyDragAt(selectedTrack, dragTarget, event.clientX, event.clientY);
  };

  const selectSegmentInterpolation = (
    interpolation: AnimationTrack["interpolation"],
  ) => {
    if (!selectedTrack || !geometry) {
      return;
    }
    const span = Math.max(geometry.end.time - geometry.start.time, EPSILON);
    const slope = (geometry.end.value - geometry.start.value) / span;
    updateKeyframe(selectedTrack.id, geometry.start.id, {
      interpolation,
      outTangent:
        interpolation === "cubic"
          ? (geometry.start.outTangent ?? slope)
          : undefined,
    });
    updateKeyframe(selectedTrack.id, geometry.end.id, {
      inTangent:
        interpolation === "cubic"
          ? (geometry.end.inTangent ?? slope)
          : undefined,
    });
    selectKeyframe(geometry.start.id);
  };

  const beginDrag = (
    event: PointerEvent<SVGElement>,
    target: DragTarget,
    keyframeId?: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedTrack) {
      return;
    }
    capturePointer(svgRef.current ?? event.currentTarget, event.pointerId);
    dragCleanupRef.current?.();
    setDragTarget(target);
    selectTrack(selectedTrack.id);
    onInspectTrack?.(selectedTrack.id);
    if (keyframeId) {
      selectKeyframe(keyframeId);
    }
    const dragTrack = selectedTrack;
    const handleWindowPointerMove = (moveEvent: globalThis.PointerEvent) => {
      applyDragAt(dragTrack, target, moveEvent.clientX, moveEvent.clientY);
    };
    const endWindowDrag = () => {
      setDragTarget(null);
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", endWindowDrag);
      window.removeEventListener("pointercancel", endWindowDrag);
      dragCleanupRef.current = null;
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", endWindowDrag);
    window.addEventListener("pointercancel", endWindowDrag);
    dragCleanupRef.current = endWindowDrag;
  };

  const beginMouseDrag = (
    event: MouseEvent<SVGElement>,
    target: DragTarget,
    keyframeId?: string,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!selectedTrack) {
      return;
    }
    dragCleanupRef.current?.();
    setDragTarget(target);
    selectTrack(selectedTrack.id);
    onInspectTrack?.(selectedTrack.id);
    if (keyframeId) {
      selectKeyframe(keyframeId);
    }
    const dragTrack = selectedTrack;
    const handleWindowMouseMove = (moveEvent: globalThis.MouseEvent) => {
      applyDragAt(dragTrack, target, moveEvent.clientX, moveEvent.clientY);
    };
    const endWindowMouseDrag = () => {
      setDragTarget(null);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", endWindowMouseDrag);
      dragCleanupRef.current = null;
    };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", endWindowMouseDrag);
    dragCleanupRef.current = endWindowMouseDrag;
  };

  const handleSvgMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    const hit = resolveDragTargetFromClient(event.clientX, event.clientY);
    if (!hit) {
      return;
    }
    beginMouseDrag(event, hit.target, hit.keyframeId);
  };

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
    },
    [],
  );

  if (!selectedTrack) {
    return (
      <div
        data-testid="animation-curve-editor"
        className="shrink-0 rounded-xl border border-border-default/60 bg-bg-secondary/40 px-3 py-2 text-xs text-text-muted"
      >
        No animation tracks
      </div>
    );
  }

  const selectedKeyframe =
    selectedTrack.keyframes.find(
      (keyframe) => keyframe.id === selectedKeyframeId,
    ) ??
    geometry?.start ??
    selectedTrack.keyframes[0] ??
    null;
  const playheadX = toX(clamp(currentTime, 0, duration));

  return (
    <div
      data-testid="animation-curve-editor"
      className="shrink-0 rounded-xl border border-border-default/60 bg-bg-secondary/45 shadow-inner overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-default/60 bg-bg-panel/70 px-3 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selectedTrack.color }}
            />
            <span className="truncate text-[11px] font-bold text-text-primary">
              {selectedTrack.label}
            </span>
            <span className="rounded border border-border-default/50 bg-bg-input/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-muted">
              baked
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-text-muted">
            {selectedTrack.channel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
            Segment
            <select
              data-testid="animation-curve-segment-mode-select"
              className="h-7 rounded border border-border-default/70 bg-bg-input/80 px-2 font-mono text-[10px] normal-case tracking-normal text-text-primary"
              value={segmentInterpolation}
              disabled={!geometry}
              onChange={(event) =>
                selectSegmentInterpolation(
                  event.target.value as AnimationTrack["interpolation"],
                )
              }
            >
              <option value="linear">Linear</option>
              <option value="step">Step</option>
              <option value="cubic">Cubic</option>
            </select>
          </label>
          <div className="hidden grid-cols-3 gap-1 font-mono text-[10px] text-text-muted md:grid">
            <span>
              {formatKeyframeTime(geometry?.start.time ?? 0, timeDisplayMode)}
            </span>
            <span className="text-center">
              {selectedKeyframe ? selectedKeyframe.value.toFixed(3) : "0.000"}
            </span>
            <span className="text-right">
              {selectedTrack.keyframes.length} keys
            </span>
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="block h-[132px] w-full touch-none select-none"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label="Animation curve and baked preview"
        onPointerMove={handlePointerMove}
        onMouseDown={handleSvgMouseDown}
        onPointerUp={() => setDragTarget(null)}
        onPointerCancel={() => setDragTarget(null)}
      >
        <rect
          x={PLOT.left}
          y={PLOT.top}
          width={plotWidth}
          height={plotHeight}
          rx="7"
          className="fill-bg-panel/60"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={`grid-${ratio}`}>
            <line
              x1={PLOT.left + plotWidth * ratio}
              y1={PLOT.top}
              x2={PLOT.left + plotWidth * ratio}
              y2={PLOT.top + plotHeight}
              className="stroke-border-default/40"
              strokeWidth="1"
            />
            <line
              x1={PLOT.left}
              y1={PLOT.top + plotHeight * ratio}
              x2={PLOT.left + plotWidth}
              y2={PLOT.top + plotHeight * ratio}
              className="stroke-border-default/40"
              strokeWidth="1"
            />
          </g>
        ))}
        <text
          x="10"
          y={toY(range.max) + 4}
          className="fill-text-muted text-[10px]"
        >
          {range.max.toFixed(2)}
        </text>
        <text
          x="10"
          y={toY(range.min) + 4}
          className="fill-text-muted text-[10px]"
        >
          {range.min.toFixed(2)}
        </text>
        <text
          x={PLOT.left}
          y={SVG_HEIGHT - 10}
          className="fill-text-muted font-mono text-[10px]"
        >
          {formatKeyframeTime(0, timeDisplayMode)}
        </text>
        <text
          x={PLOT.left + plotWidth}
          y={SVG_HEIGHT - 10}
          textAnchor="end"
          className="fill-text-muted font-mono text-[10px]"
        >
          {formatKeyframeTime(duration, timeDisplayMode)}
        </text>

        <line
          x1={playheadX}
          y1={PLOT.top}
          x2={playheadX}
          y2={PLOT.top + plotHeight}
          className="stroke-red-400/80"
          strokeDasharray="4 3"
          strokeWidth="1.5"
        />
        <path
          data-testid="animation-baked-preview-path"
          d={sampledPath}
          fill="none"
          className="stroke-accent"
          strokeWidth="2.25"
          strokeLinecap="round"
        />

        {geometry && segmentInterpolation === "cubic" ? (
          <g>
            <line
              x1={toX(geometry.start.time)}
              y1={toY(geometry.start.value)}
              x2={toX(geometry.cp1.time)}
              y2={toY(geometry.cp1.value)}
              className="stroke-blue-300/55"
              strokeWidth="1.5"
            />
            <line
              x1={toX(geometry.end.time)}
              y1={toY(geometry.end.value)}
              x2={toX(geometry.cp2.time)}
              y2={toY(geometry.cp2.value)}
              className="stroke-emerald-300/55"
              strokeWidth="1.5"
            />
            <circle
              data-testid="animation-curve-handle-out"
              cx={toX(geometry.cp1.time)}
              cy={toY(geometry.cp1.value)}
              r="9"
              className="cursor-grab fill-blue-300 stroke-bg-app stroke-2 active:cursor-grabbing"
              style={{ pointerEvents: "all" }}
              onPointerDown={(event) =>
                beginDrag(event, {
                  kind: "outHandle",
                  segmentIndex: geometry.startIndex,
                })
              }
              onMouseDown={(event) =>
                beginMouseDrag(event, {
                  kind: "outHandle",
                  segmentIndex: geometry.startIndex,
                })
              }
            />
            <circle
              data-testid="animation-curve-handle-in"
              cx={toX(geometry.cp2.time)}
              cy={toY(geometry.cp2.value)}
              r="9"
              className="cursor-grab fill-emerald-300 stroke-bg-app stroke-2 active:cursor-grabbing"
              style={{ pointerEvents: "all" }}
              onPointerDown={(event) =>
                beginDrag(event, {
                  kind: "inHandle",
                  segmentIndex: geometry.startIndex,
                })
              }
              onMouseDown={(event) =>
                beginMouseDrag(event, {
                  kind: "inHandle",
                  segmentIndex: geometry.startIndex,
                })
              }
            />
          </g>
        ) : null}

        {selectedTrack.keyframes.map((keyframe) => {
          const selected = keyframe.id === selectedKeyframe?.id;
          return (
            <circle
              key={keyframe.id}
              data-testid="animation-curve-keyframe"
              data-keyframe-id={keyframe.id}
              cx={toX(keyframe.time)}
              cy={toY(keyframe.value)}
              r={selected ? 6.5 : 5}
              className={cn(
                "cursor-grab stroke-bg-app stroke-2 active:cursor-grabbing",
                selected ? "fill-text-primary" : "fill-text-muted",
              )}
              style={{
                fill: selected ? "var(--text-primary)" : selectedTrack.color,
                pointerEvents: "all",
              }}
              onPointerDown={(event) =>
                beginDrag(
                  event,
                  { kind: "keyframe", keyframeId: keyframe.id },
                  keyframe.id,
                )
              }
              onMouseDown={(event) =>
                beginMouseDrag(
                  event,
                  { kind: "keyframe", keyframeId: keyframe.id },
                  keyframe.id,
                )
              }
            />
          );
        })}
      </svg>
    </div>
  );
}

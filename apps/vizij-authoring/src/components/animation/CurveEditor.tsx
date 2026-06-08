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
  type AnimationCurveSelection,
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

type DragSession = {
  target: DragTarget;
  svgOffsetX: number;
  svgOffsetY: number;
};

type PlotPoint = {
  time: number;
  value: number;
};

type HandleDelta = {
  x: number;
  y: number;
};

type SegmentGeometry = {
  start: AnimationKeyframe;
  end: AnimationKeyframe;
  startIndex: number;
  interpolation: AnimationTrack["interpolation"];
  outHandle: HandleDelta;
  inHandle: HandleDelta;
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
const CUBIC_EASE_HANDLE_X = 0.65;
const STEP_HOLD_HANDLE_X = 0.98;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const quantize = (value: number): number => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function normalizeHandle(value: unknown): HandleDelta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const maybe = value as Partial<HandleDelta>;
  const x = Number(maybe.x);
  const y = Number(maybe.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: quantize(x), y: quantize(y) }
    : null;
}

function quantizeHandles(handles: {
  outHandle: HandleDelta;
  inHandle: HandleDelta;
}): { outHandle: HandleDelta; inHandle: HandleDelta } {
  return {
    outHandle: {
      x: quantize(handles.outHandle.x),
      y: quantize(handles.outHandle.y),
    },
    inHandle: {
      x: quantize(handles.inHandle.x),
      y: quantize(handles.inHandle.y),
    },
  };
}

function resolvePresetHandles(
  interpolation: AnimationTrack["interpolation"],
  start: AnimationKeyframe,
  end: AnimationKeyframe,
): { outHandle: HandleDelta; inHandle: HandleDelta } {
  const span = Math.max(end.time - start.time, EPSILON);
  const valueDelta = end.value - start.value;

  if (interpolation === "linear") {
    return {
      outHandle: { x: span / 3, y: valueDelta / 3 },
      inHandle: { x: -span / 3, y: -valueDelta / 3 },
    };
  }

  if (interpolation === "step") {
    return {
      outHandle: { x: span * STEP_HOLD_HANDLE_X, y: 0 },
      inHandle: {
        x: -span * (1 - STEP_HOLD_HANDLE_X),
        y: -valueDelta,
      },
    };
  }

  return {
    outHandle: { x: span * CUBIC_EASE_HANDLE_X, y: 0 },
    inHandle: { x: -span * CUBIC_EASE_HANDLE_X, y: 0 },
  };
}

function resolveSegmentHandles(
  interpolation: AnimationTrack["interpolation"],
  start: AnimationKeyframe,
  end: AnimationKeyframe,
): { outHandle: HandleDelta; inHandle: HandleDelta } {
  const span = Math.max(end.time - start.time, EPSILON);
  const preset = resolvePresetHandles(interpolation, start, end);

  if (interpolation !== "spline") {
    return {
      outHandle: {
        x: quantize(preset.outHandle.x),
        y: quantize(preset.outHandle.y),
      },
      inHandle: {
        x: quantize(preset.inHandle.x),
        y: quantize(preset.inHandle.y),
      },
    };
  }

  const outHandle =
    normalizeHandle(start.outHandle) ??
    (typeof start.outTangent === "number"
      ? { x: span / 3, y: (start.outTangent * span) / 3 }
      : null) ??
    preset.outHandle;
  const inHandle =
    normalizeHandle(end.inHandle) ??
    (typeof end.inTangent === "number"
      ? { x: -span / 3, y: (-end.inTangent * span) / 3 }
      : null) ??
    preset.inHandle;

  return {
    outHandle: {
      x: quantize(outHandle.x),
      y: quantize(outHandle.y),
    },
    inHandle: {
      x: quantize(inHandle.x),
      y: quantize(inHandle.y),
    },
  };
}

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
  selectedCurveItem: AnimationCurveSelection | null,
  selectedKeyframeId: string | null,
): number {
  const segmentCount = Math.max(track.keyframes.length - 1, 0);
  if (segmentCount === 0) {
    return 0;
  }
  if (
    selectedCurveItem?.kind === "segment" ||
    selectedCurveItem?.kind === "handle"
  ) {
    return clamp(selectedCurveItem.segmentIndex, 0, segmentCount - 1);
  }
  const keyframeId =
    selectedCurveItem?.kind === "keyframe"
      ? selectedCurveItem.keyframeId
      : selectedKeyframeId;
  const keyframeIndex = track.keyframes.findIndex(
    (keyframe) => keyframe.id === keyframeId,
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
  const interpolation = start.interpolation ?? track.interpolation;
  const { outHandle, inHandle } = resolveSegmentHandles(
    interpolation,
    start,
    end,
  );
  return {
    start,
    end,
    startIndex: segmentIndex,
    interpolation,
    outHandle,
    inHandle,
    cp1: {
      time: start.time + outHandle.x,
      value: start.value + outHandle.y,
    },
    cp2: {
      time: end.time + inHandle.x,
      value: end.value + inHandle.y,
    },
  };
}

function resolveSegmentInterpolation(
  track: AnimationTrack,
  geometry: SegmentGeometry | null,
): AnimationTrack["interpolation"] {
  return geometry?.interpolation ?? track.interpolation;
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
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const {
    tracks,
    duration,
    currentTime,
    selectedTrackId,
    selectedKeyframeId,
    selectedCurveItem,
    selectTrack,
    selectKeyframe,
    selectCurveItem,
    updateKeyframe,
    updateSegmentHandle,
    setSegmentInterpolation,
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
    ? resolveSelectedSegmentIndex(
        selectedTrack,
        selectedCurveItem,
        selectedKeyframeId,
      )
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
  const fromSvgPlotPoint = (svgX: number, svgY: number): PlotPoint => {
    return {
      time: clamp(((svgX - PLOT.left) / plotWidth) * safeDuration, 0, duration),
      value: clamp(
        range.min + (1 - (svgY - PLOT.top) / plotHeight) * valueSpan,
        range.min,
        range.max,
      ),
    };
  };
  const resolveTargetSvgPoint = (
    track: AnimationTrack,
    target: DragTarget,
  ): { svgX: number; svgY: number } | null => {
    if (target.kind === "keyframe") {
      const keyframe = track.keyframes.find(
        (candidate) => candidate.id === target.keyframeId,
      );
      return keyframe
        ? { svgX: toX(keyframe.time), svgY: toY(keyframe.value) }
        : null;
    }
    const targetGeometry = resolveSegmentGeometry(track, target.segmentIndex);
    if (!targetGeometry) {
      return null;
    }
    const point =
      target.kind === "outHandle" ? targetGeometry.cp1 : targetGeometry.cp2;
    return { svgX: toX(point.time), svgY: toY(point.value) };
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
    let nearestHandle: { distance: number; target: DragTarget } | null = null;
    for (const segment of visibleSegmentGeometries) {
      const outDistance = Math.hypot(
        svgPoint.svgX - toX(segment.cp1.time),
        svgPoint.svgY - toY(segment.cp1.value),
      );
      if (outDistance <= threshold) {
        nearestHandle =
          !nearestHandle || outDistance < nearestHandle.distance
            ? {
                distance: outDistance,
                target: {
                  kind: "outHandle",
                  segmentIndex: segment.startIndex,
                },
              }
            : nearestHandle;
      }
      const inDistance = Math.hypot(
        svgPoint.svgX - toX(segment.cp2.time),
        svgPoint.svgY - toY(segment.cp2.value),
      );
      if (inDistance <= threshold) {
        nearestHandle =
          !nearestHandle || inDistance < nearestHandle.distance
            ? {
                distance: inDistance,
                target: {
                  kind: "inHandle",
                  segmentIndex: segment.startIndex,
                },
              }
            : nearestHandle;
      }
    }
    if (nearestHandle) {
      return { target: nearestHandle.target };
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
  const selectedKeyframeForSelection = useMemo(() => {
    if (!selectedTrack) {
      return null;
    }
    const keyframeId =
      selectedCurveItem?.kind === "keyframe"
        ? selectedCurveItem.keyframeId
        : selectedKeyframeId;
    return keyframeId
      ? (selectedTrack.keyframes.find(
          (keyframe) => keyframe.id === keyframeId,
        ) ?? null)
      : null;
  }, [selectedCurveItem, selectedKeyframeId, selectedTrack]);
  const segmentGeometries = useMemo(() => {
    if (!selectedTrack || selectedTrack.keyframes.length < 2) {
      return [];
    }
    return selectedTrack.keyframes
      .slice(0, -1)
      .map((_, index) => resolveSegmentGeometry(selectedTrack, index))
      .filter((segment): segment is SegmentGeometry => Boolean(segment));
  }, [selectedTrack]);
  const visibleSegmentGeometries = useMemo(() => {
    if (!selectedTrack) {
      return [];
    }
    if (
      selectedCurveItem?.kind === "segment" ||
      selectedCurveItem?.kind === "handle"
    ) {
      return geometry ? [geometry] : [];
    }
    if (selectedKeyframeForSelection) {
      const keyframeIndex = selectedTrack.keyframes.findIndex(
        (keyframe) => keyframe.id === selectedKeyframeForSelection.id,
      );
      return [keyframeIndex - 1, keyframeIndex]
        .map((index) =>
          index >= 0 ? resolveSegmentGeometry(selectedTrack, index) : null,
        )
        .filter((segment): segment is SegmentGeometry => Boolean(segment));
    }
    return geometry ? [geometry] : [];
  }, [
    geometry,
    selectedCurveItem,
    selectedKeyframeForSelection,
    selectedTrack,
  ]);
  const formatSegmentPath = (segment: SegmentGeometry) =>
    [
      `M ${toX(segment.start.time).toFixed(2)} ${toY(segment.start.value).toFixed(2)}`,
      `C ${toX(segment.cp1.time).toFixed(2)} ${toY(segment.cp1.value).toFixed(2)}`,
      `${toX(segment.cp2.time).toFixed(2)} ${toY(segment.cp2.value).toFixed(2)}`,
      `${toX(segment.end.time).toFixed(2)} ${toY(segment.end.value).toFixed(2)}`,
    ].join(" ");
  const selectSegment = (
    event: MouseEvent<SVGPathElement> | PointerEvent<SVGPathElement>,
    segment: SegmentGeometry,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedTrack) {
      return;
    }
    selectTrack(selectedTrack.id);
    selectCurveItem({ kind: "segment", segmentIndex: segment.startIndex });
    onInspectTrack?.(selectedTrack.id);
  };

  const applyDragAt = (
    track: AnimationTrack,
    session: DragSession,
    clientX: number,
    clientY: number,
  ) => {
    const svgPoint = fromClientSvgPoint(clientX, clientY);
    if (!svgPoint) {
      return;
    }
    const point = fromSvgPlotPoint(
      svgPoint.svgX - session.svgOffsetX,
      svgPoint.svgY - session.svgOffsetY,
    );
    const { target } = session;
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
      const outHandle = {
        x: quantize(handle.time - targetGeometry.start.time),
        y: quantize(handle.value - targetGeometry.start.value),
      };
      updateSegmentHandle(track.id, target.segmentIndex, "out", outHandle);
      return;
    }
    const inHandle = {
      x: quantize(handle.time - targetGeometry.end.time),
      y: quantize(handle.value - targetGeometry.end.value),
    };
    updateSegmentHandle(track.id, target.segmentIndex, "in", inHandle);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragSession || !selectedTrack) {
      return;
    }
    applyDragAt(selectedTrack, dragSession, event.clientX, event.clientY);
  };

  const selectSegmentInterpolation = (
    interpolation: AnimationTrack["interpolation"],
  ) => {
    if (!selectedTrack || !geometry) {
      return;
    }
    const handles = quantizeHandles(
      interpolation === "spline"
        ? {
            outHandle: geometry.outHandle,
            inHandle: geometry.inHandle,
          }
        : resolvePresetHandles(interpolation, geometry.start, geometry.end),
    );
    setSegmentInterpolation(
      selectedTrack.id,
      geometry.startIndex,
      interpolation,
      handles,
    );
    selectCurveItem({ kind: "segment", segmentIndex: geometry.startIndex });
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
    const pointerSvg = fromClientSvgPoint(event.clientX, event.clientY);
    const targetSvg = resolveTargetSvgPoint(selectedTrack, target);
    if (!pointerSvg || !targetSvg) {
      return;
    }
    const session: DragSession = {
      target,
      svgOffsetX: pointerSvg.svgX - targetSvg.svgX,
      svgOffsetY: pointerSvg.svgY - targetSvg.svgY,
    };
    capturePointer(svgRef.current ?? event.currentTarget, event.pointerId);
    dragCleanupRef.current?.();
    setDragSession(session);
    selectTrack(selectedTrack.id);
    onInspectTrack?.(selectedTrack.id);
    if (keyframeId) {
      selectKeyframe(keyframeId);
    } else if (target.kind === "outHandle" || target.kind === "inHandle") {
      selectCurveItem({
        kind: "handle",
        segmentIndex: target.segmentIndex,
        side: target.kind === "outHandle" ? "out" : "in",
      });
    }
    const dragTrack = selectedTrack;
    const handleWindowPointerMove = (moveEvent: globalThis.PointerEvent) => {
      applyDragAt(dragTrack, session, moveEvent.clientX, moveEvent.clientY);
    };
    const endWindowDrag = () => {
      setDragSession(null);
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
    const pointerSvg = fromClientSvgPoint(event.clientX, event.clientY);
    const targetSvg = resolveTargetSvgPoint(selectedTrack, target);
    if (!pointerSvg || !targetSvg) {
      return;
    }
    const session: DragSession = {
      target,
      svgOffsetX: pointerSvg.svgX - targetSvg.svgX,
      svgOffsetY: pointerSvg.svgY - targetSvg.svgY,
    };
    dragCleanupRef.current?.();
    setDragSession(session);
    selectTrack(selectedTrack.id);
    onInspectTrack?.(selectedTrack.id);
    if (keyframeId) {
      selectKeyframe(keyframeId);
    } else if (target.kind === "outHandle" || target.kind === "inHandle") {
      selectCurveItem({
        kind: "handle",
        segmentIndex: target.segmentIndex,
        side: target.kind === "outHandle" ? "out" : "in",
      });
    }
    const dragTrack = selectedTrack;
    const handleWindowMouseMove = (moveEvent: globalThis.MouseEvent) => {
      applyDragAt(dragTrack, session, moveEvent.clientX, moveEvent.clientY);
    };
    const endWindowMouseDrag = () => {
      setDragSession(null);
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
    selectedKeyframeForSelection ??
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
              <option value="spline">Custom spline</option>
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
        onPointerUp={() => setDragSession(null)}
        onPointerCancel={() => setDragSession(null)}
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
        {segmentGeometries.map((segment) => (
          <path
            key={`${segment.start.id}:${segment.end.id}`}
            data-testid="animation-curve-segment-hit-area"
            d={formatSegmentPath(segment)}
            fill="none"
            stroke="transparent"
            strokeWidth="14"
            strokeLinecap="round"
            style={{ pointerEvents: "stroke" }}
            onPointerDown={(event) => selectSegment(event, segment)}
            onMouseDown={(event) => selectSegment(event, segment)}
          />
        ))}

        {visibleSegmentGeometries.map((segment) => {
          const editable = segment.interpolation === "spline";
          const selectedOutHandle =
            selectedCurveItem?.kind === "handle" &&
            selectedCurveItem.segmentIndex === segment.startIndex &&
            selectedCurveItem.side === "out";
          const selectedInHandle =
            selectedCurveItem?.kind === "handle" &&
            selectedCurveItem.segmentIndex === segment.startIndex &&
            selectedCurveItem.side === "in";
          return (
            <g key={`handles-${segment.start.id}-${segment.end.id}`}>
              <line
                x1={toX(segment.start.time)}
                y1={toY(segment.start.value)}
                x2={toX(segment.cp1.time)}
                y2={toY(segment.cp1.value)}
                className={cn(
                  "stroke-blue-300",
                  editable ? "opacity-55" : "opacity-30",
                )}
                strokeWidth="1.5"
              />
              <line
                x1={toX(segment.end.time)}
                y1={toY(segment.end.value)}
                x2={toX(segment.cp2.time)}
                y2={toY(segment.cp2.value)}
                className={cn(
                  "stroke-emerald-300",
                  editable ? "opacity-55" : "opacity-30",
                )}
                strokeWidth="1.5"
              />
              <circle
                data-testid="animation-curve-handle-out"
                cx={toX(segment.cp1.time)}
                cy={toY(segment.cp1.value)}
                r={selectedOutHandle ? 10.5 : 9}
                className={cn(
                  "fill-blue-300 stroke-bg-app stroke-2",
                  editable
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer opacity-45",
                  selectedOutHandle ? "stroke-accent" : "",
                )}
                style={{ pointerEvents: "all" }}
                onPointerDown={(event) =>
                  beginDrag(event, {
                    kind: "outHandle",
                    segmentIndex: segment.startIndex,
                  })
                }
                onMouseDown={(event) =>
                  beginMouseDrag(event, {
                    kind: "outHandle",
                    segmentIndex: segment.startIndex,
                  })
                }
              />
              <circle
                data-testid="animation-curve-handle-in"
                cx={toX(segment.cp2.time)}
                cy={toY(segment.cp2.value)}
                r={selectedInHandle ? 10.5 : 9}
                className={cn(
                  "fill-emerald-300 stroke-bg-app stroke-2",
                  editable
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer opacity-45",
                  selectedInHandle ? "stroke-accent" : "",
                )}
                style={{ pointerEvents: "all" }}
                onPointerDown={(event) =>
                  beginDrag(event, {
                    kind: "inHandle",
                    segmentIndex: segment.startIndex,
                  })
                }
                onMouseDown={(event) =>
                  beginMouseDrag(event, {
                    kind: "inHandle",
                    segmentIndex: segment.startIndex,
                  })
                }
              />
            </g>
          );
        })}

        {selectedTrack.keyframes.map((keyframe) => {
          const selected =
            selectedCurveItem?.kind === "keyframe" &&
            keyframe.id === selectedKeyframe?.id;
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

import React, { useMemo, useRef, useState } from "react";
import {
  WORKBENCH_ASSET_OPTIONS,
  STUDIO_STANDARD_TRANSITIONS,
  STUDIO_TRANSITION_DIRECTIVES,
  WORKBENCH_SCALAR_TRACK_ID,
  WORKBENCH_SEGMENT_MODES,
  applySegmentTransitionMode,
  getAnimationExtentMs,
  getStudioV2CompatibilityReport,
  getTransitionCoverage,
  makeStudioCanonicalTransitionAsset,
  makeTransitionWorkbenchAsset,
  resolveSegmentHandleGeometry,
  sampleScalarTrackAt,
  updateSegmentHandle,
  type StudioV2WorkbenchAnimation,
  type WorkbenchAssetKind,
  type WorkbenchSegmentMode,
  type WorkbenchTrack,
  type WorldPoint,
} from "../dev/transitionWorkbench";

type ApplyResult = { ok: boolean; message?: string };

type TransitionWorkbenchProps = {
  animation: StudioV2WorkbenchAnimation | null;
  onApply: (next: StudioV2WorkbenchAnimation) => ApplyResult;
};

type DragTarget = "startOut" | "endIn";

const SVG_WIDTH = 760;
const SVG_HEIGHT = 320;
const PLOT = {
  left: 48,
  top: 24,
  right: 22,
  bottom: 42,
};

const MODE_OPTIONS: WorkbenchSegmentMode[] = [
  ...STUDIO_STANDARD_TRANSITIONS,
  "custom-explicit",
  ...STUDIO_TRANSITION_DIRECTIVES,
];

const modeLabel = (mode: WorkbenchSegmentMode) => {
  if (mode === "custom-explicit") return "custom handles";
  if (mode === "explicit-handles") return "make handles explicit";
  if (mode === "inferred-auto-clamped") return "auto clamped";
  return mode;
};

const formatTransition = (value: unknown) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "cubic";
  const maybe = value as { x?: unknown; y?: unknown };
  const x = Number(maybe.x);
  const y = Number(maybe.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "custom";
  return `{ x: ${x.toFixed(1)}, y: ${y.toFixed(3)} }`;
};

const sourceKindLabel = (sourceKind: string) => {
  if (sourceKind === "studio-canonical") return "Studio canonical";
  if (sourceKind === "generated-fixture") return "Generated fixture";
  if (sourceKind === "legacy-migrated") return "Legacy migrated";
  if (sourceKind === "live-edited") return "Live edited";
  return "Imported";
};

const getNumericRange = (track: WorkbenchTrack) => {
  const values = track.points
    .map((point) => Number(point.value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = Math.max((max - min) * 0.18, 0.12);
  return { min: min - pad, max: max + pad };
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const capturePointerSafely = (target: Element, pointerId: number) => {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Browser automation can dispatch pointer events without an active pointer.
  }
};

function inferSegmentMode(
  track: WorkbenchTrack | null,
  segmentIndex: number,
): WorkbenchSegmentMode {
  const start = track?.points[segmentIndex];
  const end = track?.points[segmentIndex + 1];
  const out = start?.transitions?.out;
  const incoming = end?.transitions?.in;
  if (typeof out === "string" && out === incoming) {
    return out as WorkbenchSegmentMode;
  }
  if (typeof out === "object" || typeof incoming === "object") {
    return "custom-explicit";
  }
  if (typeof out === "string") return out as WorkbenchSegmentMode;
  if (typeof incoming === "string") return incoming as WorkbenchSegmentMode;
  return "cubic";
}

export default function TransitionWorkbench({
  animation,
  onApply,
}: TransitionWorkbenchProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const workbenchAnimation = animation ?? makeStudioCanonicalTransitionAsset();
  const extentMs = getAnimationExtentMs(workbenchAnimation);
  const track =
    workbenchAnimation.tracks.find(
      (candidate) => candidate.id === WORKBENCH_SCALAR_TRACK_ID,
    ) ?? null;
  const safeSegmentIndex = Math.min(
    Math.max(segmentIndex, 0),
    Math.max((track?.points.length ?? 1) - 2, 0),
  );
  const geometry = track
    ? resolveSegmentHandleGeometry(track, safeSegmentIndex)
    : null;
  const range = useMemo(
    () => (track ? getNumericRange(track) : { min: 0, max: 1 }),
    [track],
  );
  const coverage = useMemo(
    () => getTransitionCoverage(workbenchAnimation),
    [workbenchAnimation],
  );
  const compatibility = useMemo(
    () => getStudioV2CompatibilityReport(workbenchAnimation),
    [workbenchAnimation],
  );
  const selectedAssetKind: WorkbenchAssetKind =
    compatibility.sourceKind === "generated-fixture"
      ? "generated-fixture"
      : compatibility.sourceKind === "legacy-migrated"
        ? "legacy-migrated"
        : "studio-canonical";

  const plotWidth = SVG_WIDTH - PLOT.left - PLOT.right;
  const plotHeight = SVG_HEIGHT - PLOT.top - PLOT.bottom;
  const valueSpan = Math.max(range.max - range.min, 0.0001);

  const toX = (stamp: number) => PLOT.left + (stamp / extentMs) * plotWidth;
  const toY = (value: number) =>
    PLOT.top + (1 - (value - range.min) / valueSpan) * plotHeight;
  const fromSvgPoint = (x: number, y: number): WorldPoint => ({
    stamp: clamp(((x - PLOT.left) / plotWidth) * extentMs, 0, extentMs),
    value: range.min + (1 - (y - PLOT.top) / plotHeight) * valueSpan,
  });

  const curvePath = useMemo(() => {
    if (!track) return "";
    const samples = 180;
    const parts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const stamp = (extentMs * i) / samples;
      const value = sampleScalarTrackAt(track, stamp);
      if (!Number.isFinite(value)) continue;
      parts.push(
        `${parts.length === 0 ? "M" : "L"} ${toX(stamp).toFixed(2)} ${toY(value).toFixed(2)}`,
      );
    }
    return parts.join(" ");
  }, [extentMs, range.max, range.min, track]);

  const selectedPath = useMemo(() => {
    if (!track || !geometry) return "";
    const samples = 36;
    const parts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const stamp =
        geometry.start.stamp +
        ((geometry.end.stamp - geometry.start.stamp) * i) / samples;
      const value = sampleScalarTrackAt(track, stamp);
      if (!Number.isFinite(value)) continue;
      parts.push(
        `${parts.length === 0 ? "M" : "L"} ${toX(stamp).toFixed(2)} ${toY(value).toFixed(2)}`,
      );
    }
    return parts.join(" ");
  }, [geometry, range.max, range.min, track]);

  const applyNext = (next: StudioV2WorkbenchAnimation) => {
    const result = onApply(next);
    setStatus(result.message ?? (result.ok ? "Applied" : "Apply failed"));
  };

  const handleModeChange = (mode: WorkbenchSegmentMode) => {
    applyNext(
      applySegmentTransitionMode(
        workbenchAnimation,
        WORKBENCH_SCALAR_TRACK_ID,
        safeSegmentIndex,
        mode,
      ),
    );
  };

  const handleAssetChange = (kind: WorkbenchAssetKind) => {
    setSegmentIndex(0);
    applyNext(makeTransitionWorkbenchAsset(kind));
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const svgY = ((event.clientY - rect.top) / rect.height) * SVG_HEIGHT;
    let handle = fromSvgPoint(svgX, svgY);
    if (geometry) {
      if (dragTarget === "startOut") {
        handle = {
          ...handle,
          stamp: clamp(handle.stamp, geometry.start.stamp, geometry.end.stamp),
        };
      } else {
        handle = {
          ...handle,
          stamp: clamp(handle.stamp, geometry.start.stamp, geometry.end.stamp),
        };
      }
    }
    applyNext(
      updateSegmentHandle(
        workbenchAnimation,
        WORKBENCH_SCALAR_TRACK_ID,
        safeSegmentIndex,
        dragTarget,
        handle,
      ),
    );
  };

  if (!track) {
    return (
      <section className="transition-workbench panel">
        <div className="transition-workbench__header">
          <div>
            <b>Studio v2 Transition Workbench</b>
            <span>Missing scalar transition track</span>
          </div>
          <button
            type="button"
            onClick={() => applyNext(makeStudioCanonicalTransitionAsset())}
          >
            Load Workbench
          </button>
        </div>
      </section>
    );
  }

  const selectedMode = inferSegmentMode(track, safeSegmentIndex);
  const startPoint = track.points[safeSegmentIndex];
  const endPoint = track.points[safeSegmentIndex + 1];
  const midStamp =
    startPoint && endPoint
      ? startPoint.stamp + (endPoint.stamp - startPoint.stamp) / 2
      : 0;
  const midValue = sampleScalarTrackAt(track, midStamp);

  return (
    <section className="transition-workbench panel">
      <div className="transition-workbench__header">
        <div>
          <b>Studio v2 Transition Workbench</b>
          <span>
            {sourceKindLabel(compatibility.sourceKind)} - {extentMs} ms,{" "}
            {workbenchAnimation.tracks.length} tracks, {track.points.length - 1}{" "}
            scalar segments
          </span>
        </div>
        <div className="transition-workbench__header-actions">
          <label className="transition-workbench__asset-select">
            <span>Asset</span>
            <select
              value={selectedAssetKind}
              onChange={(event) =>
                handleAssetChange(event.target.value as WorkbenchAssetKind)
              }
            >
              {WORKBENCH_ASSET_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => handleAssetChange(selectedAssetKind)}
          >
            Reset Asset
          </button>
        </div>
      </div>

      <div className="transition-workbench__controls">
        <label>
          <span>Segment</span>
          <select
            value={safeSegmentIndex}
            onChange={(event) => setSegmentIndex(Number(event.target.value))}
          >
            {WORKBENCH_SEGMENT_MODES.map((mode, index) => (
              <option key={`${mode}-${index}`} value={index}>
                {index + 1}: {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Transition</span>
          <select
            value={selectedMode}
            onChange={(event) =>
              handleModeChange(event.target.value as WorkbenchSegmentMode)
            }
          >
            {MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>
        <div className="transition-workbench__readout">
          <span>{startPoint?.stamp.toFixed(0)} ms</span>
          <span>{Number(startPoint?.value ?? 0).toFixed(3)}</span>
          <span>{endPoint?.stamp.toFixed(0)} ms</span>
          <span>{Number(endPoint?.value ?? 0).toFixed(3)}</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="transition-workbench__svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label="Studio transition curve editor"
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragTarget(null)}
        onPointerCancel={() => setDragTarget(null)}
      >
        <rect
          x={PLOT.left}
          y={PLOT.top}
          width={plotWidth}
          height={plotHeight}
          rx="6"
          className="transition-workbench__plot-bg"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={`grid-${ratio}`}>
            <line
              x1={PLOT.left + plotWidth * ratio}
              y1={PLOT.top}
              x2={PLOT.left + plotWidth * ratio}
              y2={PLOT.top + plotHeight}
              className="transition-workbench__grid"
            />
            <line
              x1={PLOT.left}
              y1={PLOT.top + plotHeight * ratio}
              x2={PLOT.left + plotWidth}
              y2={PLOT.top + plotHeight * ratio}
              className="transition-workbench__grid"
            />
          </g>
        ))}
        <text
          x={PLOT.left}
          y={SVG_HEIGHT - 14}
          className="transition-workbench__axis"
        >
          0 ms
        </text>
        <text
          x={PLOT.left + plotWidth}
          y={SVG_HEIGHT - 14}
          textAnchor="end"
          className="transition-workbench__axis"
        >
          {extentMs} ms
        </text>
        <text
          x={10}
          y={toY(range.max) + 4}
          className="transition-workbench__axis"
        >
          {range.max.toFixed(2)}
        </text>
        <text
          x={10}
          y={toY(range.min) + 4}
          className="transition-workbench__axis"
        >
          {range.min.toFixed(2)}
        </text>

        <path d={curvePath} className="transition-workbench__curve" />
        {selectedPath && (
          <path
            d={selectedPath}
            className="transition-workbench__curve-selected"
          />
        )}

        {track.points.map((point, index) => {
          if (typeof point.value !== "number") return null;
          const selected =
            index === safeSegmentIndex || index === safeSegmentIndex + 1;
          return (
            <circle
              key={point.id}
              cx={toX(point.stamp)}
              cy={toY(point.value)}
              r={selected ? 6 : 4}
              className="transition-workbench__point"
              data-selected={selected ? "true" : "false"}
              onClick={() =>
                setSegmentIndex(
                  Math.min(index, Math.max(track.points.length - 2, 0)),
                )
              }
            />
          );
        })}

        {geometry && (
          <g>
            <line
              x1={toX(geometry.start.stamp)}
              y1={toY(geometry.start.value)}
              x2={toX(geometry.cp1.stamp)}
              y2={toY(geometry.cp1.value)}
              className="transition-workbench__handle-line"
            />
            <line
              x1={toX(geometry.end.stamp)}
              y1={toY(geometry.end.value)}
              x2={toX(geometry.cp2.stamp)}
              y2={toY(geometry.cp2.value)}
              className="transition-workbench__handle-line"
            />
            <circle
              cx={toX(geometry.cp1.stamp)}
              cy={toY(geometry.cp1.value)}
              r="8"
              className="transition-workbench__handle transition-workbench__handle--out"
              onPointerDown={(event) => {
                capturePointerSafely(event.currentTarget, event.pointerId);
                setDragTarget("startOut");
              }}
            />
            <circle
              cx={toX(geometry.cp2.stamp)}
              cy={toY(geometry.cp2.value)}
              r="8"
              className="transition-workbench__handle transition-workbench__handle--in"
              onPointerDown={(event) => {
                capturePointerSafely(event.currentTarget, event.pointerId);
                setDragTarget("endIn");
              }}
            />
          </g>
        )}
      </svg>

      <div className="transition-workbench__proof-grid">
        <div>
          <span>Source</span>
          <code>{sourceKindLabel(compatibility.sourceKind)}</code>
        </div>
        <div>
          <span>Schema</span>
          <code>
            {compatibility.isCompatible
              ? "Studio v2 compatible"
              : (compatibility.issues[0] ?? "needs migration")}
          </code>
        </div>
        <div>
          <span>Out</span>
          <code>{formatTransition(startPoint?.transitions?.out)}</code>
        </div>
        <div>
          <span>In</span>
          <code>{formatTransition(endPoint?.transitions?.in)}</code>
        </div>
        <div>
          <span>Mid sample</span>
          <code>
            {midStamp.toFixed(0)} ms ={" "}
            {Number.isFinite(midValue) ? midValue.toFixed(4) : "n/a"}
          </code>
        </div>
        <div>
          <span>Coverage</span>
          <code>
            {coverage.standardNames.length} easing, {coverage.directives.length}{" "}
            directives, explicit {coverage.hasExplicitHandles ? "yes" : "no"},
            hold {coverage.hasStepValueTracks ? "yes" : "no"}
          </code>
        </div>
      </div>

      {status && <div className="transition-workbench__status">{status}</div>}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnimationTimeDisplayMode,
  type AnimationTrack,
  useAnimationStore,
} from "../../state/animationStore";
import {
  formatKeyframeTime,
  snapTimeToFrame,
} from "../../utils/animationTimeDisplay";
import { cn } from "../../utils/cn";

interface TrackRowProps {
  track: AnimationTrack;
  duration: number;
  timeDisplayMode: AnimationTimeDisplayMode;
  onInspect?: (trackId: string) => void;
}

/** Pointer travel required before a keyframe drag retimes anything. */
const DRAG_THRESHOLD_PX = 3;

export function TrackRow({
  track,
  duration,
  timeDisplayMode,
  onInspect,
}: TrackRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingKeyframeIdRef = useRef<string | null>(null);
  const dragStartClientXRef = useRef<number | null>(null);
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(
    null,
  );
  const { selectKeyframe, selectedKeyframeId, selectTrack, selectedTrackId } =
    useAnimationStore();
  const updateKeyframe = useAnimationStore((state) => state.updateKeyframe);

  const resolveTimeFromClientX = useCallback(
    (clientX: number): number | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      const headerWidth = 192;
      const trackWidth = rect.width - headerWidth;
      if (trackWidth <= 0) {
        return 0;
      }
      const relativeX = clientX - rect.left - headerWidth;
      const normalized = Math.max(0, Math.min(1, relativeX / trackWidth));
      const time = normalized * duration;
      return Math.min(snapTimeToFrame(time, timeDisplayMode), duration);
    },
    [duration, timeDisplayMode],
  );

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const keyframeId = draggingKeyframeIdRef.current;
      if (!keyframeId) {
        return;
      }
      // A plain click must not retime the keyframe. Without a threshold, one
      // pixel of pointer travel between press and release committed a time
      // change — and with no undo, that is unrecoverable.
      const startClientX = dragStartClientXRef.current;
      if (startClientX !== null) {
        // A non-finite delta must not open the gate: NaN comparisons are false,
        // which would let a zero-travel click through.
        const travel = Math.abs(event.clientX - startClientX);
        if (!Number.isFinite(travel) || travel < DRAG_THRESHOLD_PX) {
          return;
        }
        dragStartClientXRef.current = null;
      }
      const nextTime = resolveTimeFromClientX(event.clientX);
      if (nextTime === null) {
        return;
      }
      updateKeyframe(track.id, keyframeId, { time: nextTime });
    },
    [resolveTimeFromClientX, track.id, updateKeyframe],
  );

  const endKeyframeDrag = useCallback(() => {
    draggingKeyframeIdRef.current = null;
    dragStartClientXRef.current = null;
    setDraggingKeyframeId(null);
    window.removeEventListener("pointermove", handleWindowPointerMove);
  }, [handleWindowPointerMove]);

  const handleKeyframePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    kfId: string,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    selectKeyframe(kfId);
    selectTrack(track.id);
    onInspect?.(track.id);
    endKeyframeDrag();
    draggingKeyframeIdRef.current = kfId;
    dragStartClientXRef.current = Number.isFinite(e.clientX) ? e.clientX : 0;
    setDraggingKeyframeId(kfId);
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", endKeyframeDrag, { once: true });
  };

  useEffect(
    () => () => {
      endKeyframeDrag();
      window.removeEventListener("pointerup", endKeyframeDrag);
    },
    [endKeyframeDrag],
  );

  const handleTrackClick = () => {
    // Deliberately does NOT stop propagation. It used to, which meant clicking
    // a track selected it without moving the playhead while clicking the empty
    // strip a few pixels below did move it — the same gesture doing two
    // different things depending on pixel. Keyframes still stop propagation,
    // so selecting a key does not seek.
    selectTrack(track.id);
    onInspect?.(track.id);
  };

  const handleKeyframeClick = (e: React.MouseEvent, kfId: string) => {
    e.stopPropagation();
    selectKeyframe(kfId);
    selectTrack(track.id);
    onInspect?.(track.id);
  };

  const isSelected = selectedTrackId === track.id;
  // A detached track's input is not on this face, so it plays nothing, bakes
  // to nothing and is left out of the export — while looking exactly like a
  // working track. Its keyframes are kept deliberately, so it must read as
  // retained-but-inert rather than either normal or missing.
  const isDetached = track.detached === true;
  const detachedReason =
    `${track.label} is detached: this face has no input at ${track.channel}, ` +
    "so the track does not play and is left out of the bake. Its keyframes " +
    "are kept and will reattach if the input comes back.";

  return (
    <div
      className={cn(
        "relative h-11 bg-bg-panel/40 rounded-lg border overflow-hidden hover:bg-bg-secondary/40 transition-all group select-none cursor-pointer active:scale-[0.998] active:brightness-95",
        isSelected
          ? "border-accent/50 bg-bg-secondary/30"
          : "border-border-default/50",
        isDetached && "border-dashed border-amber-500/50 opacity-60",
      )}
      onClick={handleTrackClick}
      ref={containerRef}
      {...(isDetached
        ? { title: detachedReason, "data-detached": "true" }
        : {})}
    >
      {/* Label / Header */}
      <div className="absolute inset-y-0 left-0 w-48 bg-bg-panel/85 border-r border-border-default/80 z-10 flex items-center px-3">
        <div
          className="w-1.5 h-1.5 rounded-full mr-2 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          style={{ backgroundColor: track.color }}
        />
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-text-secondary font-mono tracking-tight group-hover:text-text-primary transition-colors truncate">
            {track.label}
          </div>
          <div className="text-[9px] text-text-muted truncate">
            {isDetached ? (
              <span
                className="text-amber-400/90"
                data-testid={`track-detached-${track.id}`}
              >
                Detached · {track.keyframes.length} keys kept
              </span>
            ) : (
              <>
                {track.interpolation} · {track.keyframes.length} keys
              </>
            )}
          </div>
        </div>
      </div>

      {/* Keyframes Area */}
      <div className="absolute inset-y-0 left-48 right-0 overflow-hidden">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border-default/50" />
        {track.keyframes.map((kf) => {
          const leftPct = duration > 0 ? (kf.time / duration) * 100 : 0;
          const isKfSelected = selectedKeyframeId === kf.id;
          const isDragging = draggingKeyframeId === kf.id;

          return (
            <div
              key={kf.id}
              className={cn(
                "absolute top-1/2 w-2.5 h-2.5 -ml-1.5 -mt-1.5 rotate-45 border border-border-default shadow-sm z-20 hover:scale-125 transition-transform",
                isKfSelected
                  ? "bg-text-primary border-accent z-30"
                  : "bg-text-muted",
                isDragging ? "cursor-grabbing" : "cursor-ew-resize",
              )}
              style={{
                left: `${leftPct}%`,
                backgroundColor: isKfSelected ? "var(--bg-app)" : track.color,
              }}
              onClick={(e) => handleKeyframeClick(e, kf.id)}
              onPointerDown={(event) => handleKeyframePointerDown(event, kf.id)}
              title={`Time: ${formatKeyframeTime(kf.time, timeDisplayMode)}\nValue: ${kf.value.toFixed(2)}\nDrag to move in time`}
            />
          );
        })}
      </div>
    </div>
  );
}

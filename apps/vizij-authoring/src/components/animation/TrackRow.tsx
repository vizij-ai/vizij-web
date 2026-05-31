import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnimationTimeDisplayMode,
  type AnimationTrack,
  useAnimationStore,
} from "../../state/animationStore";
import { formatKeyframeTime } from "../../utils/animationTimeDisplay";
import { cn } from "../../utils/cn";

interface TrackRowProps {
  track: AnimationTrack;
  duration: number;
  timeDisplayMode: AnimationTimeDisplayMode;
  onInspect?: (trackId: string) => void;
}

export function TrackRow({
  track,
  duration,
  timeDisplayMode,
  onInspect,
}: TrackRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingKeyframeIdRef = useRef<string | null>(null);
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
      return normalized * duration;
    },
    [duration],
  );

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const keyframeId = draggingKeyframeIdRef.current;
      if (!keyframeId) {
        return;
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

  const handleTrackClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  return (
    <div
      className={cn(
        "relative h-11 bg-bg-panel/40 rounded-lg border overflow-hidden hover:bg-bg-secondary/40 transition-all group select-none cursor-pointer active:scale-[0.998] active:brightness-95",
        isSelected
          ? "border-accent/50 bg-bg-secondary/30"
          : "border-border-default/50",
      )}
      onClick={handleTrackClick}
      ref={containerRef}
      data-testid="animation-track-row"
      data-track-id={track.id}
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
            {track.interpolation} · {track.keyframes.length} keys
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
              data-testid="animation-timeline-keyframe"
              data-keyframe-id={kf.id}
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

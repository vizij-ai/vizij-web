import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";
import {
  evaluateTrack,
  useAnimationStore,
  type AnimationTimeDisplayMode,
} from "../../state/animationStore";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import {
  ANIMATION_TIMELINE_FPS,
  formatKeyframeTime,
  parseTimeInput,
  snapTimeToFrame,
} from "../../utils/animationTimeDisplay";
import { Button } from "../ui/Button";
import {
  resolveTimelineShortcut,
  shouldIgnoreTimelineShortcut,
} from "./timelineShortcuts";
import { TrackRow } from "./TrackRow";

interface TimelineEditorProps {
  onSeek?: (timeSeconds: number) => void;
  onPause?: () => void;
  /**
   * Resume after a scrub that auto-paused playback. Without it a scrub
   * silently converts "playing" into "paused", so the user has to press play
   * again every time they drag the playhead.
   */
  onResume?: () => void;
  timeDisplayMode?: AnimationTimeDisplayMode;
  onInspectTrack?: (trackId: string) => void;
  /**
   * Actions that operate on the playhead, rendered in the toolbar beside the
   * time field. A slot rather than an import: the pose action needs the
   * pose-rig store, and the timeline has nothing to do with poses — wiring it
   * in directly would make every timeline test stand up a pose rig.
   */
  playheadActions?: ReactNode;
  /** Space. Omitted when no transport is bound, which disables the shortcut. */
  onTogglePlay?: () => void;
  /** Left/right arrow, in frames. */
  onStep?: (direction: -1 | 1) => void;
}

const TRACK_HEADER_WIDTH = 192;

export function TimelineEditor({
  onSeek,
  onPause,
  onResume,
  timeDisplayMode = "seconds",
  onInspectTrack,
  playheadActions,
  onTogglePlay,
  onStep,
}: TimelineEditorProps) {
  const {
    tracks,
    duration,
    currentTime,
    transportPlaybackState,
    seek,
    addKeyframe,
    selectedTrackId,
    selectTrack,
    selectKeyframe,
  } = useAnimationStore();

  // Held as text while focused so a partial entry ("1." , "-") is not fought
  // by a reformat on every keystroke; committed on Enter or blur.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const isScrubbingRulerRef = useRef(false);
  const scrubStartClientXRef = useRef<number | null>(null);
  const pausedForScrubRef = useRef(false);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const seekTo = onSeek ?? seek;

  const resolveTimeFromClientX = useCallback(
    (clientX: number): number | null => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) {
        return null;
      }
      const x = clientX - rect.left;
      if (x < TRACK_HEADER_WIDTH) {
        return null;
      }
      const trackWidth = rect.width - TRACK_HEADER_WIDTH;
      if (trackWidth <= 0) {
        return 0;
      }
      const clickX = x - TRACK_HEADER_WIDTH;
      const time = Math.max(0, Math.min(1, clickX / trackWidth)) * duration;
      // One snap point for everything a pointer produces here: the playhead,
      // and the keyframe a double-click inserts.
      return Math.min(snapTimeToFrame(time, timeDisplayMode), duration);
    },
    [duration, timeDisplayMode],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const time = resolveTimeFromClientX(clientX);
      if (time === null) {
        return;
      }
      seekTo(time);
    },
    [resolveTimeFromClientX, seekTo],
  );

  const handleTimelineClick = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    seekFromClientX(e.clientX);
  };

  const insertKeyframeAt = useCallback(
    (time: number) => {
      if (!selectedTrackId) {
        return;
      }
      const selectedTrack = tracks.find(
        (track) => track.id === selectedTrackId,
      );
      if (!selectedTrack) {
        return;
      }
      // Insert is value-preserving: the new key takes the curve's value at that
      // time, so adding a key never changes the motion. Writing the input's
      // default instead put a step into every curve that was not already
      // resting there — inserting into a translation curve snapped the face.
      // Only an empty track has no curve to read, and then the default is right.
      const value =
        selectedTrack.keyframes.length > 0
          ? evaluateTrack(selectedTrack, time)
          : (standardInputsById.get(selectedTrack.variableId)?.defaultValue ??
            0);
      addKeyframe(selectedTrackId, time, value);
    },
    [addKeyframe, selectedTrackId, standardInputsById, tracks],
  );

  // Double click to add keyframe
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!selectedTrackId) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const t = resolveTimeFromClientX(e.clientX);
    if (t === null) {
      return;
    }
    insertKeyframeAt(t);
  };

  const handleRulerPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isScrubbingRulerRef.current) {
        return;
      }
      if (
        transportPlaybackState !== "paused" &&
        !pausedForScrubRef.current &&
        scrubStartClientXRef.current !== null &&
        Math.abs(event.clientX - scrubStartClientXRef.current) >= 2
      ) {
        onPause?.();
        pausedForScrubRef.current = true;
      }
      seekFromClientX(event.clientX);
    },
    [onPause, seekFromClientX, transportPlaybackState],
  );

  const stopRulerScrub = useCallback(() => {
    if (!isScrubbingRulerRef.current) {
      return;
    }
    isScrubbingRulerRef.current = false;
    scrubStartClientXRef.current = null;
    // Resume only if *we* paused it for the scrub. A scrub that began while
    // already paused must stay paused.
    const shouldResume = pausedForScrubRef.current;
    pausedForScrubRef.current = false;
    if (shouldResume) {
      onResume?.();
    }
    window.removeEventListener("pointermove", handleRulerPointerMove);
    window.removeEventListener("pointerup", stopRulerScrub);
    window.removeEventListener("pointercancel", stopRulerScrub);
  }, [handleRulerPointerMove, onResume]);

  const handleRulerPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    isScrubbingRulerRef.current = true;
    scrubStartClientXRef.current = event.clientX;
    pausedForScrubRef.current = false;
    seekFromClientX(event.clientX);
    window.addEventListener("pointermove", handleRulerPointerMove);
    window.addEventListener("pointerup", stopRulerScrub);
    window.addEventListener("pointercancel", stopRulerScrub);
  };

  useEffect(
    () => () => {
      isScrubbingRulerRef.current = false;
      scrubStartClientXRef.current = null;
      pausedForScrubRef.current = false;
      window.removeEventListener("pointermove", handleRulerPointerMove);
      window.removeEventListener("pointerup", stopRulerScrub);
      window.removeEventListener("pointercancel", stopRulerScrub);
    },
    [handleRulerPointerMove, stopRulerScrub],
  );

  const commitTimeDraft = useCallback(() => {
    if (timeDraft === null) {
      return;
    }
    const parsed = parseTimeInput(timeDraft, timeDisplayMode);
    setTimeDraft(null);
    if (parsed === null) {
      // Unreadable input leaves the playhead where it was. Snapping to zero on
      // a typo loses the author's place for no reason.
      return;
    }
    seekTo(Math.min(snapTimeToFrame(parsed, timeDisplayMode), duration));
  }, [duration, seekTo, timeDisplayMode, timeDraft]);

  const removeKeyframe = useAnimationStore((state) => state.removeKeyframe);
  const selectedKeyframeId = useAnimationStore(
    (state) => state.selectedKeyframeId,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreTimelineShortcut(event)) {
        return;
      }
      const shortcut = resolveTimelineShortcut(event.key);
      if (!shortcut) {
        return;
      }

      switch (shortcut.kind) {
        case "toggle-play": {
          if (!onTogglePlay) {
            return;
          }
          onTogglePlay();
          break;
        }
        case "step": {
          if (!onStep) {
            return;
          }
          onStep(shortcut.direction);
          break;
        }
        case "delete-keyframe": {
          if (!selectedTrackId || !selectedKeyframeId) {
            return;
          }
          removeKeyframe(selectedTrackId, selectedKeyframeId);
          break;
        }
        case "go-to-start": {
          seekTo(0);
          break;
        }
        case "go-to-end": {
          seekTo(duration);
          break;
        }
      }
      // Only once the shortcut is handled: Space would otherwise scroll the
      // page and Backspace could navigate back, and claiming those before
      // knowing we act on them would break the rest of the app.
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    duration,
    onStep,
    onTogglePlay,
    removeKeyframe,
    seekTo,
    selectedKeyframeId,
    selectedTrackId,
  ]);

  const rulerTicks = useMemo(() => {
    const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    if (timeDisplayMode === "frames") {
      const totalFrames = Math.max(
        0,
        Math.floor(safeDuration * ANIMATION_TIMELINE_FPS),
      );
      const stepFrames = 16;
      const frames: number[] = [0];
      for (let frame = stepFrames; frame <= totalFrames; frame += stepFrames) {
        frames.push(frame);
      }
      if (frames[frames.length - 1] !== totalFrames) {
        frames.push(totalFrames);
      }
      return frames.map((frame) => {
        const time = frame / ANIMATION_TIMELINE_FPS;
        const leftPct = safeDuration > 0 ? (time / safeDuration) * 100 : 0;
        return {
          key: `frame-${frame}`,
          leftPct,
          label: `${frame}f`,
        };
      });
    }

    const maxWholeSecond = Math.floor(safeDuration);
    const ticks: number[] = [0];
    for (let second = 1; second <= maxWholeSecond; second += 1) {
      ticks.push(second);
    }
    return ticks.map((second) => {
      const leftPct = safeDuration > 0 ? (second / safeDuration) * 100 : 0;
      return {
        key: `second-${second}`,
        leftPct,
        label: `${second}s`,
      };
    });
  }, [duration, timeDisplayMode]);

  const playheadLeftPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex-1 bg-bg-secondary/40 rounded-xl border border-border-default/60 relative overflow-hidden shadow-inner flex flex-col"
      ref={timelineRef}
      onClick={handleTimelineClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Toolbar. The actions that act on the playhead live next to the
          playhead readout, rather than in the transport row with play/pause:
          adding a key and saving a pose both write something durable, and
          "frame" only reads clearly beside a frame count. It also gives
          add-keyframe a label — double-click was the only way to do it, and
          nothing said so. */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border-default/60 bg-bg-panel/60 shrink-0">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Time
          </span>
          <input
            className="w-20 rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-600"
            value={
              timeDraft ?? formatKeyframeTime(currentTime, timeDisplayMode)
            }
            onChange={(event) => setTimeDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={commitTimeDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTimeDraft();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setTimeDraft(null);
              }
            }}
            aria-label="Current time"
            data-testid="timeline-current-time"
          />
        </label>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] px-2"
          onClick={() => insertKeyframeAt(currentTime)}
          disabled={!selectedTrackId}
          title={
            selectedTrackId
              ? "Add a keyframe on the selected track at the playhead"
              : "Select a track to add a keyframe"
          }
          data-testid="timeline-add-key"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Key
        </Button>

        {playheadActions}
      </div>

      {/* Time Ruler */}
      <div
        className="h-7 border-b border-border-default/80 bg-bg-panel/80 flex items-end backdrop-blur-sm z-10 shrink-0 select-none cursor-ew-resize hover:bg-bg-panel transition-colors"
        onPointerDown={handleRulerPointerDown}
      >
        {/* Header spacer */}
        <div className="w-48 shrink-0 border-r border-border-default/30 h-full flex items-center px-3">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
            Tracks
          </span>
        </div>

        {/* Ticks */}
        <div className="flex-1 relative h-full overflow-hidden">
          {rulerTicks.map((tick) => (
            <div
              key={tick.key}
              className="absolute bottom-0 h-2 border-l border-border-default/50"
              style={{ left: `${tick.leftPct}%` }}
            >
              <span className="absolute -top-4 -left-1 text-[9px] font-mono font-medium text-text-muted">
                {tick.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tracks Container */}
      <div
        className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar relative"
        onClick={(event) => {
          // Only a click on the empty area deselects. This used to fire for
          // any descendant click and relied on children calling
          // stopPropagation to prevent it — so when TrackRow stopped doing
          // that (to let row clicks seek), selecting a track immediately
          // deselected it on the way up, and double-click-to-add-keyframe
          // broke because it bails on an empty selection.
          if (event.target !== event.currentTarget) {
            return;
          }
          selectTrack(null);
          selectKeyframe(null);
        }}
      >
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2">
            <span className="text-xs">No tracks added</span>
            <span className="text-[10px] italic">
              Add a variable to start animating
            </span>
          </div>
        ) : (
          tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              duration={duration}
              timeDisplayMode={timeDisplayMode}
              onInspect={onInspectTrack}
            />
          ))
        )}

        {/* Playhead Line (rendered within scroll area to span full height, but needs to be absolutely positioned over everything) */}
      </div>

      {/* Playhead Overlay - Absolute over the whole track area (excluding header) */}
      <div className="absolute top-7 bottom-0 left-48 right-0 pointer-events-none z-20 overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500/80"
          style={{ left: `${playheadLeftPct}%` }}
          ref={playheadRef}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-2 bg-red-500 rounded-b-sm shadow-[0_2px_4px_rgba(239,68,68,0.4)]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-red-500 to-transparent opacity-50" />
        </div>
      </div>
    </div>
  );
}

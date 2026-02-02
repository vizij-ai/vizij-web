import { useRef } from "react";
import { useAnimationStore } from "../../state/animationStore";
import { TrackRow } from "./TrackRow";

export function TimelineEditor() {
  const {
    tracks,
    duration,
    currentTime,
    seek,
    addKeyframe,
    selectedTrackId,
    selectTrack,
    selectKeyframe,
  } = useAnimationStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const handleTimelineClick = (e: React.MouseEvent) => {
    // Only seek if clicking on the ruler area or empty space, not on interactive elements which stop propagation
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate time based on click position relative to track area (ignoring the 48px header width if needed, or keeping it uniform)
    // Actually our TrackRow reserves 192px (w-48 = 12rem = 192px) for the header.
    // The timeline ruler should match this.

    // Let's assume the timeline area starts at 192px offset for the ruler content
    // But for simplicity of click seeking, we can make the whole width correspond to time if we want,
    // OR we can make the click only work in the track area.

    const x = e.clientX - rect.left;
    const headerWidth = 192; // w-48

    if (x < headerWidth) return;

    const trackWidth = rect.width - headerWidth;
    const clickX = x - headerWidth;
    const t = Math.max(0, Math.min(1, clickX / trackWidth)) * duration;

    seek(t);
  };

  // Double click to add keyframe
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!selectedTrackId) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const headerWidth = 192;

    if (x < headerWidth) return;

    const trackWidth = rect.width - headerWidth;
    const clickX = x - headerWidth;
    const t = Math.max(0, Math.min(1, clickX / trackWidth)) * duration;

    // Default value 0, user can change it
    addKeyframe(selectedTrackId, t, 0);
  };

  const playheadLeftPct = (currentTime / duration) * 100;

  return (
    <div
      className="flex-1 bg-slate-950/40 rounded-xl border border-slate-800/60 relative overflow-hidden shadow-inner flex flex-col"
      ref={timelineRef}
      onClick={handleTimelineClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Time Ruler */}
      <div className="h-7 border-b border-slate-800/80 bg-slate-900/80 flex items-end backdrop-blur-sm z-10 shrink-0 select-none cursor-pointer hover:bg-slate-900 transition-colors">
        {/* Header spacer */}
        <div className="w-48 shrink-0 border-r border-slate-800/30 h-full flex items-center px-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Tracks
          </span>
        </div>

        {/* Ticks */}
        <div className="flex-1 relative h-full overflow-hidden">
          {Array.from({ length: 11 }).map((_, i) => {
            const pct = i * 10;
            return (
              <div
                key={i}
                className="absolute bottom-0 h-2 border-l border-slate-700/50"
                style={{ left: `${pct}%` }}
              >
                <span className="absolute -top-4 -left-1 text-[9px] font-mono font-medium text-slate-500">
                  {(duration * (i / 10)).toFixed(1)}s
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tracks Container */}
      <div
        className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar relative"
        onClick={() => {
          selectTrack(null);
          selectKeyframe(null);
        }}
      >
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
            <span className="text-xs">No tracks added</span>
            <span className="text-[10px] italic">
              Add a variable to start animating
            </span>
          </div>
        ) : (
          tracks.map((track) => (
            <TrackRow key={track.id} track={track} duration={duration} />
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

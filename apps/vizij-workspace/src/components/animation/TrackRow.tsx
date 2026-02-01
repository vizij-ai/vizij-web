import { useRef } from "react";
import { type AnimationTrack, useAnimationStore } from "../../state/animationStore";
import { cn } from "../../utils/cn";

interface TrackRowProps {
    track: AnimationTrack;
    duration: number;
}

export function TrackRow({ track, duration }: TrackRowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { selectKeyframe, selectedKeyframeId, updateKeyframe, removeKeyframe, selectTrack, selectedTrackId } = useAnimationStore();

    const handleTrackClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        selectTrack(track.id);
    };

    const handleKeyframeClick = (e: React.MouseEvent, kfId: string) => {
        e.stopPropagation();
        selectKeyframe(kfId);
        selectTrack(track.id);
    };

    const isSelected = selectedTrackId === track.id;

    return (
        <div
            className={cn(
                "relative h-9 bg-slate-900/40 rounded-lg border overflow-hidden hover:bg-slate-800/40 transition-all group select-none cursor-pointer active:scale-[0.998] active:brightness-95",
                isSelected ? "border-blue-500/50 bg-slate-800/30" : "border-slate-800/50"
            )}
            onClick={handleTrackClick}
            ref={containerRef}
        >
            {/* Label / Header */}
            <div className="absolute inset-y-0 left-0 w-48 bg-slate-900/80 border-r border-slate-800/80 z-10 flex items-center px-3">
                <div
                    className="w-1.5 h-1.5 rounded-full mr-2 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    style={{ backgroundColor: track.color }}
                />
                <span className="text-[10px] font-bold text-slate-300 font-mono tracking-tight group-hover:text-white transition-colors truncate">
                    {track.label}
                </span>
            </div>

            {/* Keyframes Area */}
            <div className="absolute inset-y-0 left-48 right-0 overflow-hidden">
                {track.keyframes.map((kf) => {
                    const leftPct = (kf.time / duration) * 100;
                    const isKfSelected = selectedKeyframeId === kf.id;

                    return (
                        <div
                            key={kf.id}
                            className={cn(
                                "absolute top-1/2 w-2 h-2 -ml-1 -mt-1 rotate-45 border border-slate-950 shadow-sm z-20 cursor-pointer hover:scale-125 transition-transform",
                                isKfSelected ? "bg-white border-blue-500 z-30" : "bg-slate-400"
                            )}
                            style={{ left: `${leftPct}%`, backgroundColor: isKfSelected ? '#fff' : track.color }}
                            onClick={(e) => handleKeyframeClick(e, kf.id)}
                            title={`Time: ${kf.time.toFixed(2)}s\nValue: ${kf.value.toFixed(2)}`}
                        />
                    );
                })}
            </div>
        </div>
    );
}

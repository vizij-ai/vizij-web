import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { StudioPanel } from "../ui/StudioPanel";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { Button } from "../ui/Button";

export function AnimationPanel() {
    const playbackState = useGraphRuntime((state) => state.graphPlaybackState);
    const setGraphPlaybackState = useGraphRuntime((state) => state.setGraphPlaybackState);

    const togglePlayback = () => {
        setGraphPlaybackState(playbackState === "playing" ? "paused" : "playing");
    };

    return (
        <StudioPanel title="Timeline" scrollable={false}>
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3 px-1">
                    <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-md hover:bg-slate-800">
                            <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            className="h-6 px-3 rounded-md text-[10px] uppercase font-bold tracking-wider"
                            onClick={togglePlayback}
                        >
                            {playbackState === "playing" ? (
                                <Pause className="h-3 w-3 fill-current" />
                            ) : (
                                <Play className="h-3 w-3 fill-current" />
                            )}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-md hover:bg-slate-800">
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                    </div>

                    <div className="h-4 w-px bg-slate-800 mx-2" />

                    <div className="flex items-baseline gap-1 font-mono text-slate-300">
                        <span className="text-sm font-bold">00</span>
                        <span className="text-[10px] text-slate-600">:</span>
                        <span className="text-sm font-bold">00</span>
                        <span className="text-[10px] text-slate-600">:</span>
                        <span className="text-sm font-bold">00</span>
                    </div>
                </div>

                <div className="flex-1 bg-slate-950/30 rounded-lg border border-slate-800/50 relative overflow-hidden">
                    {/* Time Ruler */}
                    <div className="absolute top-0 left-0 w-full h-6 border-b border-slate-800 bg-slate-900/50 flex items-end px-2">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="flex-1 h-2 border-l border-slate-700/50 last:border-r text-[9px] text-slate-600 pl-1 font-mono">
                                {i * 5}
                            </div>
                        ))}
                    </div>

                    {/* Tracks */}
                    <div className="absolute top-8 left-0 w-full space-y-3 px-2">
                        <div className="relative h-8 bg-slate-900/50 rounded border border-slate-800 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 w-1/3 bg-blue-900/20 border-r border-blue-500/20">
                                <span className="absolute left-2 top-1.5 text-[10px] font-bold text-blue-400">Head_Rotate</span>
                            </div>
                            <div className="absolute inset-y-2 left-[40%] right-[20%] bg-blue-600/30 rounded-sm border border-blue-500/30"></div>
                        </div>
                        <div className="relative h-8 bg-slate-900/50 rounded border border-slate-800 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 w-1/3 bg-purple-900/20 border-r border-purple-500/20">
                                <span className="absolute left-2 top-1.5 text-[10px] font-bold text-purple-400">Eye_Blink</span>
                            </div>
                            <div className="absolute inset-y-2 left-[10%] right-[60%] bg-purple-600/30 rounded-sm border border-purple-500/30"></div>
                        </div>
                    </div>

                    {/* Playhead */}
                    <div className="absolute top-0 left-[30%] w-px h-full bg-red-500 z-10 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-red-500 rounded-b-sm"></div>
                    </div>
                </div>
            </div>
        </StudioPanel>
    );
}

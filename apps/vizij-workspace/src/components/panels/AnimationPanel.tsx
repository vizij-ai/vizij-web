import { ChevronLeft, ChevronRight, Pause, Play, Settings2 } from "lucide-react";
import { Panel } from "../ui/Panel";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { Button } from "../ui/Button";

export function AnimationPanel() {
    const playbackState = useGraphRuntime((state) => state.graphPlaybackState);
    const setGraphPlaybackState = useGraphRuntime((state) => state.setGraphPlaybackState);

    const togglePlayback = () => {
        setGraphPlaybackState(playbackState === "playing" ? "paused" : "playing");
    };

    const actions = (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-200">
            <Settings2 className="h-3.5 w-3.5" />
        </Button>
    );

    return (
        <Panel
            title="Timeline"
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
            actions={actions}
            badge="00:00:00"
        >
            <div className="flex flex-col h-full gap-2 p-1">
                <div className="flex items-center gap-2 px-1">
                    <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 shadow-sm">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            className="h-6 px-4 rounded-md mx-0.5 text-[10px] uppercase font-bold tracking-wider shadow-sm"
                            onClick={togglePlayback}
                        >
                            {playbackState === "playing" ? (
                                <Pause className="h-3 w-3 fill-current" />
                            ) : (
                                <Play className="h-3 w-3 fill-current ml-0.5" />
                            )}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="h-6 w-px bg-slate-800/50 mx-2" />

                    <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800/50">
                        <div className="flex items-baseline gap-1 font-mono text-slate-300">
                            <span className="text-sm font-bold tracking-tight">00</span>
                            <span className="text-[10px] text-slate-600 font-bold">:</span>
                            <span className="text-sm font-bold tracking-tight">00</span>
                            <span className="text-[10px] text-slate-600 font-bold">:</span>
                            <span className="text-sm font-bold tracking-tight text-blue-400">00</span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest ml-1">SMPTE</span>
                    </div>
                </div>

                <div className="flex-1 bg-slate-950/40 rounded-xl border border-slate-800/60 relative overflow-hidden shadow-inner">
                    {/* Time Ruler */}
                    <div className="absolute top-0 left-0 w-full h-7 border-b border-slate-800/80 bg-slate-900/80 flex items-end px-2 backdrop-blur-sm z-10">
                        {Array.from({ length: 40 }).map((_, i) => (
                            <div key={i} className="flex-1 h-2 border-l border-slate-700/30 group relative">
                                {i % 5 === 0 && (
                                    <span className="absolute -top-4 -left-1 text-[9px] font-mono font-medium text-slate-500 select-none">
                                        {i * 10}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Tracks */}
                    <div className="absolute top-7 left-0 w-full p-2 space-y-1 overflow-y-auto custom-scrollbar h-[calc(100%-28px)]">
                        <div className="relative h-9 bg-slate-900/40 rounded-lg border border-slate-800/50 overflow-hidden hover:bg-slate-800/40 hover:border-slate-700/50 transition-colors group">
                            <div className="absolute inset-y-0 left-0 w-48 bg-slate-900/80 border-r border-slate-800/80 z-10 flex items-center px-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                <span className="text-[10px] font-bold text-slate-300 font-mono tracking-tight group-hover:text-white transition-colors">Head_Rotate</span>
                            </div>
                            <div className="absolute inset-y-2 left-[30%] right-[20%] bg-blue-500/20 rounded border border-blue-500/30 backdrop-blur-[1px]"></div>
                            {/* Keyframes */}
                            <div className="absolute top-1/2 left-[30%] w-2 h-2 -ml-1 -mt-1 bg-blue-400 rotate-45 border border-slate-950 shadow-sm z-0"></div>
                            <div className="absolute top-1/2 right-[20%] w-2 h-2 -mr-1 -mt-1 bg-blue-400 rotate-45 border border-slate-950 shadow-sm z-0"></div>
                        </div>

                        <div className="relative h-9 bg-slate-900/40 rounded-lg border border-slate-800/50 overflow-hidden hover:bg-slate-800/40 hover:border-slate-700/50 transition-colors group">
                            <div className="absolute inset-y-0 left-0 w-48 bg-slate-900/80 border-r border-slate-800/80 z-10 flex items-center px-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                                <span className="text-[10px] font-bold text-slate-300 font-mono tracking-tight group-hover:text-white transition-colors">Eye_Blink</span>
                            </div>
                            <div className="absolute inset-y-2 left-[10%] right-[60%] bg-purple-500/20 rounded border border-purple-500/30 backdrop-blur-[1px]"></div>
                            {/* Keyframes */}
                            <div className="absolute top-1/2 left-[10%] w-2 h-2 -ml-1 -mt-1 bg-purple-400 rotate-45 border border-slate-950 shadow-sm z-0"></div>
                            <div className="absolute top-1/2 right-[60%] w-2 h-2 -mr-1 -mt-1 bg-purple-400 rotate-45 border border-slate-950 shadow-sm z-0"></div>
                        </div>
                    </div>

                    {/* Playhead */}
                    <div className="absolute top-0 left-[30%] w-px h-full bg-red-500/80 z-20 pointer-events-none">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-2 bg-red-500 rounded-b-sm shadow-[0_2px_4px_rgba(239,68,68,0.4)]"></div>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-red-500 to-transparent opacity-50"></div>
                    </div>
                </div>
            </div>
        </Panel>
    );
}

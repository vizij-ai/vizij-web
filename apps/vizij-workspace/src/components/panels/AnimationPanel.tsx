import React from "react";
import { StudioPanel } from "../ui/StudioPanel";
import { useGraphRuntime } from "../../state/RigControllerProvider";


export function AnimationPanel() {
    const playbackState = useGraphRuntime((state) => state.graphPlaybackState);

    return (
        <StudioPanel title="Timeline">
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <button className="px-2 py-1 bg-slate-800 rounded text-xs hover:bg-slate-700">Prev</button>
                    <button className="px-2 py-1 bg-blue-600 rounded text-xs hover:bg-blue-500 text-white min-w-[40px]">
                        {playbackState === "playing" ? "Pause" : "Play"}
                    </button>
                    <button className="px-2 py-1 bg-slate-800 rounded text-xs hover:bg-slate-700">Next</button>
                    <div className="ml-auto text-xs text-slate-500">00:00:00</div>
                </div>

                <div className="flex-1 bg-slate-900 rounded border border-slate-800 relative min-h-[50px]">
                    {/* Mock Timeline Tracks */}
                    <div className="absolute top-2 left-0 w-full h-6 bg-slate-800/50 mb-1"></div>
                    <div className="absolute top-9 left-0 w-full h-6 bg-slate-800/30"></div>

                    {/* Playhead */}
                    <div className="absolute top-0 left-1/4 w-0.5 h-full bg-red-500 z-10"></div>
                    <div className="absolute top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
            </div>
        </StudioPanel>
    );
}

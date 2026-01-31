import React from "react";
import { StudioPanel } from "../ui/StudioPanel";
import { useGraphRuntime } from "../../state/RigControllerProvider";


export function DebugPanel() {
    const {
        graphStatus,
        faceId,
        graphTimeSeconds,
        graphFrameRate,
        graphPlaybackState,
        playGraph,
        pauseGraph,
        stopGraph,
        stepGraph,
    } = useGraphRuntime((state) => ({
        graphStatus: state.graphStatus,
        faceId: state.faceId,
        graphTimeSeconds: state.graphTimeSeconds,
        graphFrameRate: state.graphFrameRate,
        graphPlaybackState: state.graphPlaybackState,
        playGraph: state.playGraph,
        pauseGraph: state.pauseGraph,
        stopGraph: state.stopGraph,
        stepGraph: state.stepGraph,
    }));

    const formattedGraphTime = React.useMemo(
        () => formatGraphClock(graphTimeSeconds),
        [graphTimeSeconds],
    );

    const formattedFrameRate = React.useMemo(() => {
        return graphFrameRate > 0 ? `${graphFrameRate.toFixed(1)} fps` : "— fps";
    }, [graphFrameRate]);

    const handleTogglePlayback = () => {
        if (graphPlaybackState === "playing") {
            pauseGraph();
        } else {
            playGraph();
        }
    };

    return (
        <StudioPanel title="Debug Info">
            <div className="flex flex-col gap-4 text-xs font-mono p-1">
                {/* Status Section */}
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-slate-500">Status</span>
                        <span className={graphStatus === "ready" ? "text-green-400" : "text-yellow-400"}>
                            {graphStatus}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Face ID</span>
                        <span>{faceId || "None"}</span>
                    </div>
                </div>

                {/* Playback Controls */}
                <div className="pt-4 border-t border-[var(--border-default)] space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">Graph Time</span>
                        <span className="text-slate-200 font-bold">{formattedGraphTime}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">FPS</span>
                        <span>{formattedFrameRate}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <button
                            onClick={handleTogglePlayback}
                            className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                            disabled={graphStatus !== "ready"}
                        >
                            {graphPlaybackState === "playing" ? "Pause" : "Play"}
                        </button>
                        <button
                            onClick={stopGraph}
                            className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                            disabled={graphStatus !== "ready"}
                        >
                            Stop
                        </button>
                        <button
                            onClick={stepGraph}
                            className="px-2 py-1 bg-[var(--bg-element)] hover:bg-[var(--bg-element-hover)] rounded text-center border border-[var(--border-element)] text-[var(--color-slate-100)]"
                            disabled={graphStatus !== "ready"}
                        >
                            Step
                        </button>
                    </div>
                </div>
            </div>
        </StudioPanel>
    );
}

function formatGraphClock(value: number): string {
    if (!Number.isFinite(value)) {
        return "00:00.00";
    }
    const seconds = Math.max(value, 0);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds - minutes * 60;
    return `${minutes.toString().padStart(2, "0")}:${remaining
        .toFixed(2)
        .padStart(5, "0")}`;
}


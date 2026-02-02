import { useRef, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useAnimationStore, evaluateTrack } from "../../state/animationStore";
import { TimelineEditor } from "../animation/TimelineEditor";
import {
  VariableSelector,
  type VariableSelection,
} from "../inspector/VariableSelector";
import { useBindingAuthoring } from "../../state/RigControllerProvider";

export function AnimationPanel() {
  const {
    isPlaying,
    play,
    pause,
    currentTime,
    duration,
    tick,
    tracks,
    addTrack,
    removeTrack,
    selectedTrackId,
    selectedKeyframeId,
    updateKeyframe,
  } = useAnimationStore();

  const { handleInputValueChange } = useBindingAuthoring((s) => s);
  const [showVariableSelector, setShowVariableSelector] = useState(false);

  // Playback Loop
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    let handle: number;
    const loop = (time: number) => {
      if (lastTimeRef.current !== 0) {
        const delta = (time - lastTimeRef.current) / 1000;
        tick(delta);
      }
      lastTimeRef.current = time;
      if (isPlaying) {
        handle = requestAnimationFrame(loop);
      }
    };

    if (isPlaying) {
      lastTimeRef.current = 0;
      handle = requestAnimationFrame(loop);
    } else {
      lastTimeRef.current = 0;
    }

    return () => cancelAnimationFrame(handle);
  }, [isPlaying, tick]);

  // Apply values to scene
  useEffect(() => {
    // We run this effect whenever currentTime or tracks change
    // In a real app we might want to do this inside the tick function or a subscriber
    // to avoid React render overhead, but for now this is fine.
    tracks.forEach((track) => {
      const val = evaluateTrack(track, currentTime);
      handleInputValueChange(track.variableId, val);
    });
  }, [currentTime, tracks, handleInputValueChange]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
  };

  const handleAddVariable = (selection: VariableSelection) => {
    setShowVariableSelector(false);
    if (selection.type === "variable") {
      addTrack(selection.id);
    } else if (selection.type === "property") {
      // For properties we might need to find the underlying input ID or create one?
      // The variable selector usually returns IDs that are already inputs for "variable" type.
      // For "property", it gives objectId/featureId.
      // For this MVP, let's assume we can map it or just support variables.
      // Actually `VariableController` handles creation of custom inputs for properties.
      // We'll skip complex property creation for this step and focus on existing inputs.
      // Or better, we can assume the user selecting a property expects us to create an input?
      // Let's just alert for now if it's complex, or try to use the raw ID if it matches an input.

      // Simple fallback:
      console.warn(
        "Direct property animation not fully implemented yet, select an existing variable.",
      );
    }
  };

  const handleDeleteTrack = () => {
    if (selectedTrackId) {
      removeTrack(selectedTrackId);
    }
  };

  const actions = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-slate-500 hover:text-red-400"
        onClick={handleDeleteTrack}
        disabled={!selectedTrackId}
        title="Delete Selected Track"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-slate-500 hover:text-slate-200"
        onClick={() => setShowVariableSelector(true)}
        title="Add Track"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-slate-500 hover:text-slate-200"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Panel
      title="Timeline"
      description="Create and edit animations with keyframes."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
      badge={formatTime(currentTime)}
    >
      <div className="flex flex-col h-full gap-2 p-1">
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-6 px-4 rounded-md mx-0.5 text-[10px] uppercase font-bold tracking-wider shadow-sm"
              onClick={isPlaying ? pause : play}
            >
              {isPlaying ? (
                <Pause className="h-3 w-3 fill-current" />
              ) : (
                <Play className="h-3 w-3 fill-current ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-slate-800/50 mx-2" />

          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800/50">
            <div className="flex items-baseline gap-1 font-mono text-slate-300">
              <span className="text-sm font-bold tracking-tight">
                {formatTime(currentTime)}
              </span>
              <span className="text-[10px] text-slate-600 font-bold mx-1">
                /
              </span>
              <span className="text-xs text-slate-500">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        <TimelineEditor />

        <Modal
          open={showVariableSelector}
          onClose={() => setShowVariableSelector(false)}
          title="Add Track"
          maxWidth="md"
        >
          <VariableSelector
            onSelect={handleAddVariable}
            onCancel={() => setShowVariableSelector(false)}
          />
        </Modal>

        {/* Selected Keyframe Inspector */}
        {selectedTrackId &&
          selectedKeyframeId &&
          (() => {
            const track = tracks.find((t) => t.id === selectedTrackId);
            const keyframe = track?.keyframes.find(
              (k) => k.id === selectedKeyframeId,
            );

            if (!track || !keyframe) return null;

            return (
              <div className="bg-slate-900/80 border-t border-slate-800 p-2 grid grid-cols-2 gap-4 backdrop-blur-sm">
                <label className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 w-12">
                    Time
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    className="flex-1 bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 outline-none"
                    value={keyframe.time}
                    onChange={(e) =>
                      updateKeyframe(track.id, keyframe.id, {
                        time: parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 w-12">
                    Value
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="flex-1 bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:border-blue-500 outline-none"
                    value={keyframe.value}
                    onChange={(e) =>
                      updateKeyframe(track.id, keyframe.id, {
                        value: parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            );
          })()}
      </div>
    </Panel>
  );
}

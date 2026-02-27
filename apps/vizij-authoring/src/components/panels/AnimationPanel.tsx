import { useRef, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
  Settings2,
  Trash2,
  Download,
  Boxes,
} from "lucide-react";
import { useVizijStore } from "@vizij/render";
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
import { usePoseRigAuthoring } from "../../poseRig/usePoseRigAuthoring";
import { AnimationPoseService } from "../../services/AnimationPoseService";
import { PoseSnapshotService } from "../../poseRig/services/poseSnapshotService";



export function AnimationPanel() {
  const isDev = process.env.NODE_ENV !== "production";
  const {
    animations,
    activeAnimationId,
    selectAnimation,
    createAnimation,
    isPlaying,
    play,
    pause,
    currentTime,
    tick,
    playSpeed,
    setPlaySpeed,
    selectedTrackId,
    selectedKeyframeId,
    addTrack,
    removeTrack,
    updateKeyframe,
    importExternalAnimations,
  } = useAnimationStore();

  const activeAnimation = activeAnimationId ? animations[activeAnimationId] : null;
  const tracks = activeAnimation?.tracks || [];
  const duration = activeAnimation?.duration || 10;

  const glbAnimations = useVizijStore((state) => state.animations);
  console.log("AnimationPanel: glbAnimations", glbAnimations);
  const poseRigAuthoring = usePoseRigAuthoring({
    faceId: null, // These are usually provided by a parent or another hook, but we only need the actions
    rootId: null,
    standardInputs: [],
    inputValues: {},
    onInputValueChange: () => { },
  });

  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
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
    if (tracks.length > 0 && currentTime >= 0) {
      if (isDev && isPlaying && Math.floor(currentTime * 10) % 5 === 0) {
        console.log(`[AnimationPanel] Playing t=${currentTime.toFixed(2)}s, tracks=${tracks.length}`);
      }
      tracks.forEach((track, i) => {
        const val = evaluateTrack(track, currentTime);
        if (isDev && isPlaying && Math.floor(currentTime * 10) % 10 === 0 && i < 3) {
          console.log(`[AnimationPanel] Apply: ${track.variableId} = ${val.toFixed(3)}`);
        }
        handleInputValueChange(track.variableId, val);
      });
    }
  }, [currentTime, tracks, handleInputValueChange, isPlaying]);

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
  };

  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const managedStandardInputs = useBindingAuthoring((state) => state.managedStandardInputs);

  const handleAddVariable = (selection: VariableSelection) => {
    console.log("[AnimationPanel] handleAddVariable selection:", selection);
    setShowVariableSelector(false);

    if (selection.type === "variable") {
      if (activeAnimationId) {
        addTrack(activeAnimationId, { variableId: selection.id });
      } else {
        console.warn("[AnimationPanel] No active animation to add track to.");
      }
    } else if (selection.type === "property") {
      const addMappedTrack = (inputId: string, targetId: string | undefined, originalLabel: string) => {
        const binding = targetId ? inputBindings[targetId] : undefined;
        let mappedId = inputId;
        let mappedLabel = originalLabel;

        if (binding && binding.inputId && binding.inputId !== "__self__") {
          mappedId = binding.inputId;
          const driver = managedStandardInputs.find((d) => d.input.id === mappedId);
          mappedLabel = driver ? driver.input.label : `${originalLabel} (Driver)`;
          console.log(`[AnimationPanel] Mapped property ${inputId} to driver ${mappedId}`);
        } else {
          console.warn(
            `[AnimationPanel] Property ${inputId} does not have an active driver binding. Animation may not play in graph context.`,
          );
        }

        if (activeAnimationId) {
          addTrack(activeAnimationId, { variableId: mappedId, label: mappedLabel });
        } else {
          console.warn("[AnimationPanel] No active animation to add track to.");
        }
      };

      if (selection.inputIds && selection.targetIds) {
        // Handle multiple properties
        selection.inputIds.forEach((inputId, index) => {
          const targetId = selection.targetIds?.[index];
          const trackLabel = selection.labels?.[index] || selection.label;
          addMappedTrack(inputId, targetId, trackLabel);
        });
      } else if (selection.inputId) {
        addMappedTrack(selection.inputId, selection.targetId, selection.label);
      } else {
        console.warn(
          "Direct property animation not fully implemented yet, select an existing variable.",
        );
      }
    }
  };

  const handleDeleteTrack = () => {
    if (selectedTrackId) {
      removeTrack(selectedTrackId);
    }
  };

  const handleExtractPoses = () => {
    if (tracks.length === 0) return;
    const values = AnimationPoseService.evaluateAtTime(tracks, currentTime);

    const reverseLookup = new Map<string, string>();
    managedStandardInputs.forEach((input) => {
      const { elementId, featureKey, componentKey } = input.metadata || {};
      if (elementId && featureKey && componentKey) {
        let suffix = "";
        if (componentKey === "x") suffix = "/x";
        if (componentKey === "y") suffix = "/y";
        if (componentKey === "z") suffix = "/z";
        if ((componentKey as string) === "w") suffix = "/w";
        let featurePath = featureKey.replace(/:/g, "/");
        if (featureKey === "transform") featurePath = "translation";
        const lookupKey = `${elementId}/${featurePath}${suffix}`;
        reverseLookup.set(lookupKey, input.input.id);
      }
    });

    const resolvedValues: Record<string, number> = {};
    Object.entries(values).forEach(([vid, val]) => {
      let finalId = vid;
      if (reverseLookup.has(vid)) {
        finalId = reverseLookup.get(vid)!;
      }
      resolvedValues[finalId] = val;
    });

    const pose = PoseSnapshotService.createPoseDefinition(`Extracted (${currentTime.toFixed(2)}s)`);
    pose.values = resolvedValues;

    poseRigAuthoring.addPose(pose);
  };

  const handleCreateAnimation = () => {
    const name = window.prompt("Animation Name", "New Animation");
    if (name) {
      createAnimation(name);
    }
  };

  const actions = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
        onClick={() => {
          console.log(`[AnimationPanel] Importing ${glbAnimations.length} animations`);
          importExternalAnimations(glbAnimations, managedStandardInputs);
        }}
        disabled={glbAnimations.length === 0}
        title="Import Animations from GLB"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
        onClick={handleExtractPoses}
        disabled={tracks.length === 0}
        title="Extract Pose at Current Time"
      >
        <Boxes className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-red-400"
        onClick={handleDeleteTrack}
        disabled={!selectedTrackId}
        title="Delete Selected Track"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
        onClick={() => setShowVariableSelector(true)}
        title="Add Track"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
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
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
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
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="h-6 w-px bg-zinc-800/50 mx-2" />

          {/* Animation Selector */}
          <div className="flex items-center gap-1">
            <select
              className="bg-zinc-900 text-zinc-300 text-[10px] h-6 px-2 rounded-md border border-zinc-800 outline-none focus:border-blue-500 transition-colors cursor-pointer min-w-[120px]"
              value={activeAnimationId || ""}
              onChange={(e) => selectAnimation(e.target.value)}
            >
              {Object.values(animations).map((anim) => (
                <option key={anim.id} value={anim.id}>
                  {anim.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-200 ml-1"
              onClick={handleCreateAnimation}
              title="Create New Animation"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="h-6 w-px bg-zinc-800/50 mx-2" />

          {/* Time Scale Control */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Time Scale</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              className="bg-zinc-900 text-zinc-300 text-[10px] h-6 w-12 px-1 rounded-md border border-zinc-800 outline-none focus:border-blue-500 transition-colors text-center"
              value={playSpeed}
              onChange={(e) => setPlaySpeed(parseFloat(e.target.value) || 1)}
            />
          </div>

          <div className="h-6 w-px bg-zinc-800/50 mx-2" />

          <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1 rounded-lg border border-zinc-800/50">
            <div className="flex items-baseline gap-1 font-mono text-zinc-300">
              <span className="text-sm font-bold tracking-tight">
                {formatTime(currentTime)}
              </span>
              <span className="text-[10px] text-zinc-600 font-bold mx-1">
                /
              </span>
              <span className="text-xs text-zinc-500">
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
            const keyframe = tracks.find((t: any) => t.id === selectedTrackId)?.keyframes.find(
              (k: any) => k.id === selectedKeyframeId,
            );

            if (!keyframe) return null;

            return (
              <div className="bg-zinc-900/80 border-t border-zinc-800 p-2 grid grid-cols-2 gap-4 backdrop-blur-sm">
                <label className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 w-12">
                    Time
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    className="flex-1 bg-zinc-950/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:border-blue-500 outline-none"
                    value={keyframe.time}
                    onChange={(e) =>
                      updateKeyframe(selectedTrackId, keyframe.id, {
                        time: parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 w-12">
                    Value
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="flex-1 bg-zinc-950/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:border-blue-500 outline-none"
                    value={keyframe.value}
                    onChange={(e) =>
                      updateKeyframe(selectedTrackId, keyframe.id, {
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

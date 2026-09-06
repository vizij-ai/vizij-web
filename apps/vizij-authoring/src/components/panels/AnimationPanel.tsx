import { useMemo, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Square,
  StepBack,
  StepForward,
  Trash2,
  X,
} from "lucide-react";
import { ANIMATION_STEP_SECONDS } from "../../hooks/animationStepMath";
import { ANIMATION_TIMELINE_FPS } from "../../utils/animationTimeDisplay";
import type { ManagedStandardInput } from "../../types/standardInputs";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TimelineEditor } from "../animation/TimelineEditor";
import { SavePoseFromPlayhead } from "../animation/SavePoseFromPlayhead";
import { useAnimationStore } from "../../state/animationStore";
import { useAnimationTransport } from "../../hooks/useAnimationTransport";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";
import { formatPlaybackClock } from "../../utils/animationTimeDisplay";
import { buildVisibleInputCatalog, type InputCatalogRow } from "./inputCatalog";

function resolveManagedSource(
  entry: ManagedStandardInput,
): InputCatalogRow["source"] {
  return entry.metadata?.elementType === "standard" ? "preset" : entry.source;
}

function collectFullyLockedFaceElementIds(
  managedInputs: readonly ManagedStandardInput[],
  lockedTargetIds: ReadonlySet<string>,
): Set<string> {
  if (lockedTargetIds.size === 0) {
    return new Set<string>();
  }

  const componentIdsByElementId = new Map<string, Set<string>>();
  managedInputs.forEach((entry) => {
    if (!isPropsRigStandardInputPath(entry.input.path)) {
      return;
    }
    const elementId = entry.metadata?.elementId?.trim();
    const componentId = entry.metadata?.componentId?.trim();
    if (!elementId || !componentId) {
      return;
    }
    const bucket = componentIdsByElementId.get(elementId);
    if (bucket) {
      bucket.add(componentId);
      return;
    }
    componentIdsByElementId.set(elementId, new Set([componentId]));
  });

  const lockedElementIds = new Set<string>();
  componentIdsByElementId.forEach((componentIds, elementId) => {
    const fullyLocked = Array.from(componentIds).every((componentId) =>
      lockedTargetIds.has(componentId),
    );
    if (fullyLocked) {
      lockedElementIds.add(elementId);
    }
  });
  return lockedElementIds;
}

function collectLockedPropsRigComponentIds(
  managedInputs: readonly ManagedStandardInput[],
  lockedTargetIds: ReadonlySet<string>,
): Set<string> {
  if (lockedTargetIds.size === 0) {
    return new Set<string>();
  }
  const lockedComponentIds = new Set<string>();
  managedInputs.forEach((entry) => {
    if (!isPropsRigStandardInputPath(entry.input.path)) {
      return;
    }
    const componentId = entry.metadata?.componentId?.trim();
    if (!componentId) {
      return;
    }
    if (lockedTargetIds.has(componentId)) {
      lockedComponentIds.add(componentId);
    }
  });
  return lockedComponentIds;
}

interface AnimationPanelProps {
  onClosePanel?: () => void;
  onInspectTrack?: (trackId: string) => void;
  playbackState?: "playing" | "paused" | "stopped";
  onPlayTransport?: () => void;
  onPauseTransport?: () => void;
  onStopTransport?: () => void;
  statusMessage?: string | null;
  /** Names a pose saved from the playhead; falls back to "Pose" when absent. */
  clipName?: string | null;
}

export function AnimationPanel({
  onClosePanel,
  onInspectTrack,
  playbackState,
  onPlayTransport,
  onPauseTransport,
  onStopTransport,
  statusMessage = null,
  clipName = null,
}: AnimationPanelProps) {
  const {
    isPlaying,
    currentTime,
    duration,
    loop,
    playSpeed,
    seek,
    setLoop,
    setPlaySpeed,
    tracks,
    addTrack,
    removeTrack,
    selectedTrackId,
    timeDisplayMode,
    setTimeDisplayMode,
  } = useAnimationStore();
  const transport = useAnimationTransport();
  const hasExternalTransportControls =
    playbackState !== undefined ||
    onPlayTransport !== undefined ||
    onPauseTransport !== undefined ||
    onStopTransport !== undefined;
  const effectivePlaybackState =
    playbackState ??
    (isPlaying ? "playing" : transport.active ? "paused" : "stopped");
  const handlePlay = hasExternalTransportControls
    ? onPlayTransport
    : transport.play;
  const handlePause = hasExternalTransportControls
    ? onPauseTransport
    : transport.pause;
  const handleStop = hasExternalTransportControls
    ? onStopTransport
    : transport.stop;
  const runtimeTransportBound =
    !hasExternalTransportControls || effectivePlaybackState !== "stopped";
  const handleSeek = runtimeTransportBound ? transport.seek : seek;
  const handleTimelinePause = runtimeTransportBound
    ? transport.pause
    : undefined;
  const handleStep = runtimeTransportBound ? () => transport.step() : undefined;
  // A backward step is a negative delta. `nextStepTime` clamps the *result* to
  // the clip rather than clamping the delta, which is what made the control
  // forward-only.
  const handleStepBack = runtimeTransportBound
    ? () => transport.step(-ANIMATION_STEP_SECONDS)
    : undefined;
  const handleToggleLoop = () => {
    if (runtimeTransportBound) {
      transport.setLoop(!loop);
      return;
    }
    setLoop(!loop);
  };
  const handlePlaySpeedChange = (value: number) => {
    if (runtimeTransportBound) {
      transport.setSpeed(value);
      return;
    }
    setPlaySpeed(value);
  };

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);

  const [showTrackSelector, setShowTrackSelector] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");
  const [savedPoseNotice, setSavedPoseNotice] = useState<string | null>(null);

  const fullyLockedFaceElementIds = useMemo(
    () =>
      collectFullyLockedFaceElementIds(
        managedStandardInputs,
        lockedInspectorTargetIds,
      ),
    [lockedInspectorTargetIds, managedStandardInputs],
  );
  const lockedPropsRigComponentIds = useMemo(
    () =>
      collectLockedPropsRigComponentIds(
        managedStandardInputs,
        lockedInspectorTargetIds,
      ),
    [lockedInspectorTargetIds, managedStandardInputs],
  );

  const candidateRows = useMemo(
    () =>
      buildVisibleInputCatalog({
        managedStandardInputs,
        fullyLockedFaceElementIds,
        lockedPropsRigComponentIds,
        inputValues,
        poseNameById: new Map(),
        poseGroups: [],
        blendStages: [],
        poseGroupBlendModeFallback: "average",
        poseCountByGroupId: new Map(),
        poseGroupLabelById: new Map(),
        resolveManagedSource,
      })
        .filter((row) => row.editable && row.selectable)
        .sort((left, right) => {
          const labelOrder = left.label.localeCompare(right.label);
          if (labelOrder !== 0) {
            return labelOrder;
          }
          return left.path.localeCompare(right.path);
        }),
    [
      fullyLockedFaceElementIds,
      inputValues,
      lockedPropsRigComponentIds,
      managedStandardInputs,
    ],
  );

  const selectedTrackInputIds = useMemo(
    () => new Set(tracks.map((track) => track.variableId)),
    [tracks],
  );

  const visibleCandidates = useMemo(() => {
    const normalizedSearch = trackSearch.trim().toLowerCase();
    return candidateRows.filter((row) => {
      if (selectedTrackInputIds.has(row.inputId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        row.label.toLowerCase().includes(normalizedSearch) ||
        row.path.toLowerCase().includes(normalizedSearch) ||
        row.inputId.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [candidateRows, selectedTrackInputIds, trackSearch]);

  const handleAddTrack = (row: InputCatalogRow) => {
    addTrack(row.inputId, row.label, row.path);
    setShowTrackSelector(false);
    setTrackSearch("");
  };

  const handleDeleteTrack = () => {
    if (!selectedTrackId) {
      return;
    }
    removeTrack(selectedTrackId);
  };

  const actions = (
    <div className="flex items-center gap-1">
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
        onClick={() => setShowTrackSelector(true)}
        title="Add Track"
        aria-label="Add Track"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      {onClosePanel ? (
        <Button
          variant="ghost"
          size="icon"
          data-testid="animation-panel-hide"
          className="h-6 w-6 text-text-secondary hover:text-text-primary"
          onClick={onClosePanel}
          title="Hide panel"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <Panel
      data-testid="animation-panel"
      title="Animation"
      description="Author and preview animation clips through runtime transport."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
      badge={formatPlaybackClock(currentTime, timeDisplayMode)}
    >
      <div className="flex h-full flex-col gap-2 p-1">
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              onClick={handleStop}
              disabled={!handleStop || effectivePlaybackState === "stopped"}
              title="Stop"
              aria-label="Stop"
            >
              <Square className="h-3 w-3 fill-current" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              onClick={handleStepBack}
              disabled={!handleStepBack}
              title="Step back one frame"
              aria-label="Step back one frame"
            >
              <StepBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-6 px-4 rounded-md mx-0.5 text-[10px] uppercase font-bold tracking-wider shadow-sm"
              onClick={
                effectivePlaybackState === "playing" ? handlePause : handlePlay
              }
              disabled={
                effectivePlaybackState === "playing"
                  ? !handlePause
                  : !handlePlay
              }
              title={effectivePlaybackState === "playing" ? "Pause" : "Play"}
              aria-label={
                effectivePlaybackState === "playing" ? "Pause" : "Play"
              }
            >
              {effectivePlaybackState === "playing" ? (
                <Pause className="h-3 w-3 fill-current" />
              ) : (
                <Play className="h-3 w-3 fill-current ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              onClick={handleStep}
              disabled={!handleStep}
              title="Step forward one frame"
              aria-label="Step forward one frame"
            >
              <StepForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="h-6 w-px bg-zinc-800/50 mx-2" />

          <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-1 rounded-lg border border-zinc-800/50">
            <div className="flex items-baseline gap-1 font-mono text-zinc-300">
              <span className="text-sm font-bold tracking-tight">
                {formatPlaybackClock(currentTime, timeDisplayMode)}
              </span>
              <span className="text-[10px] text-zinc-600 font-bold mx-1">
                /
              </span>
              <span className="text-xs text-zinc-500">
                {formatPlaybackClock(duration, timeDisplayMode)}
              </span>
            </div>
          </div>

          <Button
            variant={loop ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={handleToggleLoop}
          >
            Loop
          </Button>

          <select
            className="h-6 rounded border border-zinc-800 bg-zinc-900/70 px-2 text-[10px] text-zinc-300"
            value={String(playSpeed)}
            onChange={(event) =>
              handlePlaySpeedChange(Number.parseFloat(event.target.value))
            }
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
          <div className="grid grid-cols-2 gap-1 rounded border border-zinc-800/70 bg-zinc-900/40 p-0.5">
            <Button
              variant={timeDisplayMode === "seconds" ? "primary" : "subtle"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTimeDisplayMode("seconds")}
              aria-pressed={timeDisplayMode === "seconds"}
              title="Show timeline time in seconds"
            >
              Seconds
            </Button>
            <Button
              variant={timeDisplayMode === "frames" ? "primary" : "subtle"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTimeDisplayMode("frames")}
              aria-pressed={timeDisplayMode === "frames"}
              title={`Show timeline time in frames (${ANIMATION_TIMELINE_FPS} fps)`}
            >
              Frames
            </Button>
          </div>
        </div>

        {statusMessage ? (
          <p className="px-1 text-[11px] text-text-secondary">
            {statusMessage}
          </p>
        ) : null}

        {savedPoseNotice ? (
          <p
            className="flex items-center gap-2 px-1 text-[11px] text-text-secondary"
            data-testid="animation-panel-saved-pose-notice"
          >
            <span>
              Saved pose{" "}
              <span className="font-medium text-text-primary">
                {savedPoseNotice}
              </span>
              . Edit it from the Poses panel.
            </span>
            <button
              type="button"
              className="text-text-muted hover:text-text-primary"
              onClick={() => setSavedPoseNotice(null)}
              aria-label="Dismiss saved pose notice"
            >
              <X className="h-3 w-3" />
            </button>
          </p>
        ) : null}

        <TimelineEditor
          onSeek={handleSeek}
          onPause={handleTimelinePause}
          onResume={handlePlay}
          timeDisplayMode={timeDisplayMode}
          onInspectTrack={onInspectTrack}
          playheadActions={
            <SavePoseFromPlayhead
              clipName={clipName}
              timeDisplayMode={timeDisplayMode}
              onSaved={({ name }) => setSavedPoseNotice(name)}
            />
          }
        />

        <Modal
          open={showTrackSelector}
          onClose={() => setShowTrackSelector(false)}
          title="Add Track"
          maxWidth="md"
        >
          <div className="flex flex-col gap-2">
            <input
              className="w-full rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
              placeholder="Search inputs by name or path"
              value={trackSearch}
              onChange={(event) => setTrackSearch(event.target.value)}
            />
            <div className="max-h-80 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/30">
              {visibleCandidates.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-500">
                  No editable input controls available.
                </p>
              ) : (
                visibleCandidates.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full border-b border-zinc-800/70 px-3 py-2 text-left transition-colors hover:bg-zinc-900/60 last:border-b-0"
                    onClick={() => handleAddTrack(row)}
                  >
                    <div className="text-xs font-medium text-zinc-100">
                      {row.label}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {row.path}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Modal>
      </div>
    </Panel>
  );
}

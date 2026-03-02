import { useMemo, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Settings2,
  Square,
  StepForward,
  Trash2,
} from "lucide-react";
import type { ManagedStandardInput } from "../../types/standardInputs";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TimelineEditor } from "../animation/TimelineEditor";
import { useAnimationStore } from "../../state/animationStore";
import { useAnimationTransport } from "../../hooks/useAnimationTransport";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";
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

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
}

export function AnimationPanel() {
  const {
    isPlaying,
    currentTime,
    duration,
    loop,
    playSpeed,
    tracks,
    addTrack,
    removeTrack,
    selectedTrackId,
    selectedKeyframeId,
    updateKeyframe,
  } = useAnimationStore();
  const transport = useAnimationTransport();

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);

  const [showTrackSelector, setShowTrackSelector] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");

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
    addTrack(row.inputId, row.label);
    setShowTrackSelector(false);
    setTrackSearch("");
  };

  const handleDeleteTrack = () => {
    if (!selectedTrackId) {
      return;
    }
    removeTrack(selectedTrackId);
  };

  const selectedTrack = selectedTrackId
    ? (tracks.find((track) => track.id === selectedTrackId) ?? null)
    : null;
  const selectedKeyframe =
    selectedTrack && selectedKeyframeId
      ? (selectedTrack.keyframes.find(
          (keyframe) => keyframe.id === selectedKeyframeId,
        ) ?? null)
      : null;

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
      description="Author and preview clips through runtime transport."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
      badge={formatTime(currentTime)}
    >
      <div className="flex h-full flex-col gap-2 p-1">
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              onClick={transport.stop}
              title="Stop"
            >
              <Square className="h-3 w-3 fill-current" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="h-6 px-4 rounded-md mx-0.5 text-[10px] uppercase font-bold tracking-wider shadow-sm"
              onClick={isPlaying ? transport.pause : transport.play}
              disabled={!transport.active}
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
              onClick={() => transport.step()}
              disabled={!transport.active}
              title="Step"
            >
              <StepForward className="h-3.5 w-3.5" />
            </Button>
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

          <Button
            variant={loop ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => transport.setLoop(!loop)}
            disabled={!transport.active}
          >
            Loop
          </Button>

          <select
            className="h-6 rounded border border-zinc-800 bg-zinc-900/70 px-2 text-[10px] text-zinc-300"
            value={String(playSpeed)}
            onChange={(event) =>
              transport.setSpeed(Number.parseFloat(event.target.value))
            }
            disabled={!transport.active}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>
        </div>

        <TimelineEditor onSeek={transport.seek} />

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

        {selectedTrack && selectedKeyframe ? (
          <div className="bg-zinc-900/80 border-t border-zinc-800 p-2 grid grid-cols-2 gap-4 backdrop-blur-sm">
            <label className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-zinc-500 w-12">
                Time
              </span>
              <input
                type="number"
                step="0.1"
                className="flex-1 bg-zinc-950/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:border-blue-500 outline-none"
                value={selectedKeyframe.time}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }
                  updateKeyframe(selectedTrack.id, selectedKeyframe.id, {
                    time: nextValue,
                  });
                }}
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
                value={selectedKeyframe.value}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }
                  updateKeyframe(selectedTrack.id, selectedKeyframe.id, {
                    value: nextValue,
                  });
                }}
              />
            </label>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

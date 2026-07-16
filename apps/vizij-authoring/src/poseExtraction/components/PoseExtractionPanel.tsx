import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Camera, Film, Trash2, AlertTriangle, Play, Pause } from "lucide-react";
import { Panel } from "../../components/ui/Panel";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { RowSlider } from "../../components/ui/RowSlider";
import { ListRow } from "../../components/ui/ListRow";
import { usePoseRigStore } from "../../poseRig/store";
import type { FbxPoseExtractionApi } from "../useFbxPoseExtraction";

interface CapturedFrame {
  poseId: string;
  name: string;
  time: number;
  clipId: string;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)}s`;
}

function sanitizeGroupSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "clip";
}

export interface PoseExtractionPanelProps {
  api: FbxPoseExtractionApi;
  onClose?: () => void;
}

/**
 * Docked panel for extracting poses from raw (FBX-derived) animation clips:
 * pick a clip, scrub to a frame (live preview in the viewport), and capture the
 * frame as a named pose. Captured poses land in the pose-rig store and can be
 * renamed inline or removed here before export.
 */
export function PoseExtractionPanel({
  api,
  onClose,
}: PoseExtractionPanelProps) {
  const {
    clips,
    activeClip,
    activeClipId,
    time,
    isPlaying,
    setActiveClip,
    seek,
    togglePlay,
    captureFrame,
    channelCount,
    unmappedChannels,
  } = api;

  const updatePoseName = usePoseRigStore((state) => state.updatePoseName);
  const deletePose = usePoseRigStore((state) => state.deletePose);

  const [captured, setCaptured] = useState<CapturedFrame[]>([]);
  const [group, setGroup] = useState("");
  const [poseName, setPoseName] = useState("");

  // Default the group to `fbx/<clip>` whenever the active clip changes.
  useEffect(() => {
    if (activeClip) {
      setGroup(`fbx/${sanitizeGroupSegment(activeClip.name)}`);
    }
  }, [activeClipId, activeClip]);

  const defaultPoseName = useMemo(() => {
    if (!activeClip) {
      return "";
    }
    return `${activeClip.name} @ ${formatSeconds(time)}`;
  }, [activeClip, time]);

  const clipOptions = useMemo(
    () => clips.map((clip) => ({ value: clip.id, label: clip.name })),
    [clips],
  );

  const duration = activeClip?.duration ?? 0;
  const sliderStep = duration > 0 ? Math.max(duration / 240, 0.001) : 0.01;

  const handleCapture = () => {
    const name = (poseName.trim() || defaultPoseName).trim();
    const trimmedGroup = group.trim();
    const poseId = captureFrame({
      name,
      group: trimmedGroup.length > 0 ? trimmedGroup : null,
    });
    if (!poseId) {
      return;
    }
    setCaptured((previous) => [
      ...previous,
      { poseId, name, time, clipId: activeClipId ?? "" },
    ]);
    setPoseName("");
  };

  const handleRename = (poseId: string, nextName: string) => {
    setCaptured((previous) =>
      previous.map((frame) =>
        frame.poseId === poseId ? { ...frame, name: nextName } : frame,
      ),
    );
    updatePoseName(poseId, nextName);
  };

  const handleRemove = (poseId: string) => {
    setCaptured((previous) =>
      previous.filter((frame) => frame.poseId !== poseId),
    );
    deletePose(poseId);
  };

  const capturedForClip = useMemo(
    () => captured.filter((frame) => frame.clipId === activeClipId),
    [captured, activeClipId],
  );

  return (
    <Panel
      title="Pose Extraction"
      description="Scrub a loaded animation and capture frames as poses."
      actions={
        onClose ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Hide
          </Button>
        ) : undefined
      }
      className="h-full overflow-y-auto"
    >
      <div className="flex flex-col gap-4 p-1">
        <div className="flex items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Select
              label="Animation clip"
              value={activeClipId ?? ""}
              onChange={setActiveClip}
              options={clipOptions}
              placeholder="Select a clip…"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <Film className="h-3.5 w-3.5" />
            <span>
              {channelCount} channel{channelCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Frame
            </label>
            <span className="font-mono text-[11px] text-text-secondary">
              {formatSeconds(time)} / {formatSeconds(duration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              onClick={togglePlay}
              disabled={!activeClipId || duration <= 0}
              aria-label={isPlaying ? "Pause clip" : "Play clip"}
              title={isPlaying ? "Pause clip" : "Play clip"}
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <div className="flex-1">
              <RowSlider
                value={time}
                min={0}
                max={duration > 0 ? duration : 1}
                step={sliderStep}
                onChange={seek}
                disabled={!activeClipId || duration <= 0}
              />
            </div>
          </div>
        </div>

        {unmappedChannels.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-[11px] text-text-secondary">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              {unmappedChannels.length} channel
              {unmappedChannels.length === 1 ? "" : "s"} couldn&apos;t be mapped
              to a rig input (bones or morph weights) and will be skipped on
              capture.
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-card p-3">
          <Input
            size="sm"
            value={poseName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setPoseName(event.target.value)
            }
            placeholder={defaultPoseName || "Pose name"}
          />
          <div className="flex items-center gap-2">
            <Input
              size="sm"
              value={group}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setGroup(event.target.value)
              }
              placeholder="Pose group (path)"
              startContent={
                <span className="text-[10px] uppercase tracking-widest">
                  Group
                </span>
              }
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCapture}
              disabled={!activeClipId || channelCount === 0}
            >
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              Capture frame
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Captured poses
            </span>
            <span className="text-[11px] text-text-muted">
              {capturedForClip.length}
            </span>
          </div>
          {capturedForClip.length === 0 ? (
            <p className="px-1 text-[11px] text-text-muted">
              No poses captured yet. Scrub to a frame and capture it.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {capturedForClip.map((frame) => (
                <ListRow
                  key={frame.poseId}
                  title={
                    <Input
                      size="sm"
                      value={frame.name}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        handleRename(frame.poseId, event.target.value)
                      }
                    />
                  }
                  meta={
                    <span className="font-mono text-[10px] text-text-muted">
                      {formatSeconds(frame.time)}
                    </span>
                  }
                  actions={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(frame.poseId)}
                      aria-label="Remove pose"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

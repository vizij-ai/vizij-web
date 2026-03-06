import { useMemo } from "react";
import { useGraphRuntimeStore } from "../../state/graphRuntimeStore";
import { useSpeechPlayback } from "../../hooks/useSpeechPlayback";
import { POLLY_VOICES, type PollyVoice } from "../../data/pollyVoices";
import type { SelectOption } from "../ui/Select";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/TextArea";
import { Select } from "../ui/Select";
import { Badge } from "../ui/Badge";

const VOICE_OPTIONS: SelectOption[] = POLLY_VOICES.map((v) => ({
  value: v,
  label: v,
}));

const EMPTY_POSES: import("@vizij/runtime-react").PoseDefinition[] = [];
const EMPTY_GROUPS: import("@vizij/runtime-react").PoseGroupDefinition[] = [];

export function SpeechPanel() {
  const faceId = useGraphRuntimeStore((s) => s.faceId);
  const poses = useGraphRuntimeStore(
    (s) => s.poseConfig?.poses ?? EMPTY_POSES,
  );
  const poseGroups = useGraphRuntimeStore(
    (s) => s.poseConfig?.poseGroups ?? EMPTY_GROUPS,
  );
  const stageRuntimeInput = useGraphRuntimeStore((s) => s.stageRuntimeInput);
  const animateRuntimeValue = useGraphRuntimeStore(
    (s) => s.animateRuntimeValue,
  );
  const runtimeReady = useGraphRuntimeStore((s) => s.runtimeViewReady);

  const speech = useSpeechPlayback({
    faceId,
    poses,
    poseGroups,
    stageRuntimeInput,
    animateRuntimeValue,
    runtimeReady,
  });

  const statusBadge = useMemo(
    () => (
      <Badge
        tone={speech.status === "speaking" ? "accent" : "muted"}
      >
        {speech.status === "idle"
          ? "Idle"
          : speech.status === "preparing"
            ? "Preparing"
            : "Speaking"}
      </Badge>
    ),
    [speech.status],
  );

  const buttonLabel =
    speech.status === "preparing"
      ? "Preparing..."
      : speech.status === "speaking"
        ? "Stop"
        : "Speak";

  const buttonVariant =
    speech.status === "speaking" ? "danger" : "primary";

  const buttonHandler =
    speech.status === "speaking" ? speech.handleStop : speech.handleSpeak;

  const buttonDisabled =
    speech.status === "preparing" || !runtimeReady;

  return (
    <Panel title="Speech" badge={statusBadge}>
      <div className="flex flex-col gap-3">
        <TextArea
          value={speech.script}
          onChange={(e) => speech.setScript(e.target.value)}
          rows={3}
          placeholder="Type something for the avatar to say..."
        />
        <Select
          label="Voice"
          value={speech.selectedVoice}
          onChange={(val) => speech.setSelectedVoice(val as PollyVoice)}
          options={VOICE_OPTIONS}
          size="sm"
        />
        {speech.groupOptions.length > 0 && (
          <Select
            label="Pose Group"
            value={speech.selectedGroupId ?? ""}
            onChange={(val) => speech.setSelectedGroupId(val || null)}
            options={speech.groupOptions}
            size="sm"
          />
        )}
        {speech.error && (
          <p className="text-xs text-red-400 px-1">{speech.error}</p>
        )}
        <Button
          variant={buttonVariant}
          size="sm"
          className="w-full"
          disabled={buttonDisabled}
          onClick={buttonHandler}
        >
          {buttonLabel}
        </Button>
      </div>
      {/* Hidden audio element for playback */}
      <audio
        ref={speech.audioRef}
        className="hidden"
        onPlay={speech.handleAudioPlay}
        onPause={speech.handleAudioPause}
        onEnded={speech.handleAudioEnded}
      />
    </Panel>
  );
}

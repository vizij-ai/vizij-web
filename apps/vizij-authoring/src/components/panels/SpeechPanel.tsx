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

export function SpeechPanel() {
  const faceId = useGraphRuntimeStore((s) => s.faceId);
  const poses = useGraphRuntimeStore(
    (s) => s.poseConfig?.poses ?? EMPTY_POSES,
  );
  const stageRuntimeInput = useGraphRuntimeStore((s) => s.stageRuntimeInput);
  const animateRuntimeValue = useGraphRuntimeStore(
    (s) => s.animateRuntimeValue,
  );
  const runtimeReady = useGraphRuntimeStore((s) => s.runtimeViewReady);

  const speech = useSpeechPlayback({
    faceId,
    poses,
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

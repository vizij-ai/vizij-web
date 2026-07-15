import { useCallback, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Button, Select, TextArea, type SelectOption } from "../../ui";
import { useSpeechPlayback } from "../../../hooks/useSpeechPlayback";
import { POLLY_VOICES, type PollyVoice } from "../../../data/pollyVoices";
import { cn } from "../../../utils/cn";

const VOICE_OPTIONS: SelectOption[] = POLLY_VOICES.map((voice) => ({
  value: voice,
  label: voice,
}));

export function DemoVoicePanel() {
  const { ready, setInput, animateValue, faceId, assetBundle } =
    useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;

  const stageRuntimeInput = useCallback(
    (graphPath: string, value: number) => {
      if (!ready) {
        return;
      }
      setInput(graphPath, { float: value });
    },
    [ready, setInput],
  );

  const animateRuntimeValue = useCallback(
    (graphPath: string, value: number, duration: number) => {
      if (!ready) {
        return;
      }
      void animateValue(graphPath, { float: value }, { duration });
    },
    [animateValue, ready],
  );

  const poses = useMemo(() => poseConfig?.poses ?? [], [poseConfig]);

  const speech = useSpeechPlayback({
    faceId: poseConfig?.faceId ?? faceId ?? "face",
    poses,
    poseGroups: poseConfig?.poseGroups,
    stageRuntimeInput,
    animateRuntimeValue,
    runtimeReady: ready,
  });

  const busy = speech.isLoading || speech.status === "preparing";

  return (
    <div
      data-testid="empty-state-demo-voice"
      className="flex w-full flex-col gap-2 text-left"
    >
      <TextArea
        data-testid="empty-state-demo-voice-script"
        rows={2}
        value={speech.script}
        onChange={(event) => speech.setScript(event.target.value)}
        placeholder="Type something for the face to say…"
      />
      <div className="flex items-center gap-2">
        <Select
          className="w-36 shrink-0"
          size="sm"
          value={speech.selectedVoice}
          onChange={(voice) => speech.setSelectedVoice(voice as PollyVoice)}
          options={VOICE_OPTIONS}
        />
        <Button
          data-testid="empty-state-demo-voice-speak"
          variant="primary"
          size="sm"
          disabled={!ready || busy}
          onClick={() => void speech.handleSpeak()}
        >
          {busy ? "Preparing…" : "Speak"}
        </Button>
        {speech.status === "speaking" ? (
          <Button
            data-testid="empty-state-demo-voice-stop"
            variant="subtle"
            size="sm"
            onClick={speech.handleStop}
          >
            Stop
          </Button>
        ) : null}
        <audio
          ref={speech.audioRef}
          controls
          className="h-8 min-w-0 flex-1"
          onPlay={speech.handleAudioPlay}
          onPause={speech.handleAudioPause}
          onEnded={speech.handleAudioEnded}
        />
      </div>
      {speech.error ? (
        <p
          data-testid="empty-state-demo-voice-error"
          className="text-xs text-red-400"
        >
          {speech.error}
        </p>
      ) : null}
      {speech.words.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Words
          </p>
          <div className="flex flex-wrap gap-1">
            {speech.words.map((word, index) => (
              <span
                key={`${word.value}-${index}`}
                className="rounded border border-border-default bg-bg-panel px-1.5 py-0.5 text-[11px] text-text-muted"
              >
                {word.value}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {speech.visemeLabels.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Visemes
          </p>
          <div
            data-testid="empty-state-demo-viseme-chips"
            className="flex flex-wrap gap-1"
          >
            {speech.visemeLabels.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                  index === speech.activeVisemeIndex
                    ? "border-accent bg-accent/20 text-text-primary"
                    : "border-border-default bg-bg-panel text-text-muted",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

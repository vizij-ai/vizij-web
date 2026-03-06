import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, ChevronDown, ChevronRight } from "lucide-react";
import { useGraphRuntimeStore } from "../../state/graphRuntimeStore";
import { useSpeechPlayback } from "../../hooks/useSpeechPlayback";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { POLLY_VOICES, type PollyVoice } from "../../data/pollyVoices";
import {
  getDeepgramApiKey,
  hasEnvDeepgramApiKey,
  setDeepgramApiKey,
} from "../../services/deepgramConfig";
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

  // --- ASR state ---
  const [apiKey, setApiKey] = useState<string | null>(getDeepgramApiKey);
  const [asrConfigOpen, setAsrConfigOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const handleSpeakRef = useRef(speech.handleSpeak);
  handleSpeakRef.current = speech.handleSpeak;
  const setScriptRef = useRef(speech.setScript);
  setScriptRef.current = speech.setScript;

  const onFinalTranscript = useCallback((transcript: string) => {
    setScriptRef.current(transcript);
    void handleSpeakRef.current();
  }, []);

  const asr = useSpeechRecognition({
    apiKey,
    onFinalTranscript,
  });

  // Sync interim transcript to the text area while listening
  useEffect(() => {
    if (asr.listening && asr.interimTranscript) {
      speech.setScript(asr.interimTranscript);
    }
  }, [asr.listening, asr.interimTranscript, speech.setScript]);

  const toggleEcho = useCallback(() => {
    if (asr.listening) {
      asr.stopListening();
    } else {
      void asr.startListening();
    }
  }, [asr]);

  const saveApiKey = useCallback(() => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      setDeepgramApiKey(trimmed);
      setApiKey(trimmed);
      setKeyInput("");
    }
  }, [keyInput]);

  // --- Status badge ---
  const statusBadge = useMemo(
    () => (
      <Badge
        tone={
          asr.listening
            ? "accent"
            : speech.status === "speaking"
              ? "accent"
              : "muted"
        }
      >
        {asr.listening
          ? "Listening"
          : speech.status === "idle"
            ? "Idle"
            : speech.status === "preparing"
              ? "Preparing"
              : "Speaking"}
      </Badge>
    ),
    [speech.status, asr.listening],
  );

  // --- Button state ---
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
    speech.status === "preparing" || !runtimeReady || asr.listening;

  const echoDisabled =
    !apiKey || speech.status === "preparing" || speech.status === "speaking";

  const showAsrConfig = !hasEnvDeepgramApiKey();
  const displayError = speech.error || asr.error;

  return (
    <Panel title="Speech" badge={statusBadge}>
      <div className="flex flex-col gap-3">
        <TextArea
          value={speech.script}
          onChange={(e) => speech.setScript(e.target.value)}
          rows={3}
          placeholder="Type something for the avatar to say..."
          disabled={asr.listening}
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
        {displayError && (
          <p className="text-xs text-red-400 px-1">{displayError}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant={buttonVariant}
            size="sm"
            className="flex-1"
            disabled={buttonDisabled}
            onClick={buttonHandler}
          >
            {buttonLabel}
          </Button>
          {asr.supported && (
            <Button
              variant={asr.listening ? "danger" : "secondary"}
              size="sm"
              className="shrink-0"
              disabled={echoDisabled}
              onClick={toggleEcho}
              title="Push to Echo — speak into mic, avatar echoes back"
            >
              {asr.listening ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Hidden audio element for playback */}
      <audio
        ref={speech.audioRef}
        className="hidden"
        onPlay={speech.handleAudioPlay}
        onPause={speech.handleAudioPause}
        onEnded={speech.handleAudioEnded}
      />

      {/* ASR Configuration (only when no env var key) */}
      {showAsrConfig && (
        <div className="mt-3 border-t border-border-default/30 pt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setAsrConfigOpen((v) => !v)}
          >
            {asrConfigOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            ASR Settings
            {!apiKey && (
              <span className="text-amber-400 ml-1">(key required)</span>
            )}
          </button>
          {asrConfigOpen && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Deepgram API key"
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveApiKey();
                    }
                  }}
                />
                <Button variant="secondary" size="sm" onClick={saveApiKey}>
                  Save
                </Button>
              </div>
              {apiKey && (
                <p className="text-[10px] text-text-muted px-0.5">
                  Key configured. Mic button is ready.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useGraphRuntimeStore } from "../../state/graphRuntimeStore";
import { useSpeechPlayback } from "../../hooks/useSpeechPlayback";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useConversation } from "../../hooks/useConversation";
import { POLLY_VOICES, type PollyVoice } from "../../data/pollyVoices";
import {
  getDeepgramApiKey,
  hasEnvDeepgramApiKey,
  setDeepgramApiKey,
} from "../../services/deepgramConfig";
import {
  getOpenaiApiKey,
  hasEnvOpenaiApiKey,
  setOpenaiApiKey,
} from "../../services/openaiConfig";
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

type SpeechMode = "echo" | "conversation";

const MODE_OPTIONS: SelectOption[] = [
  { value: "echo", label: "Echo" },
  { value: "conversation", label: "Conversation" },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are {{agent_name}}, a friendly conversational avatar. Respond naturally and concisely. Keep responses under 2-3 sentences to maintain a natural conversation pace.";

const AGENT_NAME_KEY = "vizij_agent_name";
const DEFAULT_AGENT_NAME = "Vizij";

function getStoredAgentName(): string {
  try {
    return localStorage.getItem(AGENT_NAME_KEY) || DEFAULT_AGENT_NAME;
  } catch {
    return DEFAULT_AGENT_NAME;
  }
}

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

  // --- API keys ---
  const [dgKey, setDgKey] = useState<string | null>(getDeepgramApiKey);
  const [oaiKey, setOaiKey] = useState<string | null>(getOpenaiApiKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dgKeyInput, setDgKeyInput] = useState("");
  const [oaiKeyInput, setOaiKeyInput] = useState("");

  // --- Mode (smart default based on available keys) ---
  const [mode, setMode] = useState<SpeechMode>(() =>
    dgKey && oaiKey ? "conversation" : "echo",
  );

  // --- Agent name (persisted to localStorage) ---
  const [agentName, setAgentName] = useState(getStoredAgentName);

  const saveAgentName = useCallback((name: string) => {
    setAgentName(name);
    try {
      localStorage.setItem(AGENT_NAME_KEY, name);
    } catch {
      // ignore
    }
  }, []);

  // --- System prompt ---
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  // Resolve {{agent_name}} tag in prompt
  const resolvedPrompt = useMemo(
    () => systemPrompt.replace(/\{\{agent_name\}\}/g, agentName || DEFAULT_AGENT_NAME),
    [systemPrompt, agentName],
  );

  // --- Conversation hook ---
  const conversation = useConversation({
    apiKey: oaiKey,
    systemPrompt: resolvedPrompt,
  });

  // --- Refs for async callbacks ---
  const handleSpeakRef = useRef(speech.handleSpeak);
  handleSpeakRef.current = speech.handleSpeak;
  const setScriptRef = useRef(speech.setScript);
  setScriptRef.current = speech.setScript;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const historyRef = useRef<HTMLDivElement>(null);

  // --- ASR final transcript handler (mode-dependent) ---
  const onFinalTranscript = useCallback((transcript: string) => {
    setScriptRef.current(transcript);

    if (modeRef.current === "echo") {
      void handleSpeakRef.current(transcript);
    } else {
      // Conversation: send to LLM, then speak response
      void conversationRef.current.sendMessage(transcript).then((response) => {
        if (response) {
          setScriptRef.current(response);
          void handleSpeakRef.current(response);
        }
      });
    }
  }, []);

  const asr = useSpeechRecognition({
    apiKey: dgKey,
    autoStopSilenceMs: mode === "conversation" ? 1500 : 0,
    onFinalTranscript,
  });

  // Sync interim transcript to the text area while listening
  useEffect(() => {
    if (asr.listening && asr.interimTranscript) {
      speech.setScript(asr.interimTranscript);
    }
  }, [asr.listening, asr.interimTranscript, speech.setScript]);

  // Auto-scroll conversation history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [conversation.history.length]);

  const toggleMic = useCallback(() => {
    if (asr.listening) {
      asr.stopListening();
    } else {
      void asr.startListening();
    }
  }, [asr]);

  const saveDgKey = useCallback(() => {
    const trimmed = dgKeyInput.trim();
    if (trimmed) {
      setDeepgramApiKey(trimmed);
      setDgKey(trimmed);
      setDgKeyInput("");
    }
  }, [dgKeyInput]);

  const saveOaiKey = useCallback(() => {
    const trimmed = oaiKeyInput.trim();
    if (trimmed) {
      setOpenaiApiKey(trimmed);
      setOaiKey(trimmed);
      setOaiKeyInput("");
    }
  }, [oaiKeyInput]);

  // --- Status badge ---
  const statusBadge = useMemo(() => {
    const isThinking = conversation.isProcessing;
    const label = asr.listening
      ? "Listening"
      : isThinking
        ? "Thinking"
        : speech.status === "idle"
          ? "Idle"
          : speech.status === "preparing"
            ? "Preparing"
            : "Speaking";
    const tone =
      asr.listening || isThinking || speech.status === "speaking"
        ? "accent"
        : "muted";
    return <Badge tone={tone}>{label}</Badge>;
  }, [speech.status, asr.listening, conversation.isProcessing]);

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
    speech.status === "speaking" ? speech.handleStop : () => void speech.handleSpeak();

  const buttonDisabled =
    speech.status === "preparing" ||
    !runtimeReady ||
    asr.listening ||
    conversation.isProcessing;

  const micDisabled =
    !dgKey ||
    speech.status === "preparing" ||
    speech.status === "speaking" ||
    conversation.isProcessing ||
    (mode === "conversation" && !oaiKey);

  const modeDisabled = !dgKey;

  // --- Settings visibility ---
  const dgFromEnv = hasEnvDeepgramApiKey();
  const oaiFromEnv = hasEnvOpenaiApiKey();
  const needsKeys = !dgKey || (mode === "conversation" && !oaiKey);

  const displayError = speech.error || asr.error || conversation.error;

  return (
    <Panel title="Speech" badge={statusBadge}>
      <div className="flex flex-col gap-3">
        <TextArea
          value={speech.script}
          onChange={(e) => speech.setScript(e.target.value)}
          rows={3}
          placeholder="Type something for the avatar to say..."
          disabled={asr.listening || conversation.isProcessing}
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
            label="Visemes Input Group"
            value={speech.selectedGroupId ?? ""}
            onChange={(val) => speech.setSelectedGroupId(val || null)}
            options={speech.groupOptions}
            size="sm"
          />
        )}
        <Select
          label="Mode"
          value={mode}
          onChange={(val) => setMode(val as SpeechMode)}
          options={MODE_OPTIONS}
          size="sm"
          disabled={modeDisabled}
        />
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
              disabled={micDisabled}
              onClick={toggleMic}
              title={
                mode === "echo"
                  ? "Push to Echo — speak into mic, avatar echoes back"
                  : "Push to Chat — speak into mic, LLM responds"
              }
            >
              {asr.listening ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        {/* Conversation history */}
        {mode === "conversation" && conversation.history.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                History
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-red-400 transition-colors"
                onClick={conversation.clearHistory}
                title="Clear conversation history"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
            <div
              ref={historyRef}
              className="max-h-32 overflow-y-auto rounded-md border border-border-default/30 bg-bg-input/50 p-2 flex flex-col gap-1.5"
            >
              {conversation.history.map((msg, i) => (
                <div
                  key={i}
                  className={`text-[11px] leading-snug ${
                    msg.role === "user"
                      ? "text-text-muted"
                      : "text-text-primary"
                  }`}
                >
                  <span className="text-[10px] font-medium opacity-60 mr-1">
                    {msg.role === "user" ? "You:" : "AI:"}
                  </span>
                  {msg.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element for playback */}
      <audio
        ref={speech.audioRef}
        className="hidden"
        onPlay={speech.handleAudioPlay}
        onPause={speech.handleAudioPause}
        onEnded={speech.handleAudioEnded}
      />

      {/* Settings — always visible */}
      <div className="mt-3 border-t border-border-default/30 pt-3">
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          {settingsOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Settings
          {needsKeys && (
            <span className="text-amber-400 ml-1">(keys required)</span>
          )}
        </button>
        {settingsOpen && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-text-muted">
                Agent Name
              </span>
              <input
                type="text"
                value={agentName}
                onChange={(e) => saveAgentName(e.target.value)}
                placeholder={DEFAULT_AGENT_NAME}
                className="h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-text-muted">
                Deepgram API Key
                {dgFromEnv
                  ? " (configured via env)"
                  : dgKey
                    ? " (configured)"
                    : ""}
              </span>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={dgKeyInput}
                  onChange={(e) => setDgKeyInput(e.target.value)}
                  placeholder={dgFromEnv ? "Override env key..." : "Deepgram API key"}
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDgKey();
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveDgKey}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-text-muted">
                OpenAI API Key
                {oaiFromEnv
                  ? " (configured via env)"
                  : oaiKey
                    ? " (configured)"
                    : ""}
              </span>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={oaiKeyInput}
                  onChange={(e) => setOaiKeyInput(e.target.value)}
                  placeholder={oaiFromEnv ? "Override env key..." : "OpenAI API key"}
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveOaiKey();
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveOaiKey}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                System Prompt
              </span>
              <TextArea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                placeholder="System prompt for the LLM..."
                className="text-[11px]"
              />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

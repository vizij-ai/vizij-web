import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
import { useOptionalVizijRuntime } from "@vizij/runtime-react";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import { useGraphRuntimeStore } from "../../state/graphRuntimeStore";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import { buildRigInputPath } from "../../poseRig/utils";
import { useSay } from "../../hooks/useSay";
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

const SPEAKING_PATH_KEY = "vizij_speech_speaking_path";
const USER_SPEAKING_PATH_KEY = "vizij_speech_user_speaking_path";
const THINKING_PATH_KEY = "vizij_speech_thinking_path";
const DEFAULT_SPEAKING_PATH = "/speech/speaking";
const DEFAULT_USER_SPEAKING_PATH = "/speech/user_speaking";
const DEFAULT_THINKING_PATH = "/speech/thinking";
const VOICE_KEY = "vizij_speech_voice";
const DEFAULT_VOICE: PollyVoice = "Ruth";
const DEFAULT_SCRIPT =
  "Vizij is a framework for defining, animating, and deploying expressive rendered robot faces";
/** The face standard's expression weights, relative to the face. */
const EXPRESSIONS = "standard/vizij/expression/";
const AUTO_ACTIVATE_MIC_KEY = "vizij_speech_auto_activate_mic";

function getStoredPath(key: string, defaultValue: string): string {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
}

function getStoredAgentName(): string {
  try {
    return localStorage.getItem(AGENT_NAME_KEY) || DEFAULT_AGENT_NAME;
  } catch {
    return DEFAULT_AGENT_NAME;
  }
}

function getStoredVoice(): PollyVoice {
  try {
    const stored = localStorage.getItem(VOICE_KEY);
    return stored && (POLLY_VOICES as readonly string[]).includes(stored)
      ? (stored as PollyVoice)
      : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/** Try to extract JSON {text, emotion} from an LLM response, handling markdown fences. */
function parseEmotionResponse(
  raw: string,
): { text: string; emotion: string | null } | null {
  let str = raw.trim();
  // Strip markdown code fences
  const fenceMatch = str.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) str = fenceMatch[1];
  try {
    const parsed = JSON.parse(str) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "text" in parsed &&
      typeof (parsed as Record<string, unknown>).text === "string"
    ) {
      const p = parsed as Record<string, unknown>;
      return {
        text: p.text as string,
        emotion: typeof p.emotion === "string" ? p.emotion : null,
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

interface SpeechPanelProps {
  onClosePanel?: () => void;
}

/**
 * The speech panel: the main face speaks a script through its `say` method,
 * echoes what the microphone hears, or answers it through a language model
 * in conversation mode. While the face speaks, the panel shows the
 * utterance and its viseme timeline as the face reports them. An answer's
 * emotion is the face standard's expression of that name, among those the
 * face implements.
 */
export function SpeechPanel({ onClosePanel }: SpeechPanelProps) {
  const faceSegment = useGraphRuntimeStore((s) => s.faceSegment);
  const mainFace = useOptionalVizijRuntime();
  const mainFaceRuntime = mainFace?.runtime ?? null;
  const runtimeReady = mainFace?.status === "ready";
  const say = useSay();
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [selectedVoice, setSelectedVoice] =
    useState<PollyVoice>(getStoredVoice);
  const writeRigInput = useCallback(
    (relativePath: string, value: number) => {
      if (!mainFaceRuntime || !runtimeReady) return;
      mainFaceRuntime.setValue(
        buildRigInputPath(faceSegment, relativePath),
        value,
      );
    },
    [faceSegment, mainFaceRuntime, runtimeReady],
  );

  const standardInputsByPath = useBindingAuthoring(
    (s) => s.standardInputsByPath,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (s) => s.handleCreateCustomStandardInput,
  );
  const enabledMotionGraphInputs = useEditorStore((s) => s.enabledInputs);
  const toggleMotionGraphInput = useEditorStore((s) => s.toggleInput);

  // --- PAP input paths (persisted to localStorage) ---
  const [speakingInputPath, setSpeakingInputPath] = useState(() =>
    getStoredPath(SPEAKING_PATH_KEY, DEFAULT_SPEAKING_PATH),
  );
  const [userSpeakingInputPath, setUserSpeakingInputPath] = useState(() =>
    getStoredPath(USER_SPEAKING_PATH_KEY, DEFAULT_USER_SPEAKING_PATH),
  );

  const handleSpeakingPathChange = useCallback((value: string) => {
    setSpeakingInputPath(value);
    try {
      localStorage.setItem(SPEAKING_PATH_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const handleUserSpeakingPathChange = useCallback((value: string) => {
    setUserSpeakingInputPath(value);
    try {
      localStorage.setItem(USER_SPEAKING_PATH_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  const [thinkingInputPath, setThinkingInputPath] = useState(() =>
    getStoredPath(THINKING_PATH_KEY, DEFAULT_THINKING_PATH),
  );

  const handleThinkingPathChange = useCallback((value: string) => {
    setThinkingInputPath(value);
    try {
      localStorage.setItem(THINKING_PATH_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  // --- Emotions: the face standard's expressions the face implements ---
  const [availableEmotions, setAvailableEmotions] = useState<string[]>([]);
  useEffect(() => {
    setAvailableEmotions([]);
    if (!mainFaceRuntime) return;
    let current = true;
    const prefix = mainFaceRuntime.path(EXPRESSIONS);
    mainFaceRuntime.listKeys(prefix).then(
      (keys) => {
        if (!current) return;
        setAvailableEmotions(
          keys
            .map((key) => key.path.slice(prefix.length))
            .filter((name) => name.length > 0 && !name.includes("/"))
            .sort(),
        );
      },
      (error: unknown) => {
        console.error(
          "[vizij-authoring] the face's expressions did not list",
          error,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [mainFaceRuntime]);

  const speak = useCallback(
    (text?: string) => say.speak(text ?? script, selectedVoice),
    [say, script, selectedVoice],
  );

  // --- API keys ---
  const [dgKey, setDgKey] = useState<string | null>(getDeepgramApiKey);
  const [oaiKey, setOaiKey] = useState<string | null>(getOpenaiApiKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoActivateMic, setAutoActivateMic] = useState(() => {
    try {
      return localStorage.getItem(AUTO_ACTIVATE_MIC_KEY) === "true";
    } catch {
      return false;
    }
  });
  const handleAutoActivateMicChange = useCallback((checked: boolean) => {
    setAutoActivateMic(checked);
    try {
      localStorage.setItem(AUTO_ACTIVATE_MIC_KEY, checked ? "true" : "false");
    } catch {
      /* ignore */
    }
  }, []);
  const [dgKeyInput, setDgKeyInput] = useState("");
  const [oaiKeyInput, setOaiKeyInput] = useState("");

  // --- Mode (smart default based on available keys) ---
  const [mode, setModeState] = useState<SpeechMode>(() =>
    dgKey && oaiKey ? "conversation" : "echo",
  );
  const setMode = useCallback((m: SpeechMode) => {
    setModeState(m);
    try {
      localStorage.setItem("vizij_speech_mode", m);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist voice selection for export
  useEffect(() => {
    try {
      localStorage.setItem(VOICE_KEY, selectedVoice);
    } catch {
      /* ignore */
    }
  }, [selectedVoice]);

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
  const [systemPrompt, setSystemPromptState] = useState(() => {
    try {
      return (
        localStorage.getItem("vizij_speech_system_prompt") ||
        DEFAULT_SYSTEM_PROMPT
      );
    } catch {
      return DEFAULT_SYSTEM_PROMPT;
    }
  });
  const setSystemPrompt = useCallback((prompt: string) => {
    setSystemPromptState(prompt);
    try {
      localStorage.setItem("vizij_speech_system_prompt", prompt);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve {{agent_name}} tag in prompt, and append emotion instructions when available
  const resolvedPrompt = useMemo(
    () =>
      systemPrompt.replace(
        /\{\{agent_name\}\}/g,
        agentName || DEFAULT_AGENT_NAME,
      ),
    [systemPrompt, agentName],
  );

  const resolvedPromptWithEmotion = useMemo(() => {
    if (availableEmotions.length === 0) return resolvedPrompt;
    const list = availableEmotions.join(", ");
    return `${resolvedPrompt}\n\nAlways respond with a JSON object in exactly this format: {"text": "<your response>", "emotion": "<emotion>"}. Choose the emotion that best matches the tone of your response. Available emotions: ${list}.`;
  }, [resolvedPrompt, availableEmotions]);

  // --- Conversation hook ---
  const conversation = useConversation({
    apiKey: oaiKey,
    systemPrompt: resolvedPromptWithEmotion,
  });

  // Thinking = LLM processing OR TTS fetching, but only in conversation mode
  const isConversationThinking =
    mode === "conversation" &&
    (conversation.isProcessing || say.status === "preparing");

  // --- Emotion activation: the chosen expression at full weight ---
  const activateEmotion = useCallback(
    (emotionName: string | null) => {
      if (!mainFaceRuntime || !runtimeReady) return;
      for (const name of availableEmotions) {
        mainFaceRuntime.setValue(
          mainFaceRuntime.path(`${EXPRESSIONS}${name}`),
          name === emotionName ? 1 : 0,
        );
      }
    },
    [availableEmotions, mainFaceRuntime, runtimeReady],
  );

  // --- Refs for async callbacks ---
  const handleSpeakRef = useRef(speak);
  handleSpeakRef.current = speak;
  const setScriptRef = useRef(setScript);
  setScriptRef.current = setScript;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const availableEmotionsRef = useRef(availableEmotions);
  availableEmotionsRef.current = availableEmotions;
  const activateEmotionRef = useRef(activateEmotion);
  activateEmotionRef.current = activateEmotion;
  const historyRef = useRef<HTMLDivElement>(null);

  // --- ASR final transcript handler (mode-dependent) ---
  const onFinalTranscript = useCallback((transcript: string) => {
    setScriptRef.current(transcript);

    if (modeRef.current === "echo") {
      void handleSpeakRef.current(transcript);
    } else {
      // Conversation: send to LLM, then speak response
      void conversationRef.current.sendMessage(transcript).then((response) => {
        if (!response) return;

        let speakText = response;
        let emotion: string | null = null;

        // Try to parse JSON emotion response (only when emotions are configured)
        if (availableEmotionsRef.current.length > 0) {
          const parsed = parseEmotionResponse(response);
          if (parsed) {
            speakText = parsed.text;
            emotion = parsed.emotion;
          }
        }

        setScriptRef.current(speakText);
        if (emotion) activateEmotionRef.current(emotion);
        void handleSpeakRef.current(speakText);
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
      setScript(asr.interimTranscript);
    }
  }, [asr.listening, asr.interimTranscript]);

  // Drive the /speech/speaking, /speech/user_speaking and /speech/thinking
  // PAP inputs from the face's speech, the mic and the language model.
  useEffect(() => {
    if (!speakingInputPath) return;
    writeRigInput(speakingInputPath, say.status === "speaking" ? 1 : 0);
  }, [say.status, speakingInputPath, writeRigInput]);

  useEffect(() => {
    if (!userSpeakingInputPath) return;
    writeRigInput(userSpeakingInputPath, asr.listening ? 1 : 0);
  }, [asr.listening, userSpeakingInputPath, writeRigInput]);

  useEffect(() => {
    if (!thinkingInputPath) return;
    writeRigInput(thinkingInputPath, isConversationThinking ? 1 : 0);
  }, [isConversationThinking, thinkingInputPath, writeRigInput]);

  // Auto-provision /speech/speaking, /speech/user_speaking and /speech/thinking PAP inputs
  const lastProvisionedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runtimeReady || !faceSegment) return;
    const key = `${faceSegment}::${speakingInputPath}::${userSpeakingInputPath}::${thinkingInputPath}`;
    if (lastProvisionedRef.current === key) return;
    lastProvisionedRef.current = key;

    for (const path of [
      speakingInputPath,
      userSpeakingInputPath,
      thinkingInputPath,
    ]) {
      if (!path.trim()) continue;
      const normalizedPath = normalizeStandardRigInputPath(path);
      let input = standardInputsByPath.get(normalizedPath);
      if (!input) {
        const created = handleCreateCustomStandardInput(path);
        input = created ?? undefined;
      }
      if (input) {
        const fullPath = buildRigInputPath(faceSegment, input.path);
        if (!enabledMotionGraphInputs.has(fullPath)) {
          toggleMotionGraphInput(fullPath);
        }
      }
    }
  }, [
    runtimeReady,
    faceSegment,
    speakingInputPath,
    userSpeakingInputPath,
    thinkingInputPath,
    standardInputsByPath,
    handleCreateCustomStandardInput,
    enabledMotionGraphInputs,
    toggleMotionGraphInput,
  ]);

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
        : say.status === "idle"
          ? "Idle"
          : say.status === "preparing"
            ? "Preparing"
            : "Speaking";
    const tone =
      asr.listening || isThinking || say.status === "speaking"
        ? "accent"
        : "muted";
    return <Badge tone={tone}>{label}</Badge>;
  }, [say.status, asr.listening, conversation.isProcessing]);

  // --- Button state ---
  const buttonLabel =
    say.status === "preparing"
      ? "Preparing..."
      : say.status === "speaking"
        ? "Stop"
        : "Speak";

  const buttonVariant = say.status === "speaking" ? "danger" : "primary";

  const buttonHandler =
    say.status === "speaking" ? say.stop : () => void speak();

  const buttonDisabled =
    say.status === "preparing" ||
    !runtimeReady ||
    asr.listening ||
    conversation.isProcessing;

  const micDisabled =
    !dgKey ||
    say.status === "preparing" ||
    say.status === "speaking" ||
    conversation.isProcessing ||
    (mode === "conversation" && !oaiKey);

  const modeDisabled = !dgKey;

  // --- Settings visibility ---
  const dgFromEnv = hasEnvDeepgramApiKey();
  const oaiFromEnv = hasEnvOpenaiApiKey();
  const needsKeys = !dgKey || (mode === "conversation" && !oaiKey);

  const displayError = say.error || asr.error || conversation.error;

  return (
    <Panel
      data-testid="speech-panel"
      title="Speech"
      description="Draft speech, trigger playback, and configure conversation input paths for the active runtime face."
      badge={statusBadge}
      actions={
        onClosePanel ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-text-secondary hover:text-text-primary"
            onClick={onClosePanel}
            title="Hide panel"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <TextArea
          data-testid="speech-script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={3}
          placeholder="Type something for the avatar to say..."
          disabled={asr.listening || conversation.isProcessing}
        />
        <Select
          label="Voice"
          value={selectedVoice}
          onChange={(val) => setSelectedVoice(val as PollyVoice)}
          options={VOICE_OPTIONS}
          size="sm"
        />
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
            data-testid="speech-speak"
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

        {/* What the face says, and its visemes as it takes them */}
        {say.visemes.length > 0 || say.utterance ? (
          <div className="flex flex-col gap-1">
            {say.utterance ? (
              <p
                data-testid="speech-utterance"
                className="text-[11px] text-text-primary leading-snug"
              >
                {say.utterance}
              </p>
            ) : null}
            <div
              data-testid="speech-viseme-timeline"
              className="flex flex-wrap gap-1"
            >
              {say.visemes.map((entry, index) => (
                <span
                  key={`${entry.at}-${index}`}
                  data-testid="speech-viseme"
                  title={`${(entry.at / 1000).toFixed(2)}s`}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${
                    say.status === "speaking" &&
                    index === say.visemes.length - 1
                      ? "border-accent bg-accent/20 text-text-primary"
                      : "border-border-default bg-bg-panel text-text-muted"
                  }`}
                >
                  {entry.viseme}
                </span>
              ))}
            </div>
          </div>
        ) : null}

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
              <span className="text-[10px] text-text-muted">Agent Name</span>
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
                  placeholder={
                    dgFromEnv ? "Override env key..." : "Deepgram API key"
                  }
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDgKey();
                  }}
                />
                <Button variant="secondary" size="sm" onClick={saveDgKey}>
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
                  placeholder={
                    oaiFromEnv ? "Override env key..." : "OpenAI API key"
                  }
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveOaiKey();
                  }}
                />
                <Button variant="secondary" size="sm" onClick={saveOaiKey}>
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
                onBlur={conversation.clearHistory}
                rows={2}
                placeholder="System prompt for the LLM..."
                className="text-[11px] resize-y"
              />
            </div>
            {/* PAP Input Mapping */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-text-muted uppercase tracking-wider">
                PAP Input Mapping
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">
                  Avatar Speaking
                </span>
                <input
                  type="text"
                  value={speakingInputPath}
                  onChange={(e) => handleSpeakingPathChange(e.target.value)}
                  placeholder={DEFAULT_SPEAKING_PATH}
                  className="h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">
                  User Speaking
                </span>
                <input
                  type="text"
                  value={userSpeakingInputPath}
                  onChange={(e) => handleUserSpeakingPathChange(e.target.value)}
                  placeholder={DEFAULT_USER_SPEAKING_PATH}
                  className="h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted">
                  Avatar Thinking
                </span>
                <input
                  type="text"
                  value={thinkingInputPath}
                  onChange={(e) => handleThinkingPathChange(e.target.value)}
                  placeholder={DEFAULT_THINKING_PATH}
                  className="h-7 px-2 text-xs rounded-md border border-border-default/50 bg-bg-input text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 font-mono"
                />
              </div>
              {availableEmotions.length > 0 && (
                <p className="text-[10px] text-text-muted leading-snug">
                  Emotions: {availableEmotions.join(", ")}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-[10px] text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoActivateMic}
                onChange={(e) => handleAutoActivateMicChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-default/50 accent-accent"
              />
              Auto-activate microphone on load
            </label>
          </div>
        )}
      </div>
    </Panel>
  );
}

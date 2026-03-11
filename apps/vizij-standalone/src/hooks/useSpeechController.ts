import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VizijSpeechConfig } from "@vizij/render";
import type {
  PoseDefinition,
  PoseGroupDefinition,
} from "@vizij/runtime-react";
import {
  useSpeechRecognition,
  useConversation,
  useSpeechPlayback,
  getDeepgramApiKey,
  getOpenaiApiKey,
  setDeepgramApiKey,
  setOpenaiApiKey,
  buildRigInputPath,
  resolvePoseMembership,
} from "@vizij/speech-react";

const DEFAULT_SYSTEM_PROMPT =
  "You are {{agent_name}}, a friendly conversational avatar. Respond naturally and concisely. Keep responses under 2-3 sentences to maintain a natural conversation pace.";
const DEFAULT_AGENT_NAME = "Vizij";

/** Try to extract JSON {text, emotion} from an LLM response, handling markdown fences. */
function parseEmotionResponse(
  raw: string,
): { text: string; emotion: string | null } | null {
  let str = raw.trim();
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

export interface UseSpeechControllerOptions {
  speechConfig: VizijSpeechConfig | null;
  faceId: string;
  poses: PoseDefinition[];
  poseGroups: PoseGroupDefinition[];
  setInput: (path: string, value: { float: number }) => void;
  animateValue: (
    path: string,
    target: { float: number },
    options?: { duration?: number },
  ) => Promise<void>;
  ready: boolean;
  /** CLI override for auto-activate mic (true/false), or undefined to use bundle config */
  autoMicOverride?: boolean | undefined;
  /** CLI/env override for speech mode, or undefined to use bundle config */
  speechModeOverride?: "echo" | "conversation" | undefined;
}

export interface UseSpeechControllerReturn {
  /** Whether speech is enabled (config present + keys available) */
  enabled: boolean;
  /** Whether the mic is currently listening */
  listening: boolean;
  /** Toggle microphone on/off */
  toggleMic: () => void;
  /** Set mic muted state explicitly (true = muted/stopped, false = unmuted/listening) */
  setMicMuted: (muted: boolean) => void;
  /** Current speech status */
  status: "idle" | "listening" | "thinking" | "speaking";
  /** Any error message */
  error: string | null;
  /** Whether API keys are configured */
  keysConfigured: boolean;
  /** Speak arbitrary text via TTS */
  speak: (text: string) => void;
  /** Stop/interrupt any ongoing speech */
  interrupt: () => void;
  /** Audio element ref — must be attached to a hidden <audio> in the DOM */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Audio event handlers — wire to <audio onPlay/onPause/onEnded> */
  handleAudioPlay: () => void;
  handleAudioPause: () => void;
  handleAudioEnded: () => void;
}

export function useSpeechController({
  speechConfig,
  faceId,
  poses,
  poseGroups,
  setInput,
  animateValue,
  ready,
  autoMicOverride,
  speechModeOverride,
}: UseSpeechControllerOptions): UseSpeechControllerReturn {
  const [dgKey, setDgKey] = useState<string | null>(null);
  const [oaiKey, setOaiKey] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [keysLoaded, setKeysLoaded] = useState(false);

  // Load API keys from Tauri CLI flags, then env/localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolvedDg: string | null = null;
      let resolvedOai: string | null = null;
      let resolvedUrl: string | null = null;
      let resolvedAutoMic: string | undefined;

      try {
        const keys = await invoke<Record<string, string>>("get_speech_keys");
        if (!mounted) return;

        resolvedAutoMic = keys.autoMic;

        // CLI flags take precedence — also persist them to localStorage for the hooks
        if (keys.deepgramKey) {
          setDeepgramApiKey(keys.deepgramKey);
          setDgKey(keys.deepgramKey);
          resolvedDg = keys.deepgramKey;
        } else {
          resolvedDg = getDeepgramApiKey();
          setDgKey(resolvedDg);
        }

        if (keys.openaiKey) {
          setOpenaiApiKey(keys.openaiKey);
          setOaiKey(keys.openaiKey);
          resolvedOai = keys.openaiKey;
        } else {
          resolvedOai = getOpenaiApiKey();
          setOaiKey(resolvedOai);
        }

        if (keys.apiUrl) {
          setApiUrl(keys.apiUrl);
          resolvedUrl = keys.apiUrl;
        }
      } catch {
        // Tauri command not available — fall back to env/localStorage
        if (!mounted) return;
        resolvedDg = getDeepgramApiKey();
        resolvedOai = getOpenaiApiKey();
        setDgKey(resolvedDg);
        setOaiKey(resolvedOai);
      }
      if (mounted) {
        setKeysLoaded(true);
        console.log("[speech] Keys loaded:", {
          deepgram: resolvedDg ? `set (${resolvedDg.slice(0, 8)}...)` : "missing",
          openai: resolvedOai ? `set (${resolvedOai.slice(0, 8)}...)` : "missing",
          apiUrl: resolvedUrl || "missing",
          autoMic: resolvedAutoMic ?? "not set",
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Resolve effective API URL: CLI flag > config > env
  const effectiveApiUrl = useMemo(() => {
    if (apiUrl) return apiUrl;
    if (speechConfig?.apiBaseUrl) return speechConfig.apiBaseUrl;
    try {
      const envUrl = (import.meta as any).env?.VITE_API_URL;
      if (typeof envUrl === "string" && envUrl.trim()) return envUrl.trim();
    } catch {
      // not available
    }
    return null;
  }, [apiUrl, speechConfig?.apiBaseUrl]);

  const enabled = Boolean(speechConfig) && keysLoaded;
  const keysConfigured = Boolean(dgKey && effectiveApiUrl);

  const faceSegment = faceId?.trim() || "face";

  // Resolve config values: CLI/env > bundle metadata > default
  const mode = speechModeOverride ?? speechConfig?.mode ?? "echo";
  const agentName = speechConfig?.agentName ?? DEFAULT_AGENT_NAME;
  const speakingInputPath =
    speechConfig?.speakingInputPath ?? "/speech/speaking";
  const userSpeakingInputPath =
    speechConfig?.userSpeakingInputPath ?? "/speech/user_speaking";
  const thinkingInputPath =
    speechConfig?.thinkingInputPath ?? "/speech/thinking";

  // Resolve emotion group
  const emotionGroupId = speechConfig?.emotionGroupId ?? null;
  const emotionPoses = useMemo(() => {
    if (!emotionGroupId || poseGroups.length === 0) return [];
    return poses.filter((pose) => {
      const membership = resolvePoseMembership(pose, poseGroups);
      return membership.groupIds.includes(emotionGroupId);
    });
  }, [poses, poseGroups, emotionGroupId]);

  const availableEmotions = useMemo(
    () => emotionPoses.map((p) => p.id),
    [emotionPoses],
  );

  // Build system prompt
  const basePrompt = speechConfig?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const resolvedPrompt = useMemo(
    () => basePrompt.replace(/\{\{agent_name\}\}/g, agentName),
    [basePrompt, agentName],
  );
  const resolvedPromptWithEmotion = useMemo(() => {
    if (availableEmotions.length === 0) return resolvedPrompt;
    const list = availableEmotions.join(", ");
    return `${resolvedPrompt}\n\nAlways respond with a JSON object in exactly this format: {"text": "<your response>", "emotion": "<emotion>"}. Choose the emotion that best matches the tone of your response. Available emotions: ${list}.`;
  }, [resolvedPrompt, availableEmotions]);

  // Adapt runtime functions to the expected signatures
  const stageRuntimeInput = useMemo(() => {
    if (!ready) return undefined;
    return (graphPath: string, value: number) => {
      setInput(graphPath, { float: value });
    };
  }, [ready, setInput]);

  const animateRuntimeValue = useMemo(() => {
    if (!ready) return undefined;
    return (graphPath: string, value: number, duration: number) => {
      animateValue(graphPath, { float: value }, { duration });
    };
  }, [ready, animateValue]);

  // Initialize speech playback
  const speech = useSpeechPlayback({
    faceId,
    poses,
    poseGroups,
    stageRuntimeInput,
    animateRuntimeValue,
    runtimeReady: ready && enabled,
    speakingInputPath,
    apiBaseUrl: effectiveApiUrl ?? "",
  });

  // Apply viseme group from config
  useEffect(() => {
    if (speechConfig?.visemeGroupId) {
      speech.setSelectedGroupId(speechConfig.visemeGroupId);
    }
  }, [speechConfig?.visemeGroupId, speech.setSelectedGroupId]);

  // Initialize conversation
  const conversation = useConversation({
    apiKey: mode === "conversation" ? oaiKey : null,
    systemPrompt: resolvedPromptWithEmotion,
  });

  const isConversationThinking =
    mode === "conversation" &&
    (conversation.isProcessing || speech.status === "preparing");

  // Emotion activation
  const activateEmotion = useCallback(
    (emotionName: string | null) => {
      if (!stageRuntimeInput || !ready) return;
      for (const name of availableEmotions) {
        stageRuntimeInput(
          buildRigInputPath(faceSegment, `/speech/emotion/${name}`),
          0,
        );
      }
      if (emotionName && availableEmotions.includes(emotionName)) {
        stageRuntimeInput(
          buildRigInputPath(faceSegment, `/speech/emotion/${emotionName}`),
          1,
        );
      }
    },
    [stageRuntimeInput, ready, faceSegment, availableEmotions],
  );

  // Refs for async callbacks
  const handleSpeakRef = useRef(speech.handleSpeak);
  handleSpeakRef.current = speech.handleSpeak;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const availableEmotionsRef = useRef(availableEmotions);
  availableEmotionsRef.current = availableEmotions;
  const activateEmotionRef = useRef(activateEmotion);
  activateEmotionRef.current = activateEmotion;

  // ASR final transcript handler
  const onFinalTranscript = useCallback((transcript: string) => {
    console.log("[speech] ASR final transcript:", transcript);
    if (modeRef.current === "echo") {
      console.log("[speech] Echo mode → sending to TTS");
      void handleSpeakRef.current(transcript);
    } else {
      console.log("[speech] Conversation mode → sending to LLM");
      void conversationRef.current.sendMessage(transcript).then((response) => {
        if (!response) {
          console.warn("[speech] LLM returned no response");
          return;
        }
        console.log("[speech] LLM response:", response);

        let speakText = response;
        let emotion: string | null = null;

        if (availableEmotionsRef.current.length > 0) {
          const parsed = parseEmotionResponse(response);
          if (parsed) {
            speakText = parsed.text;
            emotion = parsed.emotion;
            console.log("[speech] Parsed emotion:", emotion, "text:", speakText);
          }
        }

        if (emotion) activateEmotionRef.current(emotion);
        console.log("[speech] Sending to TTS:", speakText);
        void handleSpeakRef.current(speakText);
      });
    }
  }, []);

  const asr = useSpeechRecognition({
    apiKey: enabled ? dgKey : null,
    autoStopSilenceMs: mode === "conversation" ? 1500 : 0,
    onFinalTranscript,
  });

  // Log mic state changes
  const prevListeningRef = useRef(asr.listening);
  useEffect(() => {
    if (prevListeningRef.current !== asr.listening) {
      console.log(`[speech] Mic ${asr.listening ? "STARTED" : "STOPPED"}`);
      prevListeningRef.current = asr.listening;
    }
  }, [asr.listening]);

  // Drive /speech/user_speaking input based on mic state
  useEffect(() => {
    if (!stageRuntimeInput || !ready) return;
    stageRuntimeInput(
      buildRigInputPath(faceSegment, userSpeakingInputPath),
      asr.listening ? 1 : 0,
    );
  }, [asr.listening, stageRuntimeInput, ready, faceSegment, userSpeakingInputPath]);

  // Drive /speech/thinking input
  useEffect(() => {
    if (!stageRuntimeInput || !ready) return;
    stageRuntimeInput(
      buildRigInputPath(faceSegment, thinkingInputPath),
      isConversationThinking ? 1 : 0,
    );
  }, [isConversationThinking, stageRuntimeInput, ready, faceSegment, thinkingInputPath]);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (asr.listening) {
      asr.stopListening();
    } else {
      void asr.startListening();
    }
  }, [asr]);

  // Set mic muted state explicitly
  const setMicMuted = useCallback(
    (muted: boolean) => {
      if (muted && asr.listening) {
        asr.stopListening();
      } else if (!muted && !asr.listening) {
        void asr.startListening();
      }
    },
    [asr],
  );

  // Speak arbitrary text via TTS
  const speak = useCallback(
    (text: string) => {
      console.log("[speech] speak() called:", text.slice(0, 60));
      void handleSpeakRef.current(text);
    },
    [],
  );

  // Interrupt/stop any ongoing speech
  const interrupt = useCallback(() => {
    console.log("[speech] interrupt() called");
    speech.handleStop();
  }, [speech]);

  // Auto-activate mic when speech is ready + keys configured + config/CLI says so
  const hasAutoActivated = useRef(false);
  useEffect(() => {
    if (hasAutoActivated.current) return;
    if (!enabled || !keysConfigured || !ready) return;

    // CLI override takes precedence over bundle config
    const shouldAutoActivate =
      autoMicOverride !== undefined
        ? autoMicOverride
        : speechConfig?.autoActivateMic === true;

    if (shouldAutoActivate) {
      hasAutoActivated.current = true;
      console.log("[speech] Auto-activating microphone");
      void asr.startListening();
    }
  }, [enabled, keysConfigured, ready, autoMicOverride, speechConfig?.autoActivateMic, asr]);

  // Log TTS status changes
  const prevSpeechStatusRef = useRef(speech.status);
  useEffect(() => {
    if (prevSpeechStatusRef.current !== speech.status) {
      console.log(`[speech] TTS status: ${prevSpeechStatusRef.current} → ${speech.status}`);
      prevSpeechStatusRef.current = speech.status;
    }
  }, [speech.status]);

  // Log errors
  useEffect(() => {
    if (speech.error) console.error("[speech] Playback error:", speech.error);
  }, [speech.error]);
  useEffect(() => {
    if (asr.error) console.error("[speech] ASR error:", asr.error);
  }, [asr.error]);
  useEffect(() => {
    if (conversation.error) console.error("[speech] LLM error:", conversation.error);
  }, [conversation.error]);

  // Compute overall status
  const status = asr.listening
    ? "listening"
    : isConversationThinking
      ? "thinking"
      : speech.status === "speaking"
        ? "speaking"
        : "idle";

  const error = speech.error || asr.error || conversation.error;

  return {
    enabled,
    listening: asr.listening,
    toggleMic,
    setMicMuted,
    speak,
    interrupt,
    status,
    error,
    keysConfigured,
    audioRef: speech.audioRef,
    handleAudioPlay: speech.handleAudioPlay,
    handleAudioPause: speech.handleAudioPause,
    handleAudioEnded: speech.handleAudioEnded,
  };
}

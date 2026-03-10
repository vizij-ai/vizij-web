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
}

export interface UseSpeechControllerReturn {
  /** Whether speech is enabled (config present + keys available) */
  enabled: boolean;
  /** Whether the mic is currently listening */
  listening: boolean;
  /** Toggle microphone on/off */
  toggleMic: () => void;
  /** Current speech status */
  status: "idle" | "listening" | "thinking" | "speaking";
  /** Any error message */
  error: string | null;
  /** Whether API keys are configured */
  keysConfigured: boolean;
}

export function useSpeechController({
  speechConfig,
  faceId,
  poses,
  poseGroups,
  setInput,
  animateValue,
  ready,
}: UseSpeechControllerOptions): UseSpeechControllerReturn {
  const [dgKey, setDgKey] = useState<string | null>(null);
  const [oaiKey, setOaiKey] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [keysLoaded, setKeysLoaded] = useState(false);

  // Load API keys from Tauri CLI flags, then env/localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const keys = await invoke<Record<string, string>>("get_speech_keys");
        if (!mounted) return;

        // CLI flags take precedence — also persist them to localStorage for the hooks
        if (keys.deepgramKey) {
          setDeepgramApiKey(keys.deepgramKey);
          setDgKey(keys.deepgramKey);
        } else {
          setDgKey(getDeepgramApiKey());
        }

        if (keys.openaiKey) {
          setOpenaiApiKey(keys.openaiKey);
          setOaiKey(keys.openaiKey);
        } else {
          setOaiKey(getOpenaiApiKey());
        }

        if (keys.apiUrl) {
          setApiUrl(keys.apiUrl);
        }
      } catch {
        // Tauri command not available — fall back to env/localStorage
        if (!mounted) return;
        setDgKey(getDeepgramApiKey());
        setOaiKey(getOpenaiApiKey());
      }
      if (mounted) setKeysLoaded(true);
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

  // Resolve config values
  const mode = speechConfig?.mode ?? "echo";
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
    if (modeRef.current === "echo") {
      void handleSpeakRef.current(transcript);
    } else {
      void conversationRef.current.sendMessage(transcript).then((response) => {
        if (!response) return;

        let speakText = response;
        let emotion: string | null = null;

        if (availableEmotionsRef.current.length > 0) {
          const parsed = parseEmotionResponse(response);
          if (parsed) {
            speakText = parsed.text;
            emotion = parsed.emotion;
          }
        }

        if (emotion) activateEmotionRef.current(emotion);
        void handleSpeakRef.current(speakText);
      });
    }
  }, []);

  const asr = useSpeechRecognition({
    apiKey: enabled ? dgKey : null,
    autoStopSilenceMs: mode === "conversation" ? 1500 : 0,
    onFinalTranscript,
  });

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
    status,
    error,
    keysConfigured,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FunctionCall,
  FunctionResponse,
  LiveServerMessage,
} from "@google/genai";
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Modality,
  type ToolListUnion,
} from "@google/genai";
import type { AudioManager } from "../utils/audioManager";
import { LiveStatus, MODEL_NAME } from "../phoneme-core";
import {
  createInitialGeminiSpeechState,
  transitionGeminiSpeechState,
} from "../utils/geminiSpeechState";

const USER_SPEECH_RELEASE_MS = 220;

export type GeminiLiveState = {
  status: LiveStatus;
  error: string | null;
  userTranscript: string;
  agentTranscript: string;
  userSpeaking: boolean;
  thinking: boolean;
  modelSpeaking: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export type GeminiLiveOptions = {
  onModelSpeechStart?: () => void;
  onModelSpeechEnd?: () => void;
  tools?: ToolListUnion;
  enableTools?: boolean;
  handleFunctionCalls?: (
    functionCalls: FunctionCall[],
  ) => Promise<FunctionResponse[]>;
  systemInstruction?: string;
  initialUserTurn?: string;
};

export function useGeminiLive(
  audioManager: AudioManager,
  voiceName: string,
  opts: GeminiLiveOptions = {},
): GeminiLiveState {
  const [status, setStatus] = useState<LiveStatus>(LiveStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");
  const [speechState, setSpeechState] = useState(
    createInitialGeminiSpeechState,
  );

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const turnCompleteRef = useRef(true);
  const statusRef = useRef<LiveStatus>(LiveStatus.DISCONNECTED);
  const overrideToolsRef = useRef<boolean | null>(null);
  const speechStateRef = useRef(speechState);
  const lastMicActiveAtRef = useRef<number | null>(null);
  const {
    onModelSpeechEnd,
    onModelSpeechStart,
    tools,
    enableTools = true,
    handleFunctionCalls,
    systemInstruction,
    initialUserTurn,
  } = opts;

  useEffect(() => {
    speechStateRef.current = speechState;
  }, [speechState]);

  const applySpeechEvent = useCallback(
    (
      event: Parameters<typeof transitionGeminiSpeechState>[1],
      options?: { force?: boolean },
    ) => {
      const next = transitionGeminiSpeechState(speechStateRef.current, event);
      const current = speechStateRef.current;
      const changed =
        options?.force === true ||
        next.userSpeaking !== current.userSpeaking ||
        next.thinking !== current.thinking ||
        next.modelSpeaking !== current.modelSpeaking ||
        next.awaitingModelResponse !== current.awaitingModelResponse ||
        next.hasObservedUserTurn !== current.hasObservedUserTurn;
      if (!changed) {
        return;
      }
      speechStateRef.current = next;
      setSpeechState(next);
    },
    [],
  );

  const disconnect = useCallback(async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current.catch(() => null);
      try {
        session?.close?.();
      } catch (e) {
        console.warn("[gemini] close error", e);
      }
    }
    sessionPromiseRef.current = null;
    await audioManager.close();
    setStatus(LiveStatus.DISCONNECTED);
    statusRef.current = LiveStatus.DISCONNECTED;
    lastMicActiveAtRef.current = null;
    applySpeechEvent({ type: "reset" }, { force: true });
  }, [applySpeechEvent, audioManager]);

  const connect = useCallback(async () => {
    if (status === LiveStatus.CONNECTING || status === LiveStatus.CONNECTED) {
      return;
    }
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as
      | string
      | undefined;
    if (!apiKey) {
      setError("Missing VITE_GEMINI_API_KEY (see README.md)");
      setStatus(LiveStatus.ERROR);
      return;
    }

    setStatus(LiveStatus.CONNECTING);
    statusRef.current = LiveStatus.CONNECTING;
    setError(null);
    setUserTranscript("");
    setAgentTranscript("");
    lastMicActiveAtRef.current = null;
    applySpeechEvent({ type: "reset" }, { force: true });

    const effectiveToolsEnabled =
      (overrideToolsRef.current ?? enableTools) &&
      Array.isArray(tools) &&
      tools.length > 0;
    const allowedFunctionNames =
      tools
        ?.flatMap((t: any) => t.functionDeclarations ?? [])
        .map((fn: any) => fn?.name) ?? [];

    try {
      await audioManager.initializeInput(async (blob) => {
        const base64 = await audioManager.blobToBase64(blob);
        const session = await sessionPromiseRef.current;
        if (!session || statusRef.current !== LiveStatus.CONNECTED) return;
        try {
          session.sendRealtimeInput?.({
            media: {
              mimeType: "audio/pcm;rate=16000",
              data: base64,
            },
          });
        } catch (sendErr) {
          console.warn("[gemini] sendRealtimeInput after close", sendErr);
        }
      });
      await audioManager.initializeOutput();

      const ai = new GoogleGenAI({ apiKey });
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: effectiveToolsEnabled ? tools : undefined,
          toolConfig:
            effectiveToolsEnabled && allowedFunctionNames.length > 0
              ? {
                  functionCallingConfig: {
                    mode: FunctionCallingConfigMode.ANY,
                    allowedFunctionNames,
                  },
                }
              : undefined,
          systemInstruction,
        } as any,
        callbacks: {
          onopen: () => {
            setStatus(LiveStatus.CONNECTED);
            statusRef.current = LiveStatus.CONNECTED;
            const greeting =
              initialUserTurn ??
              "Give the user an over-the-top, playful hello and invite them to start talking.";
            sessionPromiseRef.current
              ?.then((session) =>
                session?.sendClientContent?.({
                  turns: [
                    {
                      role: "user",
                      parts: [{ text: greeting }],
                    },
                  ],
                  turnComplete: true,
                }),
              )
              .catch(() => {});
          },
          onclose: (evt?: CloseEvent) => {
            console.warn(
              "[gemini] websocket closed",
              evt?.code,
              evt?.reason ?? "",
            );
            setStatus(LiveStatus.DISCONNECTED);
            statusRef.current = LiveStatus.DISCONNECTED;
            sessionPromiseRef.current = null;
            lastMicActiveAtRef.current = null;
            applySpeechEvent({ type: "reset" }, { force: true });
            void audioManager.close();
            const causedByTools =
              effectiveToolsEnabled &&
              (evt?.code === 1011 || evt?.code === 1006);
            if (causedByTools && overrideToolsRef.current !== false) {
              overrideToolsRef.current = false;
              setError(
                "Function calling disabled after server error; reconnecting.",
              );
              void connect();
            }
          },
          onerror: (err: unknown) => {
            console.error("[gemini] error", err);
            const message = err instanceof Error ? err.message : String(err);
            setError(message ?? "Gemini live error");
            setStatus(LiveStatus.ERROR);
            statusRef.current = LiveStatus.ERROR;
            lastMicActiveAtRef.current = null;
            applySpeechEvent({ type: "reset" }, { force: true });
          },
          onmessage: async (message: LiveServerMessage) => {
            const toolCalls =
              effectiveToolsEnabled && handleFunctionCalls
                ? (message.toolCall?.functionCalls?.filter(
                    (
                      call,
                    ): call is FunctionCall & { id: string; name: string } =>
                      Boolean(call?.id) && Boolean(call?.name),
                  ) ?? [])
                : [];
            if (toolCalls.length > 0) {
              console.warn(
                "[gemini][tools] incoming calls",
                toolCalls.map((c) => ({
                  id: c.id,
                  name: c.name,
                  args: c.args,
                })),
              );
              const respondToTools = async () => {
                const session = await sessionPromiseRef.current;
                if (!session) return;
                try {
                  const responses =
                    (await handleFunctionCalls?.(toolCalls)) ??
                    toolCalls.map(
                      (call): FunctionResponse => ({
                        id: call.id,
                        name: call.name,
                        response: {
                          error: "No client-side handler provided.",
                        },
                      }),
                    );
                  if (responses && responses.length > 0) {
                    console.warn(
                      "[gemini][tools] sending responses",
                      responses.map((r) => ({
                        id: r.id,
                        name: r.name,
                        hasError: Boolean((r.response as any)?.error),
                      })),
                    );
                    session.sendToolResponse?.({
                      functionResponses: responses,
                    });
                  }
                } catch (err) {
                  console.error("[gemini] tool handling failed", err);
                  const fallback = toolCalls.map(
                    (call): FunctionResponse => ({
                      id: call.id,
                      name: call.name,
                      response: {
                        error:
                          err instanceof Error
                            ? err.message
                            : "Tool handling failed",
                      },
                    }),
                  );
                  const session = await sessionPromiseRef.current;
                  session?.sendToolResponse?.({
                    functionResponses: fallback,
                  });
                }
              };
              void respondToTools();
            }

            const server = message.serverContent;
            const userText = server?.inputTranscription?.text;
            if (userText) {
              setUserTranscript((prev) => `${prev}${userText}`);
              turnCompleteRef.current = true; // user speech implies previous model turn ended
              applySpeechEvent({ type: "user-turn-observed" });
            }

            const modelAudio = server?.modelTurn?.parts?.[0]?.inlineData?.data;
            const modelText = server?.outputTranscription?.text;
            const hasModelContent = Boolean(modelAudio || modelText);

            if (hasModelContent && turnCompleteRef.current) {
              // New model turn
              audioManager.resetChain();
              setAgentTranscript("");
              turnCompleteRef.current = false;
              applySpeechEvent({ type: "model-turn-start" });
              onModelSpeechStart?.();
            }

            if (modelAudio) {
              await audioManager.playAudioChunk(modelAudio);
            }
            if (modelText) {
              setAgentTranscript((prev) => `${prev}${modelText}`);
            }

            if (server?.interrupted) {
              audioManager.interrupt();
              turnCompleteRef.current = true;
              applySpeechEvent({ type: "model-interrupted" });
            }

            if (server?.turnComplete) {
              turnCompleteRef.current = true;
              // small trailing rest so visemes decay smoothly
              audioManager.playSilence(0.16).catch(() => {});
              applySpeechEvent({ type: "model-turn-end" });
              onModelSpeechEnd?.();
            }
          },
        },
      });

      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("[gemini] connect failed", err);
      setError((err as Error)?.message ?? "Failed to connect");
      setStatus(LiveStatus.ERROR);
      lastMicActiveAtRef.current = null;
      applySpeechEvent({ type: "reset" }, { force: true });
      await audioManager.close();
    }
  }, [
    applySpeechEvent,
    audioManager,
    handleFunctionCalls,
    enableTools,
    initialUserTurn,
    onModelSpeechEnd,
    onModelSpeechStart,
    status,
    systemInstruction,
    tools,
    voiceName,
  ]);

  useEffect(() => {
    if (status !== LiveStatus.CONNECTED) {
      lastMicActiveAtRef.current = null;
      applySpeechEvent({ type: "reset" }, { force: true });
      return;
    }

    let animationFrameId = 0;
    const tick = () => {
      const activity = audioManager.getMicActivity();
      const now = performance.now();

      if (activity.active) {
        lastMicActiveAtRef.current = activity.lastActiveAt ?? now;
        applySpeechEvent({ type: "user-speaking-start" });
      } else if (speechStateRef.current.userSpeaking) {
        const lastActiveAt =
          lastMicActiveAtRef.current ?? activity.lastActiveAt;
        if (
          lastActiveAt !== null &&
          now - lastActiveAt >= USER_SPEECH_RELEASE_MS
        ) {
          applySpeechEvent({ type: "user-speaking-stop" });
        }
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [applySpeechEvent, audioManager, status]);

  useEffect(() => {
    // Reset any automatic fallback when the user toggles tools.
    overrideToolsRef.current = null;
  }, [enableTools]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    userTranscript,
    agentTranscript,
    userSpeaking: speechState.userSpeaking,
    thinking: speechState.thinking,
    modelSpeaking: speechState.modelSpeaking,
    connect,
    disconnect,
  };
}

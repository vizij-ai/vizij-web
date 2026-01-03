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

export type GeminiLiveState = {
  status: LiveStatus;
  error: string | null;
  userTranscript: string;
  agentTranscript: string;
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

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const turnCompleteRef = useRef(true);
  const statusRef = useRef<LiveStatus>(LiveStatus.DISCONNECTED);
  const overrideToolsRef = useRef<boolean | null>(null);
  const {
    onModelSpeechEnd,
    onModelSpeechStart,
    tools,
    enableTools = true,
    handleFunctionCalls,
    systemInstruction,
    initialUserTurn,
  } = opts;

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
  }, [audioManager]);

  const connect = useCallback(async () => {
    if (status === LiveStatus.CONNECTING || status === LiveStatus.CONNECTED) {
      return;
    }
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as
      | string
      | undefined;
    if (!apiKey) {
      setError("Missing VITE_GEMINI_API_KEY (see README)");
      setStatus(LiveStatus.ERROR);
      return;
    }

    setStatus(LiveStatus.CONNECTING);
    statusRef.current = LiveStatus.CONNECTING;
    setError(null);
    setUserTranscript("");
    setAgentTranscript("");

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
            }

            const modelAudio = server?.modelTurn?.parts?.[0]?.inlineData?.data;
            const modelText = server?.outputTranscription?.text;
            const hasModelContent = Boolean(modelAudio || modelText);

            if (hasModelContent && turnCompleteRef.current) {
              // New model turn
              audioManager.resetChain();
              setAgentTranscript("");
              turnCompleteRef.current = false;
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
            }

            if (server?.turnComplete) {
              turnCompleteRef.current = true;
              // small trailing rest so visemes decay smoothly
              audioManager.playSilence(0.16).catch(() => {});
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
      await audioManager.close();
    }
  }, [
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
    connect,
    disconnect,
  };
}

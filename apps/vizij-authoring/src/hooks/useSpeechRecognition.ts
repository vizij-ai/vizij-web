import { useCallback, useEffect, useRef, useState } from "react";
import { DeepgramClient } from "@deepgram/sdk";

export interface UseSpeechRecognitionOptions {
  apiKey: string | null;
  language?: string;
  /** Auto-stop after this many ms of silence (server-side VAD). 0 = disabled. */
  autoStopSilenceMs?: number;
  onFinalTranscript?: (transcript: string) => void;
}

export interface UseSpeechRecognitionReturn {
  listening: boolean;
  interimTranscript: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  supported: boolean;
}

export function useSpeechRecognition({
  apiKey,
  language = "en",
  autoStopSilenceMs = 0,
  onFinalTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<ReturnType<
    Awaited<ReturnType<InstanceType<typeof DeepgramClient>["listen"]["v1"]["connect"]>>["connect"]
  > | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const finalAccRef = useRef("");
  const displayedRef = useRef("");
  const onFinalRef = useRef(onFinalTranscript);
  const stoppingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const supported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const cleanup = useCallback(() => {
    if (recorderRef.current) {
      if (recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }
    stoppingRef.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const finishStop = useCallback(() => {
    if (!stoppingRef.current) return;

    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    const transcript = displayedRef.current.trim();
    if (transcript && onFinalRef.current) {
      onFinalRef.current(transcript);
    }

    finalAccRef.current = "";
    displayedRef.current = "";
    setInterimTranscript("");
    setListening(false);

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }
    stoppingRef.current = false;
  }, []);

  // Internal stop logic (ref-safe, callable from message handler)
  const doStop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    // Stop recorder & mic so no more audio is sent
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Send Finalize to flush remaining audio — Deepgram will respond with
    // one last is_final message, then we close in the message handler.
    if (socketRef.current) {
      try {
        socketRef.current.sendFinalize({ type: "Finalize" });
      } catch {
        finishStop();
        return;
      }
      // Safety timeout: if Deepgram doesn't respond within 3s, deliver what we have
      stopTimerRef.current = setTimeout(() => {
        if (stoppingRef.current) finishStop();
      }, 3000);
    } else {
      finishStop();
    }
  }, [finishStop]);

  const doStopRef = useRef(doStop);
  doStopRef.current = doStop;

  const stopListening = useCallback(() => {
    if (!listening) return;
    doStop();
  }, [listening, doStop]);

  const startListening = useCallback(async () => {
    if (listening || !apiKey) {
      return;
    }
    setError(null);
    setInterimTranscript("");
    finalAccRef.current = "";
    displayedRef.current = "";

    // 1. Acquire mic
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied.");
      return;
    }
    streamRef.current = stream;
    console.log("[ASR] Mic acquired");

    // 2. Connect via Deepgram SDK
    const client = new DeepgramClient({ apiKey });
    let socket: Awaited<ReturnType<typeof client.listen.v1.connect>>;
    try {
      console.log("[ASR] Creating Deepgram socket...", {
        language,
        keyLength: apiKey.length,
        keyPrefix: apiKey.slice(0, 8) + "...",
      });
      socket = await client.listen.v1.connect({
        model: "nova-3",
        language,
        punctuate: "true",
        interim_results: "true",
        smart_format: "true",
        ...(autoStopSilenceMs > 0 && {
          utterance_end_ms: String(autoStopSilenceMs),
          vad_events: "true",
        }),
        Authorization: `Token ${apiKey}`,
      });
      console.log("[ASR] Socket created successfully");
    } catch (err) {
      console.error("[ASR] connect() threw:", err);
      setError(
        `ASR connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    let connectedSocket: ReturnType<typeof socket.connect>;
    try {
      connectedSocket = socket.connect();
      socketRef.current = connectedSocket;
      console.log("[ASR] socket.connect() called, readyState:", connectedSocket.readyState);
    } catch (err) {
      console.error("[ASR] socket.connect() threw:", err);
      setError(
        `ASR socket error: ${err instanceof Error ? err.message : String(err)}`,
      );
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    connectedSocket.on("open", () => {
      console.log("[ASR] WebSocket open — starting MediaRecorder");
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && connectedSocket.readyState === WebSocket.OPEN) {
          connectedSocket.sendMedia(e.data);
        }
      };

      recorder.start(250);
      setListening(true);
    });

    connectedSocket.on("message", (data) => {
      // Auto-stop on utterance end (silence detected by Deepgram VAD)
      const msgType = (data as { type?: string }).type;
      if (msgType === "UtteranceEnd" && !stoppingRef.current) {
        console.log("[ASR] UtteranceEnd — auto-stopping");
        doStopRef.current();
        return;
      }

      const transcript: string =
        (data as { channel?: { alternatives?: { transcript?: string }[] } })
          .channel?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) {
        return;
      }

      const isFinal = (data as { is_final?: boolean }).is_final;
      if (isFinal) {
        finalAccRef.current =
          finalAccRef.current.length > 0
            ? `${finalAccRef.current} ${transcript}`
            : transcript;
        displayedRef.current = finalAccRef.current;
        setInterimTranscript(finalAccRef.current);

        // After sendFinalize, Deepgram may send multiple is_final messages.
        // Debounce: reset timer on each one, deliver once they stop arriving.
        if (stoppingRef.current) {
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
          stopTimerRef.current = setTimeout(() => {
            if (stoppingRef.current) finishStop();
          }, 500);
        }
      } else {
        const combined =
          finalAccRef.current.length > 0
            ? `${finalAccRef.current} ${transcript}`
            : transcript;
        displayedRef.current = combined;
        setInterimTranscript(combined);
      }
    });

    connectedSocket.on("error", (err) => {
      console.error("[ASR] WebSocket error:", err);
      if (!stoppingRef.current) {
        setError(`ASR error: ${err.message || "Connection error"}`);
        cleanup();
        setListening(false);
      }
    });

    connectedSocket.on("close", (event) => {
      const code = (event as { code?: number }).code;
      const reason = (event as { reason?: string }).reason;
      console.warn("[ASR] WebSocket closed:", { code, reason });
      if (stoppingRef.current) {
        // Deepgram finished processing — deliver the full transcript
        finishStop();
      } else {
        const detail = reason || (code ? `code ${code}` : "unexpected close");
        setError(`ASR closed: ${detail}`);
        cleanup();
        setListening(false);
      }
    });
  }, [apiKey, autoStopSilenceMs, cleanup, finishStop, language, listening]);

  return {
    listening,
    interimTranscript,
    error,
    startListening,
    stopListening,
    supported,
  };
}

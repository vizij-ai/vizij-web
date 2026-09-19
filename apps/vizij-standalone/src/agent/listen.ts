/**
 * The ear: the microphone streamed to Deepgram, final transcripts handed
 * over as the user's turns. Deepgram's voice activity events say when the
 * user speaks — the signal a speaking face is interrupted on.
 */
import { DeepgramClient } from "@deepgram/sdk";

export interface ListenerEvents {
  /** The user started speaking (Deepgram's VAD). */
  onUserSpeaking?: (speaking: boolean) => void;
  /** Words so far, final and interim. */
  onTranscript?: (text: string, final: boolean) => void;
  /** The user's turn, once Deepgram marks the utterance's end. */
  onTurn?: (text: string) => void;
  onError?: (message: string) => void;
  onListening?: (listening: boolean) => void;
}

type Socket = ReturnType<
  Awaited<
    ReturnType<InstanceType<typeof DeepgramClient>["listen"]["v1"]["connect"]>
  >["connect"]
>;

export class Listener {
  private socket: Socket | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private finals = "";
  listening = false;

  private readonly apiKey: string;
  private readonly events: ListenerEvents;
  private readonly language: string;
  /** Deepgram ends an utterance after this much silence. */
  private readonly utteranceEndMs: number;

  constructor(
    apiKey: string,
    events: ListenerEvents,
    language = "en",
    utteranceEndMs = 1200,
  ) {
    this.apiKey = apiKey;
    this.events = events;
    this.language = language;
    this.utteranceEndMs = utteranceEndMs;
  }

  static get supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  async start(): Promise<void> {
    if (this.listening) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.events.onError?.("Microphone access denied.");
      return;
    }
    this.stream = stream;
    const client = new DeepgramClient({ apiKey: this.apiKey });
    let socket: Socket;
    try {
      const connection = await client.listen.v1.connect({
        model: "nova-3",
        language: this.language,
        punctuate: "true",
        interim_results: "true",
        smart_format: "true",
        vad_events: "true",
        utterance_end_ms: String(this.utteranceEndMs),
        Authorization: `Token ${this.apiKey}`,
      });
      socket = connection.connect();
    } catch (err) {
      this.events.onError?.(
        `Speech recognition failed to connect: ${String(err)}`,
      );
      this.release();
      return;
    }
    this.socket = socket;
    this.finals = "";

    socket.on("open", () => {
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      this.recorder = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket.readyState === WebSocket.OPEN)
          socket.sendMedia(e.data);
      };
      recorder.start(250);
      this.listening = true;
      this.events.onListening?.(true);
    });
    socket.on("message", (data) => {
      const message = data as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: { transcript?: string }[] };
      };
      if (message.type === "SpeechStarted") {
        this.events.onUserSpeaking?.(true);
        return;
      }
      if (message.type === "UtteranceEnd") {
        this.events.onUserSpeaking?.(false);
        const turn = this.finals.trim();
        this.finals = "";
        if (turn) this.events.onTurn?.(turn);
        return;
      }
      const transcript = message.channel?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) return;
      if (message.is_final) {
        this.finals = this.finals ? `${this.finals} ${transcript}` : transcript;
        this.events.onTranscript?.(this.finals, true);
      } else {
        this.events.onTranscript?.(
          this.finals ? `${this.finals} ${transcript}` : transcript,
          false,
        );
      }
    });
    socket.on("error", (err) => {
      this.events.onError?.(
        `Speech recognition: ${(err as Error).message || "connection error"}`,
      );
      this.stop();
    });
    socket.on("close", () => {
      if (this.listening) this.stop();
    });
  }

  stop(): void {
    const turn = this.finals.trim();
    this.finals = "";
    this.release();
    if (this.listening) {
      this.listening = false;
      this.events.onListening?.(false);
      this.events.onUserSpeaking?.(false);
    }
    if (turn) this.events.onTurn?.(turn);
  }

  private release(): void {
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }
}

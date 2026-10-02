/**
 * The conversation: what the ear hears goes to the mind, what the mind
 * answers the face says — with the expression the mind chose — and the user
 * speaking over the face interrupts it (the `say` run is halted; the audio
 * cuts within 250 ms).
 */
import type { TaskHandle } from "@vizij/runtime";
import type { FaceHandle } from "../face";
import { Listener } from "./listen";
import type { Thinker } from "./think";
import { type Reply } from "./think";

export type State = "idle" | "listening" | "thinking" | "speaking";

export interface ConversationEvents {
  onState?: (state: State) => void;
  onTranscript?: (text: string, final: boolean) => void;
  onReply?: (reply: Reply) => void;
  onError?: (message: string) => void;
}

export class Conversation {
  private listener: Listener | null = null;
  private speaking: TaskHandle | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  state: State = "idle";

  private readonly face: FaceHandle;
  private readonly thinker: Thinker | null;
  private readonly events: ConversationEvents;

  constructor(
    face: FaceHandle,
    thinker: Thinker | null,
    events: ConversationEvents,
    deepgramKey: string | null,
  ) {
    this.face = face;
    this.thinker = thinker;
    this.events = events;
    if (deepgramKey && Listener.supported) {
      this.listener = new Listener(deepgramKey, {
        onUserSpeaking: (speaking) => {
          // Barge-in: the user talking over the face halts it.
          if (speaking && this.speaking) void this.interrupt();
        },
        onTranscript: (text, final) => this.events.onTranscript?.(text, final),
        onTurn: (text) => void this.turn(text),
        onError: (message) => this.events.onError?.(message),
        onListening: (listening) =>
          this.setState(listening ? "listening" : "idle"),
      });
    }
  }

  get canListen(): boolean {
    return this.listener !== null;
  }

  get listening(): boolean {
    return this.listener?.listening ?? false;
  }

  async listen(): Promise<void> {
    await this.listener?.start();
  }

  mute(): void {
    this.listener?.stop();
  }

  /** A turn of the user's, typed or heard: the mind answers, the face says. */
  async turn(text: string): Promise<void> {
    if (!this.thinker) {
      await this.say({ text, expression: "neutral" });
      return;
    }
    this.setState("thinking");
    try {
      const reply = await this.thinker.reply(text);
      if (!reply) return;
      this.events.onReply?.(reply);
      await this.say(reply);
    } catch (err) {
      this.events.onError?.(err instanceof Error ? err.message : String(err));
      this.setState(this.listening ? "listening" : "idle");
    }
  }

  /** The face says `reply`, with its expression; a previous utterance is
   * halted first. */
  async say(reply: Reply): Promise<void> {
    await this.interrupt();
    this.face.express(reply.expression);
    const run = await this.face.say(reply.text);
    this.speaking = run;
    this.setState("speaking");
    this.watch = setInterval(() => {
      if (this.speaking === run && this.face.ended(run)) {
        this.speaking = null;
        if (this.watch) clearInterval(this.watch);
        this.watch = null;
        this.setState(this.listening ? "listening" : "idle");
      }
    }, 50);
  }

  /** Stop the face mid-sentence. */
  async interrupt(): Promise<void> {
    const run = this.speaking;
    if (!run) return;
    this.speaking = null;
    if (this.watch) clearInterval(this.watch);
    this.watch = null;
    await this.face.halt(run);
    this.setState(this.listening ? "listening" : "idle");
  }

  dispose(): void {
    this.listener?.stop();
    void this.interrupt();
  }

  private setState(state: State): void {
    if (this.state === state) return;
    this.state = state;
    this.events.onState?.(state);
  }
}

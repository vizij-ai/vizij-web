/**
 * The conversation: what the ear hears goes to the mind, what the mind
 * answers the face says — with the expression the mind chose — and the user
 * speaking over the face interrupts it (the `say` run is halted; the audio
 * cuts within 250 ms).
 *
 * The conversation is what runs the dialogue, so it writes the face
 * standard's conversation state, each 1 while it holds and 0 at rest:
 * - `speaking`: from the moment the `say` run is spawned until its status
 *   reads terminal or the conversation stops it;
 * - `user_speaking`: as the ear's voice activity says — from Deepgram's
 *   `SpeechStarted` to its `UtteranceEnd`, or the ear closing;
 * - `thinking`: while a call to the mind is pending.
 *
 * Disposing of the conversation returns all three to 0.
 */
import type { RunHandle } from "@vizij/runtime";
import type { ConversationState, FaceHandle } from "../face";
import type { Ear, HearWith } from "./listen";
import type { Reply, Thinker } from "./think";

export type State = "idle" | "listening" | "thinking" | "speaking";

export interface ConversationEvents {
  onState?: (state: State) => void;
  onTranscript?: (text: string, final: boolean) => void;
  onReply?: (reply: Reply) => void;
  onError?: (message: string) => void;
}

export class Conversation {
  private listener: Ear | null = null;
  private speaking: RunHandle | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  /** The calls to the mind still pending. */
  private thinking = 0;
  /** The conversation state as last written. */
  private readonly held: Record<ConversationState, boolean> = {
    speaking: false,
    user_speaking: false,
    thinking: false,
  };
  private disposed = false;
  state: State = "idle";

  private readonly face: FaceHandle;
  private readonly thinker: Pick<Thinker, "reply"> | null;
  private readonly events: ConversationEvents;

  /** `hear` builds the ear over the conversation's handlers; `null` for a
   * conversation that only takes typed turns. */
  constructor(
    face: FaceHandle,
    thinker: Pick<Thinker, "reply"> | null,
    events: ConversationEvents,
    hear: HearWith | null,
  ) {
    this.face = face;
    this.thinker = thinker;
    this.events = events;
    if (hear) {
      this.listener = hear({
        onUserSpeaking: (speaking) => {
          this.hold("user_speaking", speaking);
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
      const reply = await this.think(this.thinker, text);
      if (this.disposed) return;
      if (!reply) {
        // Superseded by a newer turn, which goes on thinking.
        if (this.thinking === 0 && this.state === "thinking") this.settle();
        return;
      }
      this.events.onReply?.(reply);
      await this.say(reply);
    } catch (err) {
      this.events.onError?.(err instanceof Error ? err.message : String(err));
      this.settle();
    }
  }

  /** The mind's reply to `text`, `thinking` held while any call is
   * pending. */
  private async think(
    thinker: Pick<Thinker, "reply">,
    text: string,
  ): Promise<Reply | null> {
    this.thinking += 1;
    this.hold("thinking", true);
    try {
      return await thinker.reply(text);
    } finally {
      this.thinking -= 1;
      if (this.thinking === 0) this.hold("thinking", false);
    }
  }

  /** The face says `reply`, with its expression; a previous utterance is
   * halted first. */
  async say(reply: Reply): Promise<void> {
    await this.interrupt();
    await this.face.express(reply.expression);
    const run = await this.face.say(reply.text);
    this.speaking = run;
    this.hold("speaking", true);
    this.setState("speaking");
    this.watch = setInterval(() => {
      if (this.speaking === run && this.face.ended(run)) {
        this.speaking = null;
        if (this.watch) clearInterval(this.watch);
        this.watch = null;
        this.hold("speaking", false);
        this.settle();
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
    this.hold("speaking", false);
    await this.face.halt(run);
    this.settle();
  }

  /** Close the ear, stop the face, and return the conversation state to
   * rest. Nothing is written after. */
  dispose(): void {
    this.listener?.stop();
    void this.interrupt();
    for (const state of Object.keys(this.held) as ConversationState[]) {
      this.held[state] = false;
      this.face.converse(state, false);
    }
    this.disposed = true;
  }

  /** Write conversation state `state` when it changes. */
  private hold(state: ConversationState, holds: boolean): void {
    if (this.disposed || this.held[state] === holds) return;
    this.held[state] = holds;
    this.face.converse(state, holds);
  }

  /** Back to listening, or idle. */
  private settle(): void {
    this.setState(this.listening ? "listening" : "idle");
  }

  private setState(state: State): void {
    if (this.state === state) return;
    this.state = state;
    this.events.onState?.(state);
  }
}

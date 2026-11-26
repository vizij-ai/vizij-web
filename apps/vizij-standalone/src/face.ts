/**
 * The face: one page, one canvas, one face on it, run by the Bevy view and
 * its own Arora — the `Runtime` of `@vizij/runtime`. What the agent does to it goes
 * through the Vizij face standard — its expression weights, its conversation
 * state and the `say` skill — never through the face's own rig paths.
 */
import {
  init,
  mount,
  runStatus,
  unlockAudio,
  type RunHandle,
  type Runtime,
  type VizijHandle,
} from "@vizij/runtime";

/** The one slot this page shows. */
export const FACE = "face";

/** The face standard's weight of expression `name`, relative to the face's
 * rig prefix: an `f32` in `[0, 1]`, which the face's adaptation maps onto its
 * own poses. */
const expressionKey = (name: string) => `standard/vizij/expression/${name}`;

/** The face standard's conversation state: what the dialogue the face takes
 * part in is doing — the face speaking, the person it talks with speaking,
 * the agent preparing its reply. */
export type ConversationState = "speaking" | "user_speaking" | "thinking";

/** The weight of conversation state `state`, relative to the face's rig
 * prefix: an `f32`, 1 while the state holds and 0 at rest. */
const conversationKey = (state: ConversationState) =>
  `standard/vizij/conversation/${state}`;

export interface FaceHandle {
  runtime: Runtime;
  /** Speak `text`: a `say` run on the runtime; resolves with its handle once
   * started. */
  say(text: string): Promise<RunHandle>;
  /** Stop the run `say` returned; the audio cuts within 250 ms. */
  halt(run: RunHandle): Promise<void>;
  /** The run's status key reads terminal. */
  ended(run: RunHandle): boolean;
  /** Show expression `name` — one of the face standard's — at full weight,
   * in place of the one shown before. */
  express(name: string): void;
  /** Keep the face over `slot` on the page. */
  place(slot: Element): void;
  /** Write conversation state `state`: 1 while it holds, 0 when it does
   * not. */
  converse(state: ConversationState, holds: boolean): void;
  unload(): void;
}

let mounted: VizijHandle | null = null;
let mounting: Promise<void> | null = null;
/** Who waits for the face in an instance to be drawn. */
const waiting = new Map<string, Array<() => void>>();
/** How many faces `showFace` has asked for, so one replaced while it waited
 * can tell that a later one followed it. */
let shows = 0;

/** A face replaced by a later `showFace` before it was shown: not a failure,
 * since the later face is the one the page asked for. */
export class FaceReplaced extends Error {
  constructor() {
    super("replaced by a later face before it was shown");
  }
}

/** Mount the page's canvas once; later calls (React's strict-mode second
 * effect among them) join the first. */
export function mountCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (!mounting) {
    mounting = (async () => {
      await init();
      const app = await mount(canvas);
      app.onEvent((event) => {
        if (event.type !== "ready" && event.type !== "loadFailed") return;
        // The handle's readiness, not the event's: a `ready` for a face
        // being replaced is withheld until the replacement settles, and a
        // failed load puts the replaced face's readiness back with no
        // `ready` of its own.
        if (!app.ready.has(event.instance)) return;
        for (const wake of waiting.get(event.instance) ?? []) wake();
        waiting.delete(event.instance);
      });
      mounted = app;
    })();
  }
  return mounting;
}

/** Resolves once the face in `instance` has drawn since its last load: its
 * device's time starts from that frame. */
function whenDrawn(instance: string): Promise<void> {
  if (mounted?.ready.has(instance)) return Promise.resolve();
  return new Promise((resolve) => {
    waiting.set(instance, [...(waiting.get(instance) ?? []), resolve]);
  });
}

/** Show `glb` in the page's slot and start its runtime, self-paced. */
export async function showFace(
  glb: Uint8Array,
  slot: Element,
  options: { speechApiUrl?: string | null } = {},
): Promise<FaceHandle> {
  if (!mounted) throw new Error("mount the canvas first");
  const app = mounted;
  const mine = ++shows;
  app.placeIn(FACE, slot);
  let runtime: Runtime;
  try {
    runtime = await app.load(FACE, glb, {
      speechApiUrl: options.speechApiUrl ?? undefined,
    });
  } catch (error) {
    throw mine === shows ? error : new FaceReplaced();
  }
  await whenDrawn(FACE);
  // A later face drawn wakes this wait too. This face's device is the
  // page's, its load having resolved, and nothing else will free it.
  if (mine !== shows) {
    runtime.dispose();
    throw new FaceReplaced();
  }
  void runtime.run();
  let shown: string | null = null;
  return {
    runtime,
    // `say` is a task method: invoking it starts a run and resolves to its
    // handle.
    say: async (text) =>
      (await runtime.invoke("say", { text, voice: "Ruth" })) as RunHandle,
    halt: (run) => runtime.halt(run.run),
    ended: (run) => {
      const status = runStatus(runtime.readValues([run.status])[run.status]);
      return status !== undefined && status !== "running";
    },
    // One store change: the previous expression's weight back to 0 and the
    // new one's to 1, each an `f32` as the profile declares them.
    express: (name) => {
      const values: Record<string, { f32: number }> = {};
      if (shown !== null && shown !== name) {
        values[runtime.path(expressionKey(shown))] = { f32: 0 };
      }
      values[runtime.path(expressionKey(name))] = { f32: 1 };
      runtime.writeValues(values);
      shown = name;
    },
    place: (element) => app.placeIn(FACE, element),
    converse: (state, holds) =>
      runtime.writeValues({
        [runtime.path(conversationKey(state))]: { f32: holds ? 1 : 0 },
      }),
    unload: () => {
      runtime.stop();
      app.unload(FACE);
      runtime.dispose();
    },
  };
}

export { unlockAudio };

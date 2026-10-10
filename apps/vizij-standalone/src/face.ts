/**
 * The face: one page, one canvas, one face on it, run by the Bevy view and
 * its own Arora — the `Runtime` of `@vizij/runtime`. What the agent does to it goes
 * through the face standard — the ROS4HRI expression keys and the `say`
 * skill — never through the face's own rig paths.
 */
import {
  init,
  loadVizij,
  mount,
  placeVizijIn,
  runStatus,
  unloadVizij,
  unlockAudio,
  whenReady,
  type RunHandle,
  type Runtime,
} from "@vizij/runtime";

/** The one slot this page shows. */
export const FACE = "face";

/** The ROS4HRI command keys the face's mapping reads: the named expression
 * shows at the commanded arousal as its intensity, so a name goes with an
 * arousal of 1 to show at full weight. Each write is of the key's declared
 * type (`str`, `f32`), which the device requires of a client. */
const EXPRESSION_NAME = "standard/ros4hri/expression/name";
const EXPRESSION_AROUSAL = "standard/ros4hri/expression/arousal";

export interface FaceHandle {
  runtime: Runtime;
  /** Speak `text`: a `say` run on the runtime; resolves with its handle once
   * started. */
  say(text: string): Promise<RunHandle>;
  /** Stop the run `say` returned; the audio cuts within 250 ms. */
  halt(run: RunHandle): Promise<void>;
  /** The run's status key reads terminal. */
  ended(run: RunHandle): boolean;
  /** The face's expression, by its ROS4HRI name. */
  express(name: string): void;
  /** Keep the face over `slot` on the page. */
  place(slot: Element): void;
  unload(): void;
}

let mounted: HTMLCanvasElement | null = null;
let mounting: Promise<void> | null = null;

/** Mount the page's canvas once; later calls (React's strict-mode second
 * effect among them) join the first. */
export function mountCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (!mounting) {
    mounting = (async () => {
      await init();
      await mount(canvas);
      mounted = canvas;
    })();
  }
  return mounting;
}

/** Show `glb` in the page's slot and start its runtime, self-paced. */
export async function showFace(
  glb: Uint8Array,
  slot: Element,
  options: { speechApiUrl?: string | null } = {},
): Promise<FaceHandle> {
  if (!mounted) throw new Error("mount the canvas first");
  const canvas = mounted;
  const runtime = await loadVizij(FACE, glb, {
    speechApiUrl: options.speechApiUrl ?? undefined,
  });
  placeVizijIn(FACE, slot, canvas);
  await whenReady(FACE);
  void runtime.run();
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
    express: (name) =>
      runtime.writeValues({
        [EXPRESSION_NAME]: { str: name },
        [EXPRESSION_AROUSAL]: { f32: 1 },
      }),
    place: (element) => placeVizijIn(FACE, element, canvas),
    unload: () => {
      runtime.stop();
      unloadVizij(FACE);
      runtime.dispose();
    },
  };
}

export { unlockAudio };

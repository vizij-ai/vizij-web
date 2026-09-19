/**
 * The face: one page, one canvas, one face on it, run by the Bevy view and
 * the Arora device of `@vizij/runtime`. What the agent does to it goes
 * through the face standard — the ROS4HRI expression keys and the `say`
 * skill — never through the face's own rig paths.
 */
import {
  init,
  loadFace,
  mount,
  placeFaceIn,
  runStatus,
  unloadFace,
  unlockAudio,
  whenReady,
  type Device,
  type TaskHandle,
} from "@vizij/runtime";

/** The one slot this page shows. */
export const FACE = "face";

/** The ROS4HRI command keys the face's mapping reads (device-scoped). */
const EXPRESSION_NAME = "standard/ros4hri/expression/name";

export interface FaceHandle {
  device: Device;
  /** Speak `text`: a `say` run on the device; resolves with its handle once
   * spawned. */
  say(text: string): Promise<TaskHandle>;
  /** Stop the run `say` returned; the audio cuts within 250 ms. */
  halt(run: TaskHandle): Promise<void>;
  /** The run's status key reads terminal. */
  ended(run: TaskHandle): boolean;
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

/** Show `glb` in the page's slot and start its device, self-paced. */
export async function showFace(
  glb: Uint8Array,
  slot: Element,
  options: { speechApiUrl?: string | null } = {},
): Promise<FaceHandle> {
  if (!mounted) throw new Error("mount the canvas first");
  const canvas = mounted;
  const device = await loadFace(FACE, glb, {
    speechApiUrl: options.speechApiUrl ?? undefined,
  });
  placeFaceIn(FACE, slot, canvas);
  await whenReady(FACE);
  void device.run();
  return {
    device,
    say: (text) => device.spawnSkill("say", { text, voice: "Ruth" }),
    halt: (run) => device.halt(run),
    ended: (run) => {
      const status = runStatus(device.readValues([run.status])[run.status]);
      return status !== undefined && status !== "running";
    },
    express: (name) => device.setValue(EXPRESSION_NAME, { text: name }),
    place: (element) => placeFaceIn(FACE, element, canvas),
    unload: () => {
      device.stop();
      unloadFace(FACE);
      device.dispose();
    },
  };
}

export { unlockAudio };

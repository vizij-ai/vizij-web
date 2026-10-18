import { createContext } from "react";
import type { Runtime, ValueJSON, VizijDescription } from "@vizij/runtime";

/** A batch of store changes, as `Runtime.drainChanges` returns it: each
 * changed key to its new value, `null` for a cleared key. */
export type VizijChanges = Record<string, ValueJSON | null>;

export type VizijRuntimeStatus = "loading" | "ready" | "error";

/** One face, as `VizijRuntimeProvider` hands it to its children. */
export interface VizijRuntimeContextValue {
  /** The id the face is loaded and shown under. */
  vizijId: string;
  /** `loading` until the face is drawn — its scene showing its device's
   * pose — however long its GPU takes, and again while a new `glb` loads;
   * `error` when loading failed. */
  status: VizijRuntimeStatus;
  error: Error | null;
  /** The device's standing behavior error (`Runtime.behaviorError`): the
   * message of its latest failed tick, `undefined` while healthy. */
  behaviorError: string | undefined;
  /** `@vizij/runtime`'s `Runtime` of the face, as it is: every device
   * operation is called on it. `null` until the first load completes. */
  runtime: Runtime | null;
  /** `describe(glb)`: what the face's GLB declares — poses, rig inputs,
   * programs, animations, metadata, bounds. `null` until read. */
  description: VizijDescription | null;
}

export const VizijRuntimeContext =
  createContext<VizijRuntimeContextValue | null>(null);

/** The provider's change fan-out: `subscribe` registers a listener for each
 * drained batch and returns its unsubscription. */
export interface VizijChangeSource {
  subscribe(listener: (changes: VizijChanges) => void): () => void;
}

export const VizijChangeContext = createContext<VizijChangeSource | null>(null);

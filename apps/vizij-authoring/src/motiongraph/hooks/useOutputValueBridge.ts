/**
 * Singleton pub/sub bridge for shuttling output values from inside
 * VizijRuntimeProvider (where the arora device lives) to the inspector
 * chart (which lives outside it).
 */

export type PathSnapshot = Map<string, number | null>;

type Listener = () => void;

class OutputValueBridge {
  /** Latest sampled values keyed by output path. */
  readonly current: PathSnapshot = new Map();

  private listeners = new Set<Listener>();

  /** Called by the sampler each frame with fresh values. */
  update(values: PathSnapshot): void {
    this.current.clear();
    for (const [k, v] of values) {
      this.current.set(k, v);
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Subscribe to updates (returns unsubscribe). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const outputValueBridge = new OutputValueBridge();

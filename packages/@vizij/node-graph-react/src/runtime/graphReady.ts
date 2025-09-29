/**
 * GraphReadyController
 *
 * Small utility to manage a single readiness Promise with optional timeout
 * and a simple event listener surface for "graphLoaded" and "graphLoadError".
 *
 * Usage:
 *   const ctrl = new GraphReadyController(60000); // 60s timeout (null to disable)
 *   // runtime wiring:
 *   runtime.waitForGraphReady = () => ctrl.wait();
 *   runtime.on = ctrl.on.bind(ctrl);
 *   runtime.off = ctrl.off.bind(ctrl);
 *
 *   // GraphProvider will call ctrl.resolve() or ctrl.reject(err).
 *
 * Notes:
 * - wait() returns a Promise that resolves when resolve() is called,
 *   or rejects when reject() is called (or on timeout).
 * - Calling resolve() after a rejection (or vice-versa) is a no-op once
 *   the controller has settled.
 * - on/off accepts events 'graphLoaded' | 'graphLoadError'.
 */

export type GraphReadyEvent = "graphLoaded" | "graphLoadError";
type Listener = (info?: any) => void;

export class GraphReadyController {
  private timeoutMs: number | null;
  private settled: boolean = false;
  private resolved: boolean = false;
  private rejected: boolean = false;
  private resolveFn?: () => void;
  private rejectFn?: (err?: any) => void;
  private promise: Promise<void>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<GraphReadyEvent, Set<Listener>> = new Map();

  constructor(timeoutMs: number | null = 60000) {
    this.timeoutMs = timeoutMs;
    this.promise = new Promise<void>((resolve, reject) => {
      this.resolveFn = () => {
        if (this.settled) return;
        this.settled = true;
        this.resolved = true;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        resolve();
        this.emit("graphLoaded");
      };
      this.rejectFn = (err?: any) => {
        if (this.settled) return;
        this.settled = true;
        this.rejected = true;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        reject(err);
        this.emit("graphLoadError", err);
      };

      // Set up timeout if applicable
      if (this.timeoutMs !== null && typeof this.timeoutMs === "number") {
        this.timer = setTimeout(() => {
          if (this.settled) return;
          this.settled = true;
          this.rejected = true;
          const err = new Error(
            `Graph load timed out after ${this.timeoutMs}ms`,
          );
          reject(err);
          this.emit("graphLoadError", err);
        }, this.timeoutMs);
      }
    });
  }

  /**
   * wait
   * Returns a Promise that resolves when the controller is resolved, or
   * rejects if the controller is rejected or times out.
   */
  wait(): Promise<void> {
    return this.promise;
  }

  /**
   * resolve
   * Mark readiness success and notify listeners.
   */
  resolve() {
    if (!this.resolveFn) return;
    this.resolveFn();
  }

  /**
   * reject
   * Mark readiness failure and notify listeners.
   */
  reject(err?: any) {
    if (!this.rejectFn) return;
    this.rejectFn(err);
  }

  /**
   * on/off
   * Simple event listener registration for 'graphLoaded' and 'graphLoadError'.
   */
  on(event: GraphReadyEvent, cb: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    this.listeners.set(event, set);
  }

  off(event: GraphReadyEvent, cb: Listener) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) this.listeners.delete(event);
  }

  private emit(event: GraphReadyEvent, info?: any) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) {
      try {
        cb(info);
      } catch (err) {
        // Swallow listener errors to avoid breaking host flow
        // eslint-disable-next-line no-console
        console.error("GraphReadyController listener error:", err);
      }
    }
  }

  /**
   * Convenience getters for external inspection.
   */
  get isSettled() {
    return this.settled;
  }
  get isResolved() {
    return this.resolved;
  }
  get isRejected() {
    return this.rejected;
  }
}

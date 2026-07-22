/**
 * The Arora device lifecycle behind `VizijRuntimeProvider`.
 *
 * One wasm module per realm and one device per provider: `init()` is
 * memoized module-globally (StrictMode double-mounts must not race two wasm
 * initializations), and device creation is deduped through a promise so
 * concurrent boots share one device. Devices are deliberately never freed on
 * unmount: the provider can remount around a live device.
 *
 * Changing the composed graph goes through `recompose`: the device swaps its
 * behavior **in place** (`device.loadGraph`, the interpreter-module LOAD
 * reached through the device's caller — VIZ-57), so the store, the loaded
 * modules, and the device itself survive every recomposition. The one thing
 * a live device cannot change is its **module set** — modules load at device
 * build — so a recompose that finds the slot's modules changed since boot
 * rebuilds the device, carrying the store across (snapshot minus the
 * runtime-owned `arora/*` golden keys). Boots wait for modules a
 * `waitForModules` promise announces, so the supported flows never hit that
 * rebuild.
 *
 * When `runPeriodMs` is set, every device this slot boots is handed to its
 * own loop (`device.run`) — it paces itself and `step()` becomes
 * unavailable; a slot left at `null` serves hosts that step manually. A
 * device under `run()` cannot be handed back: it keeps its loop for good
 * (including across a module-set rebuild, where the replaced device's loop
 * keeps ticking unreachable until the page goes).
 */
import {
  init,
  startRuntime,
  type Runtime,
  type RuntimeModule,
  type ValueJSON,
  type InitInput,
} from "@vizij/runtime";

export type { RuntimeModule };

/** Store keys owned by the arora runtime itself (frame clock etc.). */
const GOLDEN_PREFIX = "arora/";

export function isGoldenPath(path: string): boolean {
  return path.startsWith(GOLDEN_PREFIX);
}

/**
 * The self-paced device's step period: the ~60 Hz render-aligned cadence the
 * JS-driven step loop used to run at. The browser throttles the loop's
 * timers with a hidden page, so a backgrounded device slows with its tab;
 * the step `dt` stays the measured wall clock either way.
 */
export const RUN_PERIOD_MS = 1000 / 60;

let initPromise: Promise<void> | null = null;

/** Load the wasm module once per realm. */
export function ensureWasmInit(input?: InitInput): Promise<void> {
  if (!initPromise) {
    initPromise = init(input);
  }
  return initPromise;
}

export interface DeviceHandle {
  device: Runtime;
  /** The composed spec the device currently runs (for recompose diffing). */
  spec: object;
  /** The slot's module list the device was built with (identity compare). */
  modules: RuntimeModule[] | undefined;
}

/**
 * One device slot per handle owner (each provider instance creates its own
 * slot). Creation is deduped: a second `recompose` during a pending boot
 * chains behind it and lands on the same device.
 */
export class DeviceSlot {
  private handle: DeviceHandle | null = null;
  /** Arora wasm modules loaded into every device this slot boots. */
  private modules: RuntimeModule[] | undefined;
  /** Module loading a boot must wait out before it reads `modules`. */
  private modulesLoading: Promise<unknown> | null = null;
  /**
   * When set, a booted device is handed to its own loop (`device.run`) at
   * this period. `null`: the host drives `step()` itself.
   */
  runPeriodMs: number | null = null;
  /**
   * Runs (inside the serialized op) each time a fresh device comes up — a
   * boot or a module-set rebuild — before the promise resolves. Module guest
   * state lives in the device, so this is where owners replay module setup
   * calls (e.g. re-`load_animation` the clips) after a rebuild.
   */
  onDeviceStarted?: (handle: DeviceHandle) => void;
  /**
   * Notified when a self-paced device's run loop ends — `device.run`'s
   * promise only ever rejects, and it rejecting means stepping failed.
   */
  onRunEnded?: (error: unknown) => void;
  /**
   * Serializes device operations. Every `recompose` chains behind the
   * previous op so two never run concurrently — a bundle whose import fans
   * out into several graph registrations recomposes in a burst. Failures are
   * swallowed on the chain so one failed op doesn't wedge later ones; each
   * caller still sees its own rejection through the promise `enqueue`
   * returns.
   */
  private opChain: Promise<unknown> = Promise.resolve();

  get current(): DeviceHandle | null {
    return this.handle;
  }

  /**
   * The modules every subsequent device boot loads. The live device (if any)
   * is not touched: a later `recompose` that sees the list changed rebuilds.
   */
  setModules(modules: RuntimeModule[] | undefined): void {
    this.modules = modules && modules.length > 0 ? modules : undefined;
  }

  /**
   * Announce module loading in flight: boots wait for `loading` to settle
   * before reading the module list, so a device never boots without modules
   * that were already on their way. Pass a promise that cannot reject (the
   * owner handles its own failures) — boots resume either way.
   */
  waitForModules(loading: Promise<unknown>): void {
    this.modulesLoading = loading;
  }

  /**
   * Hand the live device to its own loop, if there is one and `runPeriodMs`
   * says so — for a host whose drive mode turns self-paced after boot.
   */
  startRun(): void {
    if (this.handle) {
      this.maybeRun(this.handle.device);
    }
  }

  private maybeRun(device: Runtime): void {
    if (this.runPeriodMs === null || device.running) {
      return;
    }
    // Known gap: a self-paced device measures dt inside arora, so the JS
    // step loops' suspension inference (VizijRuntimeProvider's
    // IMPLICIT_PAUSE_GAP_S, dt = 0 on an implausible inter-step gap) never
    // applies here — a host suspension (e.g. an OS-suspended WebView)
    // reaches the engine as one large dt on the first tick after resume.
    // Only manually stepped devices get the re-baseline.
    device.run(this.runPeriodMs).catch((error: unknown) => {
      this.onRunEnded?.(error);
    });
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async boot(spec: object): Promise<DeviceHandle> {
    await ensureWasmInit();
    if (this.modulesLoading) {
      await this.modulesLoading;
    }
    const device = await startRuntime(spec, undefined, this.modules);
    this.handle = { device, spec, modules: this.modules };
    this.onDeviceStarted?.(this.handle);
    this.maybeRun(device);
    return this.handle;
  }

  /**
   * Rebuild the device because its module set changed since boot — the one
   * change a live device cannot take. Carries the store across (snapshot
   * minus golden keys) and replays module setup via `onDeviceStarted`. The
   * old device's wrapper is freed; if it was self-paced its loop keeps
   * ticking unreachable — which is why boots wait for announced modules
   * instead of leaning on this path.
   */
  private async rebuild(
    old: DeviceHandle,
    spec: object,
  ): Promise<DeviceHandle> {
    const carried: Record<string, ValueJSON> = {};
    for (const [path, value] of Object.entries(old.device.snapshot())) {
      if (!isGoldenPath(path)) {
        carried[path] = value;
      }
    }

    const device = await startRuntime(spec, undefined, this.modules);
    if (Object.keys(carried).length > 0) {
      device.writeValues(carried);
    }
    this.handle = { device, spec, modules: this.modules };
    old.device.dispose();
    this.onDeviceStarted?.(this.handle);
    this.maybeRun(device);
    return this.handle;
  }

  /**
   * Make the device run `spec`: boot it if none is live, otherwise swap the
   * graph in place (the store is the same store, so nothing is carried).
   * No-op if the spec is identical by reference. Serialized behind any
   * in-flight op (see `opChain`).
   */
  recompose(spec: object): Promise<DeviceHandle> {
    return this.enqueue(async () => {
      const old = this.handle;
      if (!old) {
        return this.boot(spec);
      }
      if (old.modules !== this.modules) {
        return this.rebuild(old, spec);
      }
      if (old.spec === spec) {
        return old;
      }
      await old.device.loadGraph(spec);
      old.spec = spec;
      return old;
    });
  }
}

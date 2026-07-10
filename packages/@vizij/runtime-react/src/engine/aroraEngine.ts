/**
 * The Arora device lifecycle behind `VizijRuntimeProvider`.
 *
 * One wasm module per realm and one device per provider: `init()` is
 * memoized module-globally (StrictMode double-mounts must not race two wasm
 * initializations — same discipline as the orchestrator wrapper had), and
 * device creation is deduped through a promise so concurrent boots share one
 * device. Devices are deliberately never freed on unmount: the provider can
 * remount around a live device (parity with the orchestrator provider, whose
 * instance also outlived unmounts).
 *
 * Changing the composed graph goes through `restartDevice`: the device's
 * behavior is fixed at construction in arora-web 5.2, so a recompose tears
 * the device down and rebuilds it, carrying the store across (snapshot minus
 * the runtime-owned `arora/*` golden keys, re-written into the new device).
 * VIZ-57 replaces this with an in-place behavior load once `BrowserRuntime`
 * exposes the interpreter module's LOAD function.
 */
import {
  init,
  startDevice,
  type AroraDevice,
  type ValueJSON,
  type InitInput,
} from "@vizij/arora-web-wasm";

/** Store keys owned by the arora runtime itself (frame clock etc.). */
const GOLDEN_PREFIX = "arora/";

export function isGoldenPath(path: string): boolean {
  return path.startsWith(GOLDEN_PREFIX);
}

let initPromise: Promise<void> | null = null;

/** Load the wasm module once per realm. */
export function ensureWasmInit(input?: InitInput): Promise<void> {
  if (!initPromise) {
    initPromise = init(input);
  }
  return initPromise;
}

export interface DeviceHandle {
  device: AroraDevice;
  /** The composed spec the device was started with (for recompose diffing). */
  spec: object;
}

/**
 * One device slot per handle owner (each provider instance creates its own
 * slot). Creation is deduped: a second `ensure` during a pending create
 * resolves to the same device.
 */
export class DeviceSlot {
  private handle: DeviceHandle | null = null;
  private pending: Promise<DeviceHandle> | null = null;

  get current(): DeviceHandle | null {
    return this.handle;
  }

  /** Boot the device with `spec` if none is live; otherwise return the live one. */
  ensure(spec: object): Promise<DeviceHandle> {
    if (this.handle) {
      return Promise.resolve(this.handle);
    }
    if (!this.pending) {
      this.pending = (async () => {
        await ensureWasmInit();
        const device = await startDevice(spec);
        this.handle = { device, spec };
        this.pending = null;
        return this.handle;
      })();
    }
    return this.pending;
  }

  /**
   * Replace the device's composed graph: snapshot the store (minus golden
   * keys), start a fresh device with `spec`, restore the snapshot, dispose
   * the old device. No-op if the spec is identical by reference.
   */
  async restart(spec: object): Promise<DeviceHandle> {
    const old = this.handle;
    if (old && old.spec === spec) {
      return old;
    }
    if (!old) {
      return this.ensure(spec);
    }

    const carried: Record<string, ValueJSON> = {};
    for (const [path, value] of Object.entries(old.device.snapshot())) {
      if (!isGoldenPath(path)) {
        carried[path] = value;
      }
    }

    const device = await startDevice(spec);
    if (Object.keys(carried).length > 0) {
      device.writeValues(carried);
    }
    this.handle = { device, spec };
    old.device.dispose();
    return this.handle;
  }
}

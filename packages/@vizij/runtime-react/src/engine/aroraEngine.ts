/**
 * The Arora device lifecycle behind `VizijRuntimeProvider`.
 *
 * One wasm module per realm and one device per provider: `init()` is
 * memoized module-globally (StrictMode double-mounts must not race two wasm
 * initializations), and device creation is deduped through a promise so
 * concurrent boots share one device. Devices are deliberately never freed on
 * unmount: the provider can remount around a live device.
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
  /**
   * Serializes device (re)starts. Every `ensure`/`restart` chains behind the
   * previous op so two recomposes never run concurrently — a second restart
   * that captured the same `old` handle would dispose an already-freed device
   * (wasm "null pointer passed to rust"). A bundle whose import fans out into
   * several graph registrations recomposes several times in a burst, which is
   * exactly when that race fires. Failures are swallowed on the chain so one
   * failed (re)start doesn't wedge later ones; each caller still sees its own
   * rejection through the promise `enqueue` returns.
   */
  private opChain: Promise<unknown> = Promise.resolve();

  get current(): DeviceHandle | null {
    return this.handle;
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Boot the device with `spec` if none is live; otherwise return the live one. */
  ensure(spec: object): Promise<DeviceHandle> {
    return this.enqueue(async () => {
      if (this.handle) {
        return this.handle;
      }
      await ensureWasmInit();
      const device = await startDevice(spec);
      this.handle = { device, spec };
      return this.handle;
    });
  }

  /**
   * Replace the device's composed graph: snapshot the store (minus golden
   * keys), start a fresh device with `spec`, restore the snapshot, dispose
   * the old device. No-op if the spec is identical by reference. Serialized
   * behind any in-flight (re)start (see `opChain`) so device disposal never
   * races another restart's snapshot/dispose of the same device.
   */
  restart(spec: object): Promise<DeviceHandle> {
    return this.enqueue(async () => {
      const old = this.handle;
      if (old && old.spec === spec) {
        return old;
      }
      // First live device: same path as `ensure`, inlined so it runs inside
      // this queued op instead of enqueuing behind itself (which would deadlock).
      if (!old) {
        await ensureWasmInit();
        const device = await startDevice(spec);
        this.handle = { device, spec };
        return this.handle;
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
    });
  }
}

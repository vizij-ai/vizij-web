/**
 * Device-side animation playback state for `VizijRuntimeProvider`.
 *
 * The host owns the animation module's guest state *as the runtime sees it*:
 * which clips are loaded into the module, which are playing, and the module
 * ids (`AnimId`/`PlayerId`/`InstId`) each maps to. Clips register as **data**
 * — pushed into the module through the call surface — and the composed
 * "animations" graph source ticks the module each device step. The provider
 * owns source (un)registration and output routing; this host owns the calls.
 *
 * Two hard properties of the 0.1.0 module shape it:
 *
 * 1. **Module guest state dies on a device restart.** A recompose starts a
 *    fresh device whose module instantiates from scratch, so ids are void and
 *    clips must be re-loaded. `replayInto` re-issues every loaded clip's setup
 *    against a fresh device; the provider calls it from `DeviceSlot.
 *    onDeviceStarted`.
 *
 * 2. **One engine, stepped whole.** The module has a single engine advanced by
 *    `step(dt)`; there is no per-player command surface. So "playing" is
 *    engine-wide: the provider registers the animations source when any clip
 *    plays and unregisters it when none do. Independent per-clip pause while
 *    another clip plays is NOT expressible against this module (documented
 *    capability gap — a future module-transport extension, not faked here).
 */
import type { AroraDevice } from "@vizij/arora-web-wasm";
import {
  addInstanceCall,
  callResultU32,
  createPlayerCall,
  loadAnimationCall,
  storedClipToModuleValue,
  type AroraValueJSON,
  type StoredAnimationClipLike,
} from "./animationModule";

interface ClipEntry {
  /** The clip converted to the module's declared `AnimationClip` value. */
  moduleValue: AroraValueJSON;
  /** Whether this clip should be advancing on the device. */
  playing: boolean;
  /** Module ids on the live device; `null` until (re)loaded. */
  animId: number | null;
  playerId: number | null;
  instId: number | null;
}

export class AnimationModuleHost {
  private readonly clips = new Map<string, ClipEntry>();

  constructor(private readonly getDevice: () => AroraDevice | null) {}

  /** Whether any clip is currently marked playing (drives source lifecycle). */
  hasPlaying(): boolean {
    for (const entry of this.clips.values()) {
      if (entry.playing) {
        return true;
      }
    }
    return false;
  }

  /** Whether a clip id is known to the host. */
  has(clipId: string): boolean {
    return this.clips.has(clipId);
  }

  /**
   * Declare the clips the bundle carries, as data. Converts each once and
   * keeps playing state for clips that survive. Clips no longer present are
   * dropped. Does not touch the device — loading is lazy (on first play), so
   * muted/unused clips never enter the module.
   */
  setClips(
    clips: Array<{ id: string; stored: StoredAnimationClipLike }>,
  ): void {
    const nextIds = new Set(clips.map((clip) => clip.id));
    for (const id of Array.from(this.clips.keys())) {
      if (!nextIds.has(id)) {
        this.clips.delete(id);
      }
    }
    for (const clip of clips) {
      const existing = this.clips.get(clip.id);
      const moduleValue = storedClipToModuleValue(clip.stored);
      if (existing) {
        existing.moduleValue = moduleValue;
        // A changed clip must reload into the module: void its ids.
        existing.animId = null;
        existing.playerId = null;
        existing.instId = null;
      } else {
        this.clips.set(clip.id, {
          moduleValue,
          playing: false,
          animId: null,
          playerId: null,
          instId: null,
        });
      }
    }
  }

  /**
   * Mark a clip playing and ensure it is loaded into the live device with a
   * player + instance. Idempotent. Returns the calls' completion (they
   * dispatch across the next device steps); resolves once the instance
   * exists (or immediately when there is no live device yet — the provider
   * registers the source, which boots/recomposes the device and replays via
   * `replayInto`).
   */
  async play(clipId: string): Promise<void> {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.playing = true;
    const device = this.getDevice();
    if (!device) {
      // No device yet: the provider will register the animations source,
      // which boots the device and replays this entry via replayInto.
      return;
    }
    await this.ensureLoaded(device, entry);
  }

  /** Mark a clip not playing. Keeps it loaded for a cheap resume. */
  pause(clipId: string): void {
    const entry = this.clips.get(clipId);
    if (entry) {
      entry.playing = false;
    }
  }

  /**
   * Stop a clip: not playing, and its module ids voided so the next `play`
   * reloads it fresh (a new player starts at time 0 — the module has no seek/
   * reset call, so reload IS the reset). The clip stays known.
   */
  stop(clipId: string): void {
    const entry = this.clips.get(clipId);
    if (entry) {
      entry.playing = false;
      entry.animId = null;
      entry.playerId = null;
      entry.instId = null;
    }
  }

  /**
   * Re-issue setup for every playing clip against a freshly started device
   * (module guest state did not survive the restart). Voids stale ids first.
   * Called from `DeviceSlot.onDeviceStarted`.
   */
  replayInto(device: AroraDevice): void {
    for (const entry of this.clips.values()) {
      entry.animId = null;
      entry.playerId = null;
      entry.instId = null;
      if (entry.playing) {
        void this.ensureLoaded(device, entry);
      }
    }
  }

  private async ensureLoaded(
    device: AroraDevice,
    entry: ClipEntry,
  ): Promise<void> {
    if (entry.instId !== null) {
      return;
    }
    if (entry.animId === null) {
      const anim = await device.call(loadAnimationCall(entry.moduleValue));
      entry.animId = callResultU32(anim);
    }
    if (entry.playerId === null) {
      const player = await device.call(createPlayerCall(""));
      entry.playerId = callResultU32(player);
    }
    if (
      entry.instId === null &&
      entry.animId !== null &&
      entry.playerId !== null
    ) {
      const inst = await device.call(
        addInstanceCall(entry.playerId, entry.animId),
      );
      entry.instId = callResultU32(inst);
    }
  }
}

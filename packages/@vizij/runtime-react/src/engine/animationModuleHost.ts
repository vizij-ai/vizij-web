/**
 * Device-side animation playback state for `VizijRuntimeProvider`.
 *
 * The host owns the animation module's guest state *as the runtime sees it*:
 * which clips are loaded into the module, which are playing, the module ids
 * (`AnimId`/`PlayerId`/`InstId`) each maps to, and the transport state
 * (speed / loop / weight) it must re-apply when a rebuilt device replays.
 * Clips register as **data** — pushed into the module through the call
 * surface — and the composed "animations" graph source ticks the module each
 * device step, applying its outputs onto the store keys decided at clip
 * load. The provider owns source (un)registration; this host owns the calls.
 *
 * Two properties of the module line shape it:
 *
 * 1. **Module guest state dies on a device rebuild.** A module-set rebuild
 *    starts a fresh device whose module instantiates from scratch, so ids
 *    are void and clips must be re-loaded. `replayInto` re-issues every
 *    playing clip's setup and transport against the fresh device; the
 *    provider calls it from `DeviceSlot.onDeviceStarted`.
 *
 * 2. **Store keys are decided at load.** `ensureLoaded` converts the stored
 *    clip with the **current** key resolver (rig mapping + face id), writing
 *    the final store paths into each track's `animatable_id` — one track per
 *    resolved target. The module's `[TrackOutput]` then names the keys the
 *    graph's path-less `output` node applies; nothing re-keys per tick.
 */
import type { Runtime } from "@vizij/runtime";
import {
  addInstanceCall,
  callResultU32,
  createPlayerCall,
  loadAnimationCall,
  pauseCall,
  playCall,
  seekCall,
  setLoopCall,
  setSpeedCall,
  setWeightCall,
  stopCall,
  storedClipToModuleValue,
  type AnimationModuleCall,
  type ResolveTrackKeys,
  type StoredAnimationClipLike,
} from "./animationModule";

export type AnimationLoopMode = "once" | "loop" | "ping_pong";

interface ClipEntry {
  /** The stored clip, converted at load time with the current key resolver. */
  stored: StoredAnimationClipLike;
  /** Whether this clip should be advancing on the device. */
  playing: boolean;
  /** Transport state to apply on load and re-apply on a device rebuild. */
  speed: number;
  loop: AnimationLoopMode;
  weight: number;
  /** Module ids on the live device; `null` until (re)loaded. */
  animId: number | null;
  playerId: number | null;
  instId: number | null;
}

export class AnimationModuleHost {
  private readonly clips = new Map<string, ClipEntry>();

  constructor(
    private readonly getDevice: () => Runtime | null,
    /** Final store keys for an authored track key, resolved at load time. */
    private readonly resolveKeys: ResolveTrackKeys = (key) => [key],
  ) {}

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

  /** The clip's module `PlayerId` on the live device (feedback correlation). */
  playerIdOf(clipId: string): number | null {
    return this.clips.get(clipId)?.playerId ?? null;
  }

  /** The clip's transport state as last commanded. */
  transportOf(clipId: string): {
    playing: boolean;
    speed: number;
    loop: AnimationLoopMode;
    weight: number;
  } | null {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return null;
    }
    return {
      playing: entry.playing,
      speed: entry.speed,
      loop: entry.loop,
      weight: entry.weight,
    };
  }

  /**
   * Declare the clips the bundle carries, as data. Keeps playing/transport
   * state for clips that survive; clips no longer present are dropped. Does
   * not touch the device — loading is lazy (on first play), so muted/unused
   * clips never enter the module, and conversion happens at load with the
   * key resolver's state at that moment.
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
      if (existing) {
        existing.stored = clip.stored;
        // A changed clip must reload into the module: void its ids.
        existing.animId = null;
        existing.playerId = null;
        existing.instId = null;
      } else {
        this.clips.set(clip.id, {
          stored: clip.stored,
          playing: false,
          speed: 1,
          loop: "loop",
          weight: 1,
          animId: null,
          playerId: null,
          instId: null,
        });
      }
    }
  }

  /**
   * Mark a clip playing, ensure it is loaded into the live device with a
   * player + instance, and issue `play` (a resume after `pause` needs it; on
   * a fresh player it is a no-op). Idempotent. Resolves once the calls have
   * dispatched (or immediately when there is no live device yet — the
   * provider registers the source, which boots the device and replays via
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
      return;
    }
    await this.ensureLoaded(device, entry);
    if (entry.playerId !== null) {
      await device.call(playCall(entry.playerId));
    }
  }

  /** Hold the clip's playhead (`pause` on its player). */
  pause(clipId: string): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.playing = false;
    this.dispatch((device) =>
      entry.playerId !== null ? device.call(pauseCall(entry.playerId)) : null,
    );
  }

  /**
   * Stop a clip: not playing, playhead reset to the window start (`stop` on
   * its player — the next tick emits the clip's t=0 pose). The clip stays
   * loaded for a cheap replay.
   */
  stop(clipId: string): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.playing = false;
    this.dispatch((device) =>
      entry.playerId !== null ? device.call(stopCall(entry.playerId)) : null,
    );
  }

  /** Move the clip's playhead to `seconds`. */
  seek(clipId: string, seconds: number): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    this.dispatch((device) =>
      entry.playerId !== null
        ? device.call(seekCall(entry.playerId, seconds * 1e9))
        : null,
    );
  }

  /** Set the clip's playback speed multiplier. */
  setSpeed(clipId: string, speed: number): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.speed = speed;
    this.dispatch((device) =>
      entry.playerId !== null
        ? device.call(setSpeedCall(entry.playerId, speed))
        : null,
    );
  }

  /** Set how the clip's player time maps into clip time. */
  setLoop(clipId: string, mode: AnimationLoopMode): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.loop = mode;
    this.dispatch((device) =>
      entry.playerId !== null
        ? device.call(setLoopCall(entry.playerId, mode))
        : null,
    );
  }

  /** Set the clip instance's blend weight. */
  setWeight(clipId: string, weight: number): void {
    const entry = this.clips.get(clipId);
    if (!entry) {
      return;
    }
    entry.weight = weight;
    this.dispatch((device) =>
      entry.playerId !== null && entry.instId !== null
        ? device.call(setWeightCall(entry.playerId, entry.instId, weight))
        : null,
    );
  }

  /**
   * Re-issue setup and transport for every playing clip against a freshly
   * started device (module guest state did not survive the rebuild). Voids
   * stale ids first. Called from `DeviceSlot.onDeviceStarted`.
   */
  replayInto(device: Runtime): void {
    for (const entry of this.clips.values()) {
      entry.animId = null;
      entry.playerId = null;
      entry.instId = null;
      if (entry.playing) {
        void this.ensureLoaded(device, entry);
      }
    }
  }

  /** Fire-and-forget a transport call against the live device, if any. */
  private dispatch(issue: (device: Runtime) => Promise<unknown> | null): void {
    const device = this.getDevice();
    if (!device) {
      return;
    }
    void issue(device)?.catch(() => {
      // The device swallows nothing itself: a failed transport call means
      // the player is gone (a rebuild raced it); replayInto restores it.
    });
  }

  private async ensureLoaded(device: Runtime, entry: ClipEntry): Promise<void> {
    if (entry.instId !== null) {
      return;
    }
    if (entry.animId === null) {
      const anim = await device.call(
        loadAnimationCall(
          storedClipToModuleValue(entry.stored, this.resolveKeys),
        ),
      );
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
    // Re-apply non-default transport (a fresh player has speed 1 / loop / weight 1).
    const followups: AnimationModuleCall[] = [];
    if (entry.playerId !== null) {
      if (entry.speed !== 1) {
        followups.push(setSpeedCall(entry.playerId, entry.speed));
      }
      if (entry.loop !== "loop") {
        followups.push(setLoopCall(entry.playerId, entry.loop));
      }
      if (entry.instId !== null && entry.weight !== 1) {
        followups.push(
          setWeightCall(entry.playerId, entry.instId, entry.weight),
        );
      }
    }
    for (const call of followups) {
      await device.call(call);
    }
  }
}

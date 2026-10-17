import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ANIMATION_PLAYERS_PATH,
  decodePlayerStates,
  type Animation,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";
import {
  useOptionalVizijRuntime,
  useVizijChanges,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { useBindingAuthoring } from "../state/RigControllerProvider";
import { useAnimationStore } from "../state/animationStore";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  type AnimationClipIR,
} from "../types/animationClipIr";
import { clipIrToAnimation } from "../utils/animationClipCompiler";
import { ANIMATION_STEP_SECONDS, nextStepTime } from "./animationStepMath";
import {
  pauseTimeline,
  playTimeline,
  seekTimeline,
  setTimelineLoop,
  setTimelineSpeed,
  shownTimeline,
  stopTimeline,
  timelinePlayer,
} from "./timelinePlayer";

/** The timeline's clip on one device: the animation, the player and the
 * instance the module gave it, and whether the instance has a weight. */
interface LoadedTimeline {
  runtime: Runtime;
  /** The clip the player holds. */
  animation: Animation;
  anim: { u32: number };
  player: { u32: number };
  instance: { u32: number };
  /** The keys the clip's tracks name, which go back to rest when the
   * timeline is silenced. */
  keys: string[];
  audible: boolean;
}

function asU32(value: unknown, what: string): { u32: number } {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { u32?: unknown }).u32 === "number"
  ) {
    return { u32: (value as { u32: number }).u32 };
  }
  throw new Error(`${what} returned ${JSON.stringify(value)}, not a u32`);
}

/** The timeline's player the device already has — the face's own copy of the
 * timeline, loaded with the face — or `null`. */
function existingTimeline(
  runtime: Runtime,
): Pick<LoadedTimeline, "anim" | "player" | "instance"> | null {
  const player = timelinePlayer(runtime);
  const instance = player?.instances[0];
  return player && instance
    ? {
        anim: { u32: instance.anim },
        player: { u32: player.player },
        instance: { u32: instance.instance },
      }
    : null;
}

/**
 * Put `animation` on the timeline's player, at weight 1: in place when the
 * device already has the player — the face's own copy of the timeline, or
 * this bridge's — else on a new animation, player and instance.
 */
async function showTimeline(
  runtime: Runtime,
  previous: LoadedTimeline | null,
  animation: Animation,
): Promise<LoadedTimeline> {
  // `load_animation`'s `clip`: the module's `AnimationClip` as an Arora value.
  const moduleAnimation = runtime.moduleAnimation(animation)
    .moduleAnimation as ValueInput;
  const keys = animation.tracks.map((track) => runtime.path(track.channel));
  const mine = previous?.runtime === runtime ? previous : null;
  const existing = mine ?? existingTimeline(runtime);
  if (existing) {
    // Issued together: the device applies them in order.
    await Promise.all([
      runtime.invoke("reload_animation", {
        anim: existing.anim,
        clip: moduleAnimation,
      }),
      mine?.audible
        ? undefined
        : runtime.invoke("set_weight", {
            player: existing.player,
            instance: existing.instance,
            weight: { f32: 1 },
          }),
    ]);
    return {
      runtime,
      animation,
      anim: existing.anim,
      player: existing.player,
      instance: existing.instance,
      keys,
      audible: true,
    };
  }
  const [loadedAnim, createdPlayer] = await Promise.all([
    runtime.invoke("load_animation", { clip: moduleAnimation }),
    runtime.invoke("create_player", { name: AUTHORED_TIMELINE_CLIP_ID }),
  ]);
  const anim = asU32(loadedAnim, "load_animation");
  const player = asU32(createdPlayer, "create_player");
  const instance = asU32(
    await runtime.invoke("add_instance_with_weight", {
      player,
      anim,
      weight: { f32: 1 },
    }),
    "add_instance_with_weight",
  );
  return { runtime, animation, anim, player, instance, keys, audible: true };
}

/** Stop the timeline, take its weight away and return its keys to rest. */
async function silenceTimeline(loaded: LoadedTimeline): Promise<void> {
  const { runtime, player, instance, keys } = loaded;
  await Promise.all([
    runtime.invoke("stop", { player }),
    runtime.invoke("set_weight", { player, instance, weight: { f32: 0 } }),
    runtime.invoke("reset_keys", { keys: { strs: keys } }),
  ]);
}

/**
 * The timeline on the main face's device. The clip — `clip`, or the editor's
 * own when none is given — plays on the timeline's player (`timelinePlayer`),
 * reloaded in place on every edit so the playhead and the playback state
 * stay; a new device (the face reloaded) gets it again where the transport
 * stands. Inactive, the timeline is stopped, silent, and its keys are at
 * rest.
 *
 * The transport store follows the player as the device reports it, once per
 * frame, and `transportRuntimeReady` says whether the device holds the
 * current clip.
 */
export function AnimationRuntimeBridge({
  active = true,
  clip = null,
  transportSessionKey,
}: {
  active?: boolean;
  clip?: AnimationClipIR | null;
  transportSessionKey?: number;
}) {
  const { runtime } = useVizijRuntime();
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const tracks = useAnimationStore((state) => state.tracks);
  const exportClipIr = useAnimationStore((state) => state.exportClipIr);
  const syncTransportState = useAnimationStore(
    (state) => state.syncTransportState,
  );
  const setTransportRuntimeReady = useAnimationStore(
    (state) => state.setTransportRuntimeReady,
  );
  const setTransportEnabled = useAnimationStore(
    (state) => state.setTransportEnabled,
  );
  const editorClip = useMemo(
    () =>
      tracks.length > 0
        ? exportClipIr({
            id: AUTHORED_TIMELINE_CLIP_ID,
            name: AUTHORED_TIMELINE_CLIP_NAME,
          })
        : null,
    [exportClipIr, tracks],
  );
  const authoredClip = clip ?? editorClip;
  const animation = useMemo<Animation | null>(
    () =>
      active && authoredClip
        ? clipIrToAnimation(authoredClip, { standardInputsById })
        : null,
    [active, authoredClip, standardInputsById],
  );

  const loaded = useRef<LoadedTimeline | null>(null);
  /** What the device should hold: the latest clip, device and session. */
  const wanted = useRef<{
    runtime: Runtime | null;
    animation: Animation | null;
    sessionKey: number | undefined;
  }>({ runtime: null, animation: null, sessionKey: transportSessionKey });
  const syncing = useRef(false);
  /**
   * Whether the transport follows what the device reports: from when the
   * device first holds the session's clip. Before that, a report shows the
   * player as the face loaded it, and would undo a seek made before Play.
   */
  const following = useRef(false);

  /**
   * Bring the device to what `wanted` says, one operation at a time — a
   * reload lands after the load that made the animation it names — and to
   * the latest wish only: clips that change while an operation runs are
   * skipped over, not loaded in turn.
   */
  const sync = useCallback(async () => {
    if (syncing.current) {
      return;
    }
    syncing.current = true;
    try {
      for (;;) {
        const { runtime, animation } = wanted.current;
        const previous = loaded.current;
        if (!runtime) {
          return;
        }
        if (animation) {
          if (
            previous?.runtime !== runtime ||
            previous.animation !== animation ||
            !previous.audible
          ) {
            const next = await showTimeline(runtime, previous, animation);
            loaded.current = next;
            if (previous?.runtime !== runtime) {
              // The face's device is new: put the playhead back where the
              // transport stands, playing if it was.
              const {
                currentTime,
                isPlaying,
                loop,
                playSpeed,
                transportActive,
              } = useAnimationStore.getState();
              if (isPlaying) {
                await playTimeline(runtime, {
                  time: currentTime,
                  loop,
                  speed: playSpeed,
                });
              } else if (transportActive) {
                await seekTimeline(runtime, currentTime);
              }
            }
          }
        } else if (previous?.runtime === runtime && previous.audible) {
          loaded.current = { ...previous, audible: false };
          await silenceTimeline(previous);
        }
        const now = wanted.current;
        if (now.runtime === runtime && now.animation === animation) {
          if (animation) {
            following.current = true;
            setTransportRuntimeReady(true, now.sessionKey);
          }
          return;
        }
      }
    } catch (error) {
      console.error("[vizij-authoring] the timeline's clip failed", error);
    } finally {
      syncing.current = false;
    }
  }, [setTransportRuntimeReady]);

  useEffect(() => {
    setTransportEnabled(active);
    return () => setTransportEnabled(true);
  }, [active, setTransportEnabled]);

  useEffect(() => {
    if (
      wanted.current.runtime !== runtime ||
      wanted.current.sessionKey !== transportSessionKey
    ) {
      following.current = false;
    }
    wanted.current = {
      runtime,
      animation,
      sessionKey: transportSessionKey,
    };
    setTransportRuntimeReady(false, transportSessionKey);
    if (runtime && !animation) {
      syncTransportState(
        {
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        },
        transportSessionKey,
      );
    }
    void sync();
  }, [
    animation,
    runtime,
    setTransportRuntimeReady,
    sync,
    syncTransportState,
    transportSessionKey,
  ]);

  const activeRef = useRef(active);
  activeRef.current = active;
  const sessionKeyRef = useRef(transportSessionKey);
  sessionKeyRef.current = transportSessionKey;
  useVizijChanges((changes) => {
    if (
      !runtime ||
      !activeRef.current ||
      !following.current ||
      !(ANIMATION_PLAYERS_PATH in changes)
    ) {
      return;
    }
    const player = decodePlayerStates(changes[ANIMATION_PLAYERS_PATH]).find(
      (state) => state.name === AUTHORED_TIMELINE_CLIP_ID,
    );
    // While the author drags the playhead, the drag owns the clock: the
    // device's time written back each frame would undo the scrub.
    const scrubbing = useAnimationStore.getState().isScrubbing;
    if (!player) {
      syncTransportState(
        {
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
          ...(scrubbing ? {} : { currentTime: 0 }),
        },
        sessionKeyRef.current,
      );
      return;
    }
    const { state, time } = shownTimeline(runtime, player);
    syncTransportState(
      {
        ...(scrubbing ? {} : { currentTime: time }),
        duration: player.duration,
        isPlaying: state === "playing",
        loop: player.loopMode !== "once",
        playSpeed: player.speed,
        transportActive: true,
        transportPlaybackState: state,
      },
      sessionKeyRef.current,
    );
  });

  return null;
}

/**
 * The animation panel's transport: the timeline's player on the main face's
 * device when it can drive one — a face is shown, the bridge is active and
 * the clip has tracks — and the store's own clock otherwise.
 */
export function useAnimationTransport() {
  const face = useOptionalVizijRuntime();
  const runtime = face?.runtime ?? null;
  const transportEnabled = useAnimationStore((state) => state.transportEnabled);
  // Selected rather than the whole store: every consumer of this hook would
  // otherwise re-render on any store change, including clip edits it does not
  // care about.
  const {
    tracks,
    currentTime,
    isPlaying,
    playSpeed,
    loop,
    play,
    pause,
    stop,
    setLoop,
    setPlaySpeed,
    syncTransportState,
  } = useAnimationStore(
    useShallow((state) => ({
      tracks: state.tracks,
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      playSpeed: state.playSpeed,
      loop: state.loop,
      play: state.play,
      pause: state.pause,
      stop: state.stop,
      setLoop: state.setLoop,
      setPlaySpeed: state.setPlaySpeed,
      syncTransportState: state.syncTransportState,
    })),
  );

  const device = transportEnabled && tracks.length > 0 ? runtime : null;

  const playTransport = useCallback(() => {
    if (!device) {
      return;
    }
    void playTimeline(device, { time: currentTime, loop, speed: playSpeed });
    play();
  }, [currentTime, device, loop, play, playSpeed]);

  const pauseTransport = useCallback(() => {
    if (!device) {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return;
    }
    void pauseTimeline(device);
    pause();
  }, [device, pause, syncTransportState]);

  const stopTransport = useCallback(() => {
    if (device) {
      void stopTimeline(device);
    }
    stop();
  }, [device, stop]);

  const seekTransport = useCallback(
    (timeSeconds: number) => {
      if (!device) {
        syncTransportState({
          currentTime: timeSeconds,
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      void seekTimeline(device, timeSeconds);
      syncTransportState({
        currentTime: timeSeconds,
        isPlaying,
        transportActive: true,
        transportPlaybackState: isPlaying ? "playing" : "paused",
      });
    },
    [device, isPlaying, syncTransportState],
  );

  const setLoopTransport = useCallback(
    (enabled: boolean) => {
      setLoop(enabled);
      if (device) {
        void setTimelineLoop(device, enabled);
      }
    },
    [device, setLoop],
  );

  const setSpeedTransport = useCallback(
    (multiplier: number) => {
      setPlaySpeed(multiplier);
      if (device) {
        void setTimelineSpeed(device, multiplier);
      }
    },
    [device, setPlaySpeed],
  );

  const stepTransport = useCallback(
    (deltaSeconds = ANIMATION_STEP_SECONDS) => {
      if (!device) {
        syncTransportState({
          currentTime: nextStepTime({
            baseTime: currentTime,
            deltaSeconds,
            durationSeconds: 0,
          }),
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      const player = timelinePlayer(device);
      const nextTime = nextStepTime({
        baseTime: player?.time ?? currentTime,
        deltaSeconds,
        durationSeconds: player?.duration ?? 0,
      });
      void pauseTimeline(device);
      void seekTimeline(device, nextTime);
      syncTransportState({
        currentTime: nextTime,
        isPlaying: false,
        transportActive: true,
        transportPlaybackState: "paused",
      });
    },
    [currentTime, device, syncTransportState],
  );

  return {
    active: device !== null,
    play: playTransport,
    pause: pauseTransport,
    stop: stopTransport,
    seek: seekTransport,
    setLoop: setLoopTransport,
    setSpeed: setSpeedTransport,
    step: stepTransport,
  };
}

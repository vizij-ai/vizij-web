import { useEffect, useMemo } from "react";
import {
  ANIMATION_PLAYERS_PATH,
  decodePlayerStates,
  type Animation,
  type PlayerState,
  type Runtime,
} from "@vizij/runtime";
import { useVizijRuntime, useVizijValues } from "@vizij/runtime-react";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

const u32 = (n: number) => ({ u32: n });

/**
 * The animation module's transport for one of the face's animations: each
 * loads with the face on a player named after it, its instance at weight 0
 * and stopped, and every call goes through the module's declared functions.
 */
function transport(
  runtime: Runtime,
  player: PlayerState,
  animation: Animation,
) {
  const id = { player: u32(player.player) };
  const instance = player.instances[0];
  const weight = (value: number) =>
    instance
      ? runtime.invoke("set_weight", {
          ...id,
          instance: u32(instance.instance),
          weight: { f32: value },
        })
      : Promise.resolve();
  return {
    play: async () => {
      await runtime.invoke("seek", { ...id, time_ns: { u64: 0 } });
      await weight(1);
      await runtime.invoke("play", id);
    },
    pause: () => runtime.invoke("pause", id),
    // A stopped player still writes its first frame at its weight: weight 0
    // lets go of the keys, and `reset_keys` returns them to rest.
    stop: async () => {
      await runtime.invoke("stop", id);
      await weight(0);
      await runtime.invoke("reset_keys", {
        keys: {
          strs: animation.tracks.map((track) => runtime.path(track.channel)),
        },
      });
    },
    setLoop: (loop: boolean) =>
      runtime.invoke("set_loop", { ...id, mode: loop ? "loop" : "once" }),
    seek: (seconds: number) =>
      runtime.invoke("seek", {
        ...id,
        time_ns: { u64: Math.round(seconds * 1e9) },
      }),
  };
}

export function AnimationPanel() {
  const { runtime, description } = useVizijRuntime();
  const {
    state: {
      playbackSelection: { animationId },
    },
    setSelectedAnimation,
  } = useAppState();
  const animations = useMemo(
    () => description?.animations ?? [],
    [description],
  );
  const playersValue = useVizijValues([ANIMATION_PLAYERS_PATH])[
    ANIMATION_PLAYERS_PATH
  ];
  const players = useMemo(
    () =>
      new Map(
        decodePlayerStates(playersValue).map((player) => [player.name, player]),
      ),
    [playersValue],
  );

  useEffect(() => {
    if (!animations.length) {
      setSelectedAnimation(null);
      return;
    }
    if (
      !animationId ||
      !animations.some((animation) => animation.id === animationId)
    ) {
      setSelectedAnimation(animations[0]!.id);
    }
  }, [animationId, animations, setSelectedAnimation]);

  const selected =
    animations.find((animation) => animation.id === animationId) ??
    animations[0] ??
    null;
  const player = selected ? players.get(selected.id) : undefined;
  const controls =
    runtime && selected && player ? transport(runtime, player, selected) : null;
  const looping = player ? player.loopMode !== "once" : true;
  const duration = player?.duration ?? selected?.duration ?? 0;

  const runtimeExamples = useMemo(() => {
    if (!selected) {
      return [];
    }
    const seekTime = Number(
      Math.min(duration, Math.max(0.25, duration * 0.35)).toFixed(2),
    );
    return [
      {
        label: selected.name ?? selected.id,
        code: [
          "const players = decodePlayerStates(",
          "  runtime.readValues([ANIMATION_PLAYERS_PATH])[ANIMATION_PLAYERS_PATH],",
          ");",
          `const { player, instances } = players.find((p) => p.name === ${JSON.stringify(selected.id)})!;`,
          "const id = { player: { u32: player } };",
          'await runtime.invoke("set_weight", { ...id, instance: { u32: instances[0].instance }, weight: { f32: 1 } });',
          'await runtime.invoke("play", id);',
          'await runtime.invoke("pause", id);',
          `await runtime.invoke("seek", { ...id, time_ns: { u64: ${seekTime * 1e9} } });`,
          'await runtime.invoke("set_loop", { ...id, mode: "once" });',
          'await runtime.invoke("stop", id);',
        ].join("\n"),
      },
    ];
  }, [duration, selected]);

  return (
    <section className="panel" aria-labelledby="animation-panel-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Embedded clips</p>
          <h2 id="animation-panel-title">Animations</h2>
        </div>
      </header>
      <div className="panel-body">
        {animations.length === 0 ? (
          <div className="panel-empty">
            This bundle does not include embedded clips.
          </div>
        ) : (
          <>
            <div className="list-stack">
              {animations.map((animation) => {
                const state = players.get(animation.id)?.state ?? "stopped";
                return (
                  <button
                    key={animation.id}
                    type="button"
                    className={`select-row ${animation.id === selected?.id ? "is-active" : ""}`}
                    onClick={() => setSelectedAnimation(animation.id)}
                  >
                    <span>
                      <strong>{animation.name ?? animation.id}</strong>
                      <small>{animation.id}</small>
                    </span>
                    <span data-testid={`animation-state-${animation.id}`}>
                      {state}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <div className="transport-card">
                <div className="transport-header">
                  <div>
                    <strong>{selected.name ?? selected.id}</strong>
                    <small>{selected.tracks.length} tracks</small>
                  </div>
                  <span className="soft-badge">{duration.toFixed(2)}s</span>
                </div>
                <div className="transport-actions">
                  <IconButton
                    icon="play"
                    label={`Play ${selected.name ?? selected.id}`}
                    disabled={!controls}
                    onClick={() => void controls?.play()}
                  />
                  <IconButton
                    icon="pause"
                    label={`Pause ${selected.name ?? selected.id}`}
                    disabled={!controls}
                    onClick={() => void controls?.pause()}
                  />
                  <IconButton
                    icon="stop"
                    label={`Stop ${selected.name ?? selected.id}`}
                    disabled={!controls}
                    onClick={() => void controls?.stop()}
                  />
                  <IconButton
                    icon="loop"
                    label={`${looping ? "Disable" : "Enable"} loop for ${selected.name ?? selected.id}`}
                    active={looping}
                    disabled={!controls}
                    onClick={() => void controls?.setLoop(!looping)}
                  />
                  <span className="transport-meta">
                    Loop {looping ? "On" : "Off"}
                  </span>
                </div>
                <label className="range-field">
                  <span>Seek</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={player?.time ?? 0}
                    disabled={!controls}
                    onChange={(event) =>
                      void controls?.seek(Number(event.target.value))
                    }
                  />
                  <output>{(player?.time ?? 0).toFixed(2)}s</output>
                </label>
              </div>
            ) : null}
            <RuntimeApiDisclosure
              title="Runtime clip calls"
              description="The animation module's transport, called by name on the face's Runtime."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}

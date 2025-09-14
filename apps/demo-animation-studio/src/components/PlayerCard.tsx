import React, { useCallback, useMemo, useState } from "react";
import { useAnimation } from "@vizij/animation-react";
import type {
  AnimationInfo,
  PlayerInfo,
  InstanceInfo,
  Value,
} from "@vizij/animation-wasm";
import Timeline, { InstanceSpan } from "./Timeline";
import ChartsView from "./OutputsView/ChartsView";

type Sample = { t: number; v: Value };
type History = Record<string, Sample[]>;

const instColors = [
  "rgba(96,165,250,0.35)", // blue
  "rgba(52,211,153,0.35)", // green
  "rgba(251,191,36,0.35)", // amber
  "rgba(244,114,182,0.35)", // pink
  "rgba(34,211,238,0.35)", // cyan
  "rgba(167,139,250,0.35)", // violet
  "rgba(248,113,113,0.35)", // red
  "rgba(56,189,248,0.35)", // sky
];

function usePlayerValue(
  player: number | string,
  key: string,
): Value | undefined {
  const { subscribeToPlayerKey, getPlayerKeySnapshot } = useAnimation() as any;
  const subscribe = useCallback(
    (cb: () => void) => subscribeToPlayerKey(player, key, cb),
    [subscribeToPlayerKey, player, key],
  );
  const getSnapshot = useCallback(
    () => getPlayerKeySnapshot(player, key),
    [getPlayerKeySnapshot, player, key],
  );
  // Use React's useSyncExternalStore indirectly via our provider? For brevity, poll on render by using a state bump
  // In practice, consumer can wrap with useSyncExternalStore too. Here we reuse provider's subscribe/get directly:
  // We'll implement a tiny wrapper:
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [_, setTick] = useState(0);
  React.useEffect(() => {
    const unsub = subscribe(() => setTick((x) => x + 1));
    return unsub;
  }, [subscribe]);
  return getSnapshot();
}

function PlayerValueCell({
  playerId,
  keyName,
}: {
  playerId: number;
  keyName: string;
}) {
  const v = usePlayerValue(playerId, keyName);
  let display: React.ReactNode = "—";
  if (v) {
    switch (v.type) {
      case "Scalar":
        display = v.data.toFixed(3);
        break;
      case "Bool":
        display = v.data ? "true" : "false";
        break;
      case "Vec2":
      case "Vec3":
      case "Vec4":
      case "Color":
      case "Quat":
        display = String(v.data.map((x: number) => x.toFixed(3)).join(", "));
        break;
      case "Transform":
        display = JSON.stringify(v.data);
        break;
      case "Text":
        display = String(v.data);
        break;
    }
  }
  return (
    <div
      style={{
        background: "#1a1d21",
        border: "1px solid #2a2d31",
        borderRadius: 6,
        padding: 8,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
        {keyName}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>
        {display}
      </div>
    </div>
  );
}

function KVV({ playerId, keys }: { playerId: number; keys: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 8,
      }}
    >
      {keys.map((k) => (
        <PlayerValueCell key={k} playerId={playerId} keyName={k} />
      ))}
    </div>
  );
}

export default function PlayerCard({
  player,
  animations,
  resolvedKeys,
  history,
  historyWindowSec,
}: {
  player: PlayerInfo;
  animations: AnimationInfo[];
  resolvedKeys: string[];
  history: History;
  historyWindowSec: number;
}) {
  const animApi = useAnimation() as any;
  const [speed, setSpeed] = useState<number>(player.speed ?? 1);
  const [seekTime, setSeekTime] = useState<number>(player.time ?? 0);
  const [loop, setLoop] = useState<"Once" | "Loop" | "PingPong">(
    player.loop_mode as any,
  );
  const [winStart, setWinStart] = useState<number>(player.start_time ?? 0);
  const [winEnd, setWinEnd] = useState<number | "">(player.end_time ?? "");

  const instances: InstanceInfo[] = useMemo(
    () => animApi.listInstances(player.id),
    [animApi, player.id],
  );
  const animById = useMemo(
    () => Object.fromEntries(animations.map((a) => [a.id, a])),
    [animations],
  );
  const playerKeys: string[] = useMemo(
    () => animApi.listPlayerKeys?.(player.id) ?? [],
    [animApi, player.id],
  );

  const spans: InstanceSpan[] = useMemo(() => {
    return instances.map((ii, idx) => {
      const a = animById[ii.animation];
      const dur = a ? a.duration_ms / 1000 : 0;
      const ts = Math.max(Math.abs(ii.cfg.time_scale ?? 1), 1e-6);
      const start = ii.cfg.start_offset ?? 0;
      const end = start + dur * ts;
      return {
        id: ii.id,
        start,
        end,
        color: instColors[idx % instColors.length],
        label: a?.name
          ? `${a.name} #${ii.id}`
          : `anim_${ii.animation} #${ii.id}`,
      };
    });
  }, [instances, animById]);

  const onSeekTimeline = useCallback(
    (t: number) => {
      setSeekTime(t);
      animApi.step(0, {
        player_cmds: [{ Seek: { player: player.id, time: t } }],
      });
      animApi.step(1 / 120);
    },
    [animApi, player.id],
  );

  const send = (cmd: any) => {
    animApi.step(0, { player_cmds: [cmd] });
    animApi.step(1 / 120);
  };

  const addInstance = (animId: number) => {
    animApi.addInstances?.([
      {
        playerName: player.name,
        animIndexOrId: animId,
        cfg: { enabled: true, weight: 1, time_scale: 1, start_offset: 0 },
      },
    ]);
  };

  const removeInstance = (instId: number) => {
    animApi.removeInstances?.([{ playerName: player.name, instId }]);
  };

  // Filter history records for this player: keys stored as `${playerId}:${key}`
  const filteredHistory: History = useMemo(() => {
    const pref = `${player.id}:`;
    const out: History = {};
    for (const [k, arr] of Object.entries(history)) {
      if (!k.startsWith(pref)) continue;
      const keyOnly = k.substring(pref.length);
      if (playerKeys.includes(keyOnly)) {
        out[keyOnly] = arr;
      }
    }
    return out;
  }, [history, player.id, playerKeys]);

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: 12,
        border: "1px solid #2a2d31",
        background: "#121417",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <b>{player.name}</b>
        <span style={{ opacity: 0.7, fontSize: 12 }}>
          state: {player.state} • t={player.time.toFixed(2)}s • len=
          {player.length.toFixed(2)}s
        </span>
        <button
          style={{ marginLeft: "auto" }}
          onClick={() => animApi.removePlayer(player.id)}
        >
          Remove Player
        </button>
      </div>

      <Timeline
        length={player.length}
        time={player.time}
        windowStart={player.start_time}
        windowEnd={player.end_time ?? undefined}
        instances={spans}
        onSeek={onSeekTimeline}
        height={40}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => send({ Play: { player: player.id } })}>
          Play
        </button>
        <button onClick={() => send({ Pause: { player: player.id } })}>
          Pause
        </button>
        <button onClick={() => send({ Stop: { player: player.id } })}>
          Stop
        </button>

        <label>
          Speed:&nbsp;
          <input
            type="number"
            step="0.1"
            min="0"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
          &nbsp;
          <button
            onClick={() => send({ SetSpeed: { player: player.id, speed } })}
          >
            Apply
          </button>
        </label>

        <label>
          Loop:&nbsp;
          <select value={loop} onChange={(e) => setLoop(e.target.value as any)}>
            <option value="Once">Once</option>
            <option value="Loop">Loop</option>
            <option value="PingPong">PingPong</option>
          </select>
          &nbsp;
          <button
            onClick={() =>
              send({ SetLoopMode: { player: player.id, mode: loop } })
            }
          >
            Apply
          </button>
        </label>

        <label>
          Seek (s):&nbsp;
          <input
            type="number"
            step="0.1"
            value={seekTime}
            onChange={(e) => setSeekTime(Number(e.target.value))}
            style={{ width: 90 }}
          />
          &nbsp;
          <button
            onClick={() =>
              send({ Seek: { player: player.id, time: seekTime } })
            }
          >
            Apply
          </button>
        </label>

        <label>
          Window (s):&nbsp;
          <input
            type="number"
            step="0.1"
            value={winStart}
            onChange={(e) => setWinStart(Number(e.target.value))}
            style={{ width: 90 }}
          />
          &nbsp;→&nbsp;
          <input
            type="number"
            step="0.1"
            value={winEnd}
            onChange={(e) =>
              setWinEnd(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={{ width: 90 }}
          />
          &nbsp;
          <button
            onClick={() =>
              send({
                SetWindow: {
                  player: player.id,
                  start_time: winStart,
                  end_time: winEnd === "" ? null : Number(winEnd),
                },
              })
            }
          >
            Apply
          </button>
        </label>
      </div>

      <section style={{ display: "grid", gap: 8 }}>
        <b>Instances</b>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, opacity: 0.75 }}>Add instance:</span>
          <select
            onChange={(e) => {
              const id = Number(e.target.value);
              if (!Number.isFinite(id)) return;
              addInstance(id);
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Select animation…
            </option>
            {animations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? `anim_${a.id}`} ({(a.duration_ms / 1000).toFixed(2)}
                s)
              </option>
            ))}
          </select>
        </div>
        {instances.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No instances</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {instances.map((ii) => (
              <div
                key={ii.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  background: "#16191d",
                  border: "1px solid #2a2d31",
                  borderRadius: 6,
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  inst #{ii.id} • anim {ii.animation}
                </div>
                <label>
                  weight:&nbsp;
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    defaultValue={ii.cfg.weight}
                    style={{ width: 70 }}
                    onBlur={(e) =>
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          weight: Number(e.target.value),
                        },
                      ])
                    }
                  />
                </label>
                <label>
                  time_scale:&nbsp;
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={ii.cfg.time_scale}
                    style={{ width: 70 }}
                    onBlur={(e) =>
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          time_scale: Number(e.target.value),
                        },
                      ])
                    }
                  />
                </label>
                <label>
                  start_offset:&nbsp;
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={ii.cfg.start_offset}
                    style={{ width: 90 }}
                    onBlur={(e) =>
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          start_offset: Number(e.target.value),
                        },
                      ])
                    }
                  />
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <input
                    type="checkbox"
                    defaultChecked={ii.cfg.enabled}
                    onChange={(e) =>
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          enabled: e.target.checked,
                        },
                      ])
                    }
                  />
                  <span style={{ fontSize: 12, opacity: 0.85 }}>enabled</span>
                </label>
                <button
                  style={{ marginLeft: "auto" }}
                  onClick={() => removeInstance(ii.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <b>Latest Values</b>
        <KVV playerId={player.id} keys={playerKeys} />
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <b>Charts (last {historyWindowSec}s)</b>
        <ChartsView history={filteredHistory} windowSec={historyWindowSec} />
      </section>
    </div>
  );
}

import React, { useCallback, useMemo, useState } from "react";
import { useAnimation } from "@vizij/animation-react";
import type {
  AnimationInfo,
  PlayerInfo,
  InstanceInfo,
  Value,
  StoredAnimation,
} from "@vizij/animation-wasm";
import Timeline, { InstanceSpan, TimelineMarker } from "./Timeline";
import BakedAnimationPlot from "./BakedAnimationPlot";
import ChartsView from "./OutputsView/ChartsView";

type Sample = { t: number; v: Value };
type HistoryEntry = { value: Sample[]; derivative: Sample[] };
type History = Record<string, HistoryEntry>;

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
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampStamp = (stamp: number) => clamp01(stamp);

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

function usePlayerDerivative(
  player: number | string,
  key: string,
): Value | undefined {
  const { subscribeToPlayerDerivative, getPlayerDerivativeSnapshot } =
    useAnimation() as any;

  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof subscribeToPlayerDerivative !== "function") return () => {};
      return subscribeToPlayerDerivative(player, key, cb);
    },
    [subscribeToPlayerDerivative, player, key],
  );

  const getSnapshot = useCallback(() => {
    if (typeof getPlayerDerivativeSnapshot !== "function") return undefined;
    return getPlayerDerivativeSnapshot(player, key);
  }, [getPlayerDerivativeSnapshot, player, key]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [_, setTick] = useState(0);
  React.useEffect(() => {
    const unsub = subscribe(() => setTick((x) => x + 1));
    return unsub;
  }, [subscribe]);

  return getSnapshot();
}

function formatNumericArray(data: readonly number[] | number[]): string {
  return data
    .map((x) => (Number.isFinite(x) ? Number(x).toFixed(3) : String(x)))
    .join(", ");
}

function formatValue(value: Value | undefined): string {
  if (!value) return "—";
  const { type, data } = value as Value & { data: any };

  switch (type) {
    case "Scalar":
    case "Float":
      return Number.isFinite(data) ? Number(data).toFixed(3) : String(data);
    case "Bool":
      return data ? "true" : "false";
    case "Vec2":
    case "Vec3":
    case "Vec4":
    case "Color":
    case "ColorRgba":
    case "Quat":
      return Array.isArray(data) ? formatNumericArray(data) : String(data);
    case "Transform": {
      if (data && typeof data === "object") {
        const pos = data.translation ?? data.pos;
        const rot = data.rotation ?? data.rot;
        const scale = data.scale;
        const lines: string[] = [];
        if (Array.isArray(pos)) lines.push(`pos: ${formatNumericArray(pos)}`);
        if (Array.isArray(rot)) lines.push(`rot: ${formatNumericArray(rot)}`);
        if (Array.isArray(scale))
          lines.push(`scale: ${formatNumericArray(scale)}`);
        return lines.length > 0 ? lines.join("\n") : JSON.stringify(data);
      }
      return JSON.stringify(data);
    }
    case "Text":
      return String(data);
    default:
      return JSON.stringify(data ?? null);
  }
}

function PlayerValueCell({
  playerId,
  keyName,
}: {
  playerId: number;
  keyName: string;
}) {
  const value = usePlayerValue(playerId, keyName);
  const derivative = usePlayerDerivative(playerId, keyName);
  const valueDisplay = formatValue(value);
  const derivativeDisplay = formatValue(derivative);
  return (
    <div
      style={{
        background: "#1a1d21",
        border: "1px solid #2a2d31",
        borderRadius: 6,
        padding: 8,
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
        {keyName}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>Value</div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {valueDisplay}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
        Derivative
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          color: "#9ca3af",
        }}
      >
        {derivativeDisplay}
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
  animationSourcesById,
}: {
  player: PlayerInfo;
  animations: AnimationInfo[];
  resolvedKeys: string[];
  history: History;
  historyWindowSec: number;
  animationSourcesById?:
    | Map<number, StoredAnimation>
    | Record<number, StoredAnimation>;
}) {
  const animApi = useAnimation() as any;
  const [speed, setSpeed] = useState<number>(player.speed ?? 1);
  const [seekTime, setSeekTime] = useState<number>(player.time ?? 0);
  const [loop, setLoop] = useState<"Once" | "Loop" | "PingPong">(
    player.loop_mode as any,
  );
  const [winStart, setWinStart] = useState<number>(player.start_time ?? 0);
  const [winEnd, setWinEnd] = useState<number | "">(player.end_time ?? "");
  const [instanceRevision, bumpInstanceRevision] = useState(0);

  const refreshInstances = useCallback(() => {
    bumpInstanceRevision((v) => v + 1);
  }, []);

  const instances: InstanceInfo[] = useMemo(() => {
    if (typeof animApi.listInstances !== "function") return [];
    return animApi.listInstances(player.id) ?? [];
  }, [
    animApi,
    player.id,
    player.start_time,
    player.end_time,
    player.length,
    player.state,
    instanceRevision,
  ]);
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
      const durationSec = a ? (a.duration_ms ?? 0) / 1000 : 0;
      const offset = Number(ii.cfg.start_offset ?? 0) || 0;
      const rawScale = Number(ii.cfg.time_scale ?? 1);
      const scale =
        Number.isFinite(rawScale) && Math.abs(rawScale) > 1e-6 ? rawScale : 1;
      const absScale = Math.abs(scale);
      const span = durationSec * absScale;
      const start = scale >= 0 ? offset : offset - span;
      const end = scale >= 0 ? offset + span : offset;
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

  const markers: TimelineMarker[] = useMemo(() => {
    const map: TimelineMarker[] = [];
    const srcMap:
      | Map<number, StoredAnimation>
      | Record<number, StoredAnimation>
      | undefined = animationSourcesById;
    instances.forEach((ii, idx) => {
      const offset = Number(ii.cfg.start_offset ?? 0) || 0;
      const rawScale = Number(ii.cfg.time_scale ?? 1);
      const scale =
        Number.isFinite(rawScale) && Math.abs(rawScale) > 1e-6 ? rawScale : 1;
      const absScale = Math.abs(scale);
      const direction = scale >= 0 ? 1 : -1;
      const animSource =
        srcMap instanceof Map
          ? srcMap.get(ii.animation)
          : srcMap
            ? (srcMap as Record<number, StoredAnimation>)[ii.animation]
            : undefined;
      const durationMs =
        (animSource as any)?.duration ??
        animById[ii.animation]?.duration_ms ??
        0;
      const durationSec = Number(durationMs) / 1000;
      if (!Number.isFinite(durationSec) || durationSec <= 0) return;
      const colorFallback = instColors[idx % instColors.length];
      (animSource as any).tracks?.forEach((track: any, trackIdx: number) => {
        const trackColor = track.settings?.color ?? colorFallback;
        const baseLabel =
          track.name ?? track.animatableId ?? `track_${trackIdx}`;
        (track.points ?? []).forEach((pt: any, pointIdx: number) => {
          const stamp = Number(pt.stamp ?? 0);
          if (!Number.isFinite(stamp)) return;
          const clipTime = clampStamp(stamp) * durationSec;
          const relative = direction >= 0 ? clipTime : durationSec - clipTime;
          const t = offset + relative * absScale;
          map.push({
            id: `${ii.id}:${track.id ?? trackIdx}:${pt.id ?? pointIdx}`,
            time: t,
            color: trackColor,
            label: `${baseLabel}`,
          });
        });
      });
    });
    return map;
  }, [instances, animationSourcesById, animById]);

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
    refreshInstances();
  };

  const removeInstance = (instId: number) => {
    animApi.removeInstances?.([{ playerName: player.name, instId }]);
    refreshInstances();
  };

  // Filter history records for this player: keys stored as `${playerId}:${key}`
  const filteredHistory: History = useMemo(() => {
    const pref = `${player.id}:`;
    const out: History = {};
    for (const [k, entry] of Object.entries(history)) {
      if (!k.startsWith(pref)) continue;
      const keyOnly = k.substring(pref.length);
      if (!playerKeys.includes(keyOnly)) continue;
      out[keyOnly] = {
        value: entry.value.slice(),
        derivative: entry.derivative.slice(),
      };
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
        markers={markers}
        onSeek={onSeekTimeline}
        height={40}
        startTime={player.start_time ?? 0}
      />

      <BakedAnimationPlot
        playerLength={player.length}
        playerStartTime={player.start_time ?? 0}
        playheadTime={player.time}
        instances={instances}
        animationSourcesById={animationSourcesById}
        fallbackColors={instColors}
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
                    onBlur={(e) => {
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          weight: Number(e.target.value),
                        },
                      ]);
                      refreshInstances();
                    }}
                  />
                </label>
                <label>
                  time_scale:&nbsp;
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={ii.cfg.time_scale}
                    style={{ width: 70 }}
                    onBlur={(e) => {
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          time_scale: Number(e.target.value),
                        },
                      ]);
                      refreshInstances();
                    }}
                  />
                </label>
                <label>
                  start_offset:&nbsp;
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={ii.cfg.start_offset}
                    style={{ width: 90 }}
                    onBlur={(e) => {
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          start_offset: Number(e.target.value),
                        },
                      ]);
                      refreshInstances();
                    }}
                  />
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <input
                    type="checkbox"
                    defaultChecked={ii.cfg.enabled}
                    onChange={(e) => {
                      animApi.updateInstances([
                        {
                          player: player.id as any,
                          inst: ii.id as any,
                          enabled: e.target.checked,
                        },
                      ]);
                      refreshInstances();
                    }}
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

import React, { useEffect, useMemo, useState } from "react";
import { AnimationProvider, useAnimation } from "@vizij/animation-react";
import presets from "./presets";
import AnimationsPanel from "./components/AnimationsPanel";
import PlayersPanel, { InstanceSpec } from "./components/PlayersPanel";
import EventsLog from "./components/EventsLog";
import LatestValues from "./components/OutputsView/LatestValues";
import ChartsView from "./components/OutputsView/ChartsView";
import PlayerCard from "./components/PlayerCard";
import ConfigPanel from "./components/ConfigPanel";
import PrebindPanel, {
  PrebindRule,
  makeResolver,
} from "./components/PrebindPanel";
import SessionPanel, { SessionState } from "./components/SessionPanel";
import type {
  StoredAnimation,
  Config,
  CoreEvent,
  Outputs,
  Value,
} from "@vizij/animation-wasm";
import { init, abi_version } from "@vizij/animation-wasm";
import "./styles/app.css";

type Sample = { t: number; v: Value };
type History = Record<string, Sample[]>;

/* -----------------------------------------------------------
   Engine status and throttle (MVP)
----------------------------------------------------------- */

function EngineBar({
  updateHz,
  setUpdateHz,
}: {
  updateHz: number;
  setUpdateHz: (hz: number) => void;
}) {
  // console.log("Setting up engine bar");
  const [abi, setAbi] = useState<number | null>(null);
  const [initing, setIniting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await init();
        if (cancelled) return;
        const v = Number(abi_version());
        setAbi(Number.isFinite(v) ? v : null);
      } finally {
        if (!cancelled) setIniting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "6px 12px",
        borderBottom: "1px solid #2a2d31",
        background: "#14171a",
      }}
    >
      <b>Engine</b>
      <div style={{ opacity: 0.8, fontSize: 12 }}>
        ABI: {abi ?? "—"} {initing ? "(init…)" : ""}
      </div>
      <label style={{ marginLeft: "auto" }}>
        <span style={{ opacity: 0.75, fontSize: 12, marginRight: 6 }}>
          updateHz
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={updateHz}
          onChange={(e) =>
            setUpdateHz(Math.max(0, Number(e.target.value) || 0))
          }
          style={{ width: 80 }}
        />
      </label>
    </div>
  );
}

/* -----------------------------------------------------------
   Transport controls (basic MVP)
----------------------------------------------------------- */

function TransportBar() {
  // console.log("Setting up transport bar");
  const { ready, players, step } = useAnimation();
  const playerNames = useMemo(() => Object.keys(players), [players]);
  const [selected, setSelected] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(1.0);
  const [loop, setLoop] = useState<"Once" | "Loop" | "PingPong">("Loop");
  const [seekTime, setSeekTime] = useState<number>(0);
  const [winStart, setWinStart] = useState<number>(0);
  const [winEnd, setWinEnd] = useState<number | "">("");

  // Auto-select a player when list changes:
  // - If none selected, pick the last added (end of list)
  // - If current selection no longer exists, pick the last available
  useEffect(() => {
    if (playerNames.length === 0) {
      if (selected) setSelected(null);
      return;
    }
    const exists = selected ? playerNames.includes(selected) : false;
    if (!selected || !exists) {
      setSelected(playerNames[playerNames.length - 1]);
    }
  }, [playerNames, selected]);

  const pid = selected ? players[selected] : undefined;

  const send = (cmd: any) => {
    if (!ready || pid === undefined) return;
    // Apply command, then advance a tiny dt to force Outputs for charts/history
    step(0, { player_cmds: [cmd] });
    step(1 / 120);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid #2a2d31",
      }}
    >
      <b>Transport</b>
      <label>
        Player:&nbsp;
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          disabled={!ready || playerNames.length === 0}
        >
          {playerNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={() => send({ Play: { player: pid! } })}
        disabled={!ready || pid === undefined}
      >
        Play
      </button>
      <button
        onClick={() => send({ Pause: { player: pid! } })}
        disabled={!ready || pid === undefined}
      >
        Pause
      </button>
      <button
        onClick={() => send({ Stop: { player: pid! } })}
        disabled={!ready || pid === undefined}
      >
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
          disabled={!ready || pid === undefined}
        />
        &nbsp;
        <button
          onClick={() => send({ SetSpeed: { player: pid!, speed } })}
          disabled={!ready || pid === undefined}
        >
          Apply
        </button>
      </label>

      <label>
        Loop:&nbsp;
        <select
          value={loop}
          onChange={(e) => setLoop(e.target.value as any)}
          disabled={!ready || pid === undefined}
        >
          <option value="Once">Once</option>
          <option value="Loop">Loop</option>
          <option value="PingPong">PingPong</option>
        </select>
        &nbsp;
        <button
          onClick={() => send({ SetLoopMode: { player: pid!, mode: loop } })}
          disabled={!ready || pid === undefined}
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
          disabled={!ready || pid === undefined}
        />
        &nbsp;
        <button
          onClick={() => send({ Seek: { player: pid!, time: seekTime } })}
          disabled={!ready || pid === undefined}
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
          disabled={!ready || pid === undefined}
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
          disabled={!ready || pid === undefined}
        />
        &nbsp;
        <button
          onClick={() =>
            send({
              SetWindow: {
                player: pid!,
                start_time: winStart,
                end_time: winEnd === "" ? null : Number(winEnd),
              },
            })
          }
          disabled={!ready || pid === undefined}
        >
          Apply
        </button>
      </label>

      <div style={{ marginLeft: "auto", opacity: 0.7 }}>
        {ready ? "Engine: ready" : "Engine: initializing…"}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
   Layout scaffolding (Toolbar + Panels + Main)
----------------------------------------------------------- */

function StudioShell({
  animations,
  setAnimations,
  instances,
  setInstances,
  updateHz,
  setUpdateHz,
  engineCfg,
  setEngineCfg,
  events,
  history,
  historyWindowSec,
  setHistoryWindowSec,
  rules,
  setRules,
}: {
  animations: StoredAnimation[];
  setAnimations: (next: StoredAnimation[]) => void;
  instances: InstanceSpec[];
  setInstances: (next: InstanceSpec[]) => void;
  updateHz: number;
  setUpdateHz: (hz: number) => void;
  engineCfg: Config | undefined;
  setEngineCfg: (cfg: Config | undefined) => void;
  events: { ts: number; event: CoreEvent }[];
  history: History;
  historyWindowSec: number;
  setHistoryWindowSec: (n: number) => void;
  rules: PrebindRule[];
  setRules: (r: PrebindRule[]) => void;
}) {
  // console.log("Setting up studio shell");
  const { canonicalKeys, resolvedKeys } = useMemo(() => {
    const set = new Set<string>();
    for (const a of animations) {
      const tracks: any[] = (a as any).tracks || [];
      for (const t of tracks) {
        const id = (t && (t as any).animatableId) as string | undefined;
        if (typeof id === "string") set.add(id);
      }
    }
    const canonical = Array.from(set);
    const resolver = makeResolver(rules);
    const resolved = Array.from(
      new Set(canonical.map((k) => String(resolver(k)))),
    );
    return { canonicalKeys: canonical, resolvedKeys: resolved };
  }, [animations, rules]);

  // Authoritative state from provider
  const animApi = useAnimation() as any;
  const playersInfo = animApi.listPlayers?.() ?? [];
  const animationsInfo = animApi.listAnimations?.() ?? [];
  const [newPlayerName, setNewPlayerName] = useState<string>("");

  return (
    <div
      style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}
    >
      <EngineBar updateHz={updateHz} setUpdateHz={setUpdateHz} />
      <div className="app-grid">
        {/* Left Sidebar (placeholders) */}
        <div className="col-left">
          <ConfigPanel value={engineCfg} onChange={setEngineCfg} />
          <AnimationsPanel
            preset={presets as any}
            animations={animations}
            setAnimations={setAnimations}
          />
          {/* <PrebindPanel keys={canonicalKeys} rules={rules} setRules={setRules} /> */}
          <SessionPanel
            value={{
              animations,
              instances,
              engineCfg,
              rules,
              updateHz,
              historyWindowSec,
            }}
            onImport={(s: SessionState) => {
              setAnimations(s.animations);
              setInstances(s.instances);
              setEngineCfg(s.engineCfg);
              setRules(s.rules);
              setUpdateHz(s.updateHz);
              setHistoryWindowSec(s.historyWindowSec);
            }}
          />
        </div>

        {/* Main Content */}
        <div
          className="col-main"
          style={{
            background: "#121417",
            border: "1px solid #2a2d31",
            borderRadius: 8,
            padding: 8,
          }}
        >
          {/* Add Player */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "8px 12px",
              marginBottom: 8,
              background: "#16191d",
              border: "1px solid #2a2d31",
              borderRadius: 6,
            }}
          >
            <b style={{ marginRight: 8 }}>Add Player</b>
            <input
              placeholder="player name"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              onClick={() => {
                const name = newPlayerName.trim();
                if (!name) return;
                animApi.addPlayer?.(name);
                setNewPlayerName("");
              }}
            >
              Add
            </button>
          </div>

          {playersInfo.length === 0 ? (
            <div style={{ opacity: 0.7, fontSize: 12, padding: 12 }}>
              No players yet. Use "Add Player" above or create an instance to
              auto-create one.
            </div>
          ) : (
            playersInfo.map((p: any) => (
              <div key={p.id} style={{ marginBottom: 12 }}>
                <PlayerCard
                  player={p}
                  animations={animationsInfo}
                  resolvedKeys={resolvedKeys}
                  history={history}
                  historyWindowSec={historyWindowSec}
                />
              </div>
            ))
          )}
          <div
            style={{
              padding: "0 12px 8px",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span style={{ opacity: 0.75, fontSize: 12 }}>
              History window (s):
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={historyWindowSec}
              onChange={(e) =>
                setHistoryWindowSec(Math.max(1, Number(e.target.value) || 1))
              }
              style={{ width: 80 }}
            />
          </div>
        </div>

        {/* Right Inspector (placeholder) */}
        <div
          className="col-right"
          style={{
            background: "#16191d",
            border: "1px solid #2a2d31",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <b>Inspector</b>
          <div style={{ opacity: 0.75, fontSize: 12 }}>
            MVP placeholder (focused target details)
          </div>
          <section style={{ marginTop: 12 }}>
            <EventsLog items={events} />
          </section>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
   App with provider
----------------------------------------------------------- */

export default function App() {
  // console.log("Setting up app");
  const [animations, setAnimations] = useState<StoredAnimation[]>([
    presets as any,
  ]);
  const [instances, setInstances] = useState<InstanceSpec[]>([
    {
      playerName: "default",
      animIndex: 0,
      cfg: { enabled: true, weight: 1, time_scale: 1, start_offset: 0 },
    },
  ]);
  const [updateHz, setUpdateHz] = useState<number>(30);
  const [engineCfg, setEngineCfg] = useState<Config | undefined>(undefined);
  const [events, setEvents] = useState<{ ts: number; event: CoreEvent }[]>([]);
  const [history, setHistory] = useState<History>({});
  const [historyWindowSec, setHistoryWindowSec] = useState<number>(10);
  const [rules, setRules] = useState<PrebindRule[]>([]);

  const initialAnimations = useMemo<StoredAnimation[]>(
    () => [presets as any],
    [],
  );
  const initialInstances = useMemo<InstanceSpec[]>(
    () => [
      {
        playerName: "default",
        animIndex: 0,
        cfg: { enabled: true, weight: 1, time_scale: 1, start_offset: 0 },
      },
    ],
    [],
  );

  return (
    <AnimationProvider
      animations={initialAnimations}
      instances={initialInstances}
      // prebind={makeResolver(rules)}
      autostart
      updateHz={updateHz}
      engineConfig={engineCfg}
      onOutputs={(out: Outputs) => {
        // Record per-key history for charts
        if (out && Array.isArray(out.changes) && out.changes.length > 0) {
          const tSec = performance.now() / 1000;
          const keep = Math.max(historyWindowSec, 10);
          console.log(out.changes);
          setHistory((prev: History) => {
            const next: History = { ...prev };
            for (const ch of out.changes) {
              const key = `${ch.player as unknown as number}:${ch.key}`;
              const arr = next[key] ? next[key].slice() : [];
              arr.push({ t: tSec, v: ch.value as Value });
              const cutoff = tSec - keep;
              // prune old samples
              let idx = 0;
              while (idx < arr.length && arr[idx].t < cutoff) idx++;
              next[key] = idx > 0 ? arr.slice(idx) : arr;
            }
            return next;
          });
        }

        // Collect events for EventsLog
        if (out && Array.isArray(out.events) && out.events.length > 0) {
          const ts = Date.now();
          setEvents((prev) => {
            const mapped = out.events.map((e: CoreEvent) => ({ ts, event: e }));
            const next = [...prev, ...mapped];
            // keep last 500 events
            return next.slice(-50);
          });
        }
      }}
    >
      <StudioShell
        animations={animations}
        setAnimations={setAnimations}
        instances={instances}
        setInstances={setInstances}
        updateHz={updateHz}
        setUpdateHz={setUpdateHz}
        engineCfg={engineCfg}
        setEngineCfg={setEngineCfg}
        events={events}
        history={history}
        historyWindowSec={historyWindowSec}
        setHistoryWindowSec={setHistoryWindowSec}
        rules={rules}
        setRules={setRules}
      />
    </AnimationProvider>
  );
}

import React, { useMemo, useState } from "react";
import { useAnimation } from "@vizij/animation-react";

export type InstanceSpec = {
  playerName: string;
  animIndex?: number;
  /** Runtime instance id returned from engine.addInstance; optional and populated when created via UI */
  instId?: number;
  cfg?: {
    weight?: number;
    time_scale?: number;
    start_offset?: number;
    enabled?: boolean;
  };
};

export default function PlayersPanel({
  instances,
  setInstances,
  animationsCount = 1,
  animationNames = [],
}: {
  instances: InstanceSpec[];
  setInstances: (next: InstanceSpec[]) => void;
  animationsCount?: number;
  animationNames?: string[];
}) {
  const animApi = useAnimation() as any;
  const { players } = animApi;
  const playerNames = useMemo(() => Object.keys(players), [players]);

  const [newPlayer, setNewPlayer] = useState<string>("");
  const [newAnimIndex, setNewAnimIndex] = useState<number>(0);

  const addInstance = () => {
    const name = newPlayer.trim();
    if (!name) return;
    const idx = Math.min(Math.max(0, Number(newAnimIndex) || 0), Math.max(0, animationsCount - 1));
    const spec = {
      playerName: name,
      animIndex: idx,
      cfg: {
        enabled: true,
        weight: 1,
        time_scale: 1,
        start_offset: 0,
      },
    } as InstanceSpec;

    // Add to runtime (does not reset engine or players)
    const created = (animApi.addInstances?.([
      { playerName: spec.playerName, animIndexOrId: spec.animIndex ?? 0, cfg: spec.cfg }
    ]) ?? []) as { playerName: string; instId: number }[];
    if (created && created.length > 0 && typeof created[0].instId === "number") {
      spec.instId = created[0].instId;
    }

    const next = [...instances, spec];
    setInstances(next);
    setNewPlayer("");
    setNewAnimIndex(0);
  };

  const removeInstance = (i: number) => {
    const next = instances.slice();
    next.splice(i, 1);
    setInstances(next);
  };

  const updateInstance = (i: number, patch: Partial<InstanceSpec>) => {
    const next = instances.slice();
    next[i] = { ...next[i], ...patch };
    setInstances(next);
  };

  const updateCfg = (
    i: number,
    patch: Partial<NonNullable<InstanceSpec["cfg"]>>
  ) => {
    const next = instances.slice();
    next[i] = { ...next[i], cfg: { ...next[i].cfg, ...patch } };
    setInstances(next);
  };

  const applyInstanceToRuntime = (i: number) => {
    const inst = instances[i];
    if (!inst) return;
    const pid = players[inst.playerName];
    if (pid === undefined) return;
    // Prefer the tracked instId if available; otherwise fall back to most recent for this player
    const instId = typeof inst.instId === "number"
      ? inst.instId
      : (() => {
          const ids: number[] = animApi.getInstances?.(inst.playerName) ?? [];
          return ids.length > 0 ? ids[ids.length - 1] : undefined;
        })();
    if (instId === undefined) return;
    animApi.updateInstances?.([
      {
        player: pid,
        inst: instId,
        weight: inst.cfg?.weight,
        time_scale: inst.cfg?.time_scale,
        start_offset: inst.cfg?.start_offset,
        enabled: inst.cfg?.enabled,
      },
    ]);
  };

  return (
    <section style={{ background: "#16191d", border: "1px solid #2a2d31", borderRadius: 8, padding: 10 }}>
      <b>Players & Instances</b>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>
        Create players and attach animation instances. Editing this list triggers a reload in the provider.
      </div>

      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 70, opacity: 0.75, fontSize: 12 }}>Name</span>
          <input
            placeholder="player name"
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
            style={{ flex: 1 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 70, opacity: 0.75, fontSize: 12 }}>Animation</span>
          <select
            value={newAnimIndex}
            onChange={(e) => setNewAnimIndex(Number(e.target.value))}
            style={{ flex: 1 }}
          >
            {Array.from({ length: animationsCount }).map((_, i) => (
              <option key={i} value={i}>
                {animationNames[i] ?? `anim_${i}`}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button onClick={addInstance}>Add</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>
          Tip: Use the Transport bar to select a player and control playback.
        </div>
        {instances.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 12 }}>No instances configured.</div>
        ) : (
          instances.map((inst, i) => (
            <div key={i} style={{ padding: 8, border: "1px solid #2a2d31", borderRadius: 6, background: "#1a1d21" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>Player</span><br />
                  <input
                    value={inst.playerName}
                    onChange={(e) => updateInstance(i, { playerName: e.target.value })}
                  />
                </label>
                <label>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>Animation</span><br />
                  <select
                    value={inst.animIndex ?? 0}
                    onChange={(e) => updateInstance(i, { animIndex: Number(e.target.value) })}
                  >
                    {Array.from({ length: animationsCount }).map((_, j) => (
                      <option key={j} value={j}>
                        {animationNames[j] ?? `anim_${j}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>Weight</span><br />
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={inst.cfg?.weight ?? 1}
                    onChange={(e) => updateCfg(i, { weight: Number(e.target.value) })}
                    style={{ width: 80 }}
                  />
                </label>
                <label>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>TimeScale</span><br />
                  <input
                    type="number"
                    step="0.1"
                    value={inst.cfg?.time_scale ?? 1}
                    onChange={(e) => updateCfg(i, { time_scale: Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </label>
                <label>
                  <span style={{ opacity: 0.75, fontSize: 12 }}>StartOffset</span><br />
                  <input
                    type="number"
                    step="0.1"
                    value={inst.cfg?.start_offset ?? 0}
                    onChange={(e) => updateCfg(i, { start_offset: Number(e.target.value) })}
                    style={{ width: 100 }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
                  <input
                    type="checkbox"
                    checked={inst.cfg?.enabled ?? true}
                    onChange={(e) => updateCfg(i, { enabled: e.target.checked })}
                  />
                  <span style={{ opacity: 0.8 }}>Enabled</span>
                </label>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button onClick={() => applyInstanceToRuntime(i)}>Apply To Runtime</button>
                  <button onClick={() => removeInstance(i)}>Remove</button>
                </div>
              </div>

              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
                Runtime players: {playerNames.length > 0 ? playerNames.join(", ") : "(none created yet)"}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* Minimal local shim for "animation-player" to satisfy build and basic demo playback.
   This wraps a simple JS engine that supports:
   - init() default export
   - WasmAnimationEngine class:
       load_animation(json), export_animation(id),
       create_player(), add_instance(playerId, animationId),
       play(id), pause(id), stop(id), seek(id, seconds),
       update(dtSeconds) -> Map<playerId, Map<trackName, { Float: number }>>
   - create_test_animation()
   It expects "stored animation"-style JSON with tracks [{ name, points:[{stamp:0..1, value:number}], ... }] and duration (ms).
*/

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function evalTrackAt(track, normT) {
  const pts = track.points || [];
  if (pts.length === 0) return 0;
  if (pts.length === 1) return Number(pts[0].value ?? 0);

  // Ensure points sorted by stamp
  // stamps are expected 0..1
  let i = 0;
  while (i < pts.length - 1 && normT > pts[i + 1].stamp) i++;

  const p1 = pts[i];
  const p2 = pts[Math.min(i + 1, pts.length - 1)];
  const span = Math.max(1e-6, p2.stamp - p1.stamp);
  const localT = Math.max(0, Math.min(1, (normT - p1.stamp) / span));
  const v1 = Number(p1.value ?? 0);
  const v2 = Number(p2.value ?? 0);
  return lerp(v1, v2, localT);
}

export class WasmAnimationEngine {
  constructor(configJson) {
    // configJson currently unused in shim
    this._animations = new Map(); // id -> { durationMs, tracks[] }
    this._players = new Map(); // id -> { timeMs, playing, instances:[{ animationId }] }
  }

  load_animation(animationJson) {
    const obj =
      typeof animationJson === "string"
        ? JSON.parse(animationJson)
        : animationJson;
    const id = obj.id || genId();
    const durationMs = Number(obj.duration ?? 0);
    const tracks = Array.isArray(obj.tracks)
      ? obj.tracks.map((t) => ({
          name: t.name || t.id || genId(),
          points: Array.isArray(t.points)
            ? [...t.points]
                .map((p) => ({
                  stamp: Number(p.stamp ?? 0),
                  value: Number(p.value ?? 0),
                }))
                .sort((a, b) => a.stamp - b.stamp)
            : [],
        }))
      : [];
    this._animations.set(id, { id, durationMs, tracks, raw: obj });
    return id;
  }

  export_animation(animationId) {
    const a = this._animations.get(animationId);
    return JSON.stringify(a?.raw ?? null);
  }

  create_player() {
    const id = genId();
    this._players.set(id, { timeMs: 0, playing: false, instances: [] });
    return id;
  }

  add_instance(playerId, animationId) {
    const p = this._players.get(playerId);
    if (!p) throw new Error("Unknown player " + playerId);
    if (!this._animations.has(animationId))
      throw new Error("Unknown animation " + animationId);
    // Single active instance at a time for this shim
    p.instances = [{ animationId }];
  }

  play(playerId) {
    const p = this._players.get(playerId);
    if (p) p.playing = true;
  }

  pause(playerId) {
    const p = this._players.get(playerId);
    if (p) p.playing = false;
  }

  stop(playerId) {
    const p = this._players.get(playerId);
    if (p) {
      p.playing = false;
      p.timeMs = 0;
    }
  }

  seek(playerId, timeSeconds) {
    const p = this._players.get(playerId);
    if (p) {
      p.timeMs = Math.max(0, Math.floor(timeSeconds * 1000));
    }
  }

  // Returns Map<playerId, Map<name, { Float:number }>>
  update(frameDeltaSeconds) {
    const outputs = new Map();
    const dtMs = Math.max(0, Math.floor(Number(frameDeltaSeconds) * 1000));

    for (const [pid, p] of this._players.entries()) {
      if (p.playing) {
        p.timeMs += dtMs;
      }
      const vals = new Map();

      if (p.instances.length > 0) {
        const anim = this._animations.get(p.instances[0].animationId);
        if (anim && anim.durationMs > 0) {
          const normT = Math.max(0, Math.min(1, p.timeMs / anim.durationMs));
          for (const tr of anim.tracks) {
            const v = evalTrackAt(tr, normT);
            vals.set(tr.name, { Float: v });
          }
        }
      }

      outputs.set(pid, vals);
    }

    return outputs;
  }

  // Optional helpers for completeness
  get_player_state(playerId) {
    const p = this._players.get(playerId);
    if (!p) return { playing: false, timeMs: 0 };
    return { playing: p.playing, timeMs: p.timeMs };
  }

  get_player_time(playerId) {
    const p = this._players.get(playerId);
    return p ? p.timeMs / 1000 : 0;
  }

  animation_ids() {
    return Array.from(this._animations.keys());
  }

  get_player_progress(playerId) {
    const p = this._players.get(playerId);
    if (!p || p.instances.length === 0) return 0;
    const anim = this._animations.get(p.instances[0].animationId);
    if (!anim || anim.durationMs === 0) return 0;
    return Math.max(0, Math.min(1, p.timeMs / anim.durationMs));
  }

  get_player_ids() {
    return Array.from(this._players.keys());
  }

  update_player_config(_playerId, _configJson) {
    // no-op in shim
    return true;
  }

  bake_animation(animationId, _configJson) {
    const a = this._animations.get(animationId);
    return JSON.stringify(a?.raw ?? null);
  }

  get_derivatives(_playerId, _widthMs = 1.0) {
    return {};
  }
}

export function create_test_animation() {
  const id = "test-" + genId();
  const duration = 1000;
  return {
    id,
    name: "Test",
    duration,
    tracks: [
      {
        id: "track-x",
        name: "X",
        points: [
          { id: genId(), stamp: 0.0, value: 0 },
          { id: genId(), stamp: 1.0, value: 1 },
        ],
      },
      {
        id: "track-y",
        name: "Y",
        points: [
          { id: genId(), stamp: 0.0, value: 0 },
          { id: genId(), stamp: 1.0, value: 1 },
        ],
      },
      {
        id: "track-morph",
        name: "Morph",
        points: [
          { id: genId(), stamp: 0.0, value: 0 },
          { id: genId(), stamp: 1.0, value: 1 },
        ],
      },
    ],
    groups: { dataType: "Map", value: [] },
    transitions: { dataType: "Map", value: [] },
  };
}

export default async function init() {
  // In real wasm this would initialize the module. Here it's a no-op.
  return;
}

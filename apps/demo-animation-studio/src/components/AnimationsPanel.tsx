import React, { useMemo, useState } from "react";
import type { StoredAnimation } from "@vizij/animation-wasm";
import { useAnimation } from "@vizij/animation-react";

function cloneWithoutTransitions(anim: StoredAnimation): StoredAnimation {
  return {
    ...anim,
    tracks: (anim.tracks as any[]).map((t: any) => ({
      ...t,
      points: (t.points as any[]).map((p: any) => {
        const { transitions, ...rest } = p as any;
        // transitions is optional; removing it yields a valid Keypoint-like payload for the engine
        return rest as any;
      }),
    })),
  };
}

function summarize(anims: StoredAnimation[]) {
  return anims.map((a, i) => ({
    i,
    name: a.name ?? `anim_${i}`,
    duration: a.duration,
    tracks: a.tracks?.length ?? 0,
  }));
}

export default function AnimationsPanel({
  preset,
  animations,
  setAnimations,
}: {
  preset: StoredAnimation;
  animations: StoredAnimation[];
  setAnimations: (next: StoredAnimation[]) => void;
}) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const animApi = useAnimation() as any;

  const summary = useMemo(() => summarize(animations), [animations]);

  const usePreset = () => {
    setError(null);
    setAnimations([preset]);
  };

  const useNoTransitions = () => {
    setError(null);
    setAnimations([cloneWithoutTransitions(preset)]);
  };

  const tryImport = () => {
    setError(null);
    try {
      const data = JSON.parse(importText);
      const arr: StoredAnimation[] = Array.isArray(data) ? data : [data];
      // Minimal validation
      for (const a of arr) {
        if (typeof a !== "object" || a == null)
          throw new Error("Invalid animation entry");
        if (typeof (a as any).duration !== "number")
          throw new Error("Missing duration");
        if (!Array.isArray((a as any).tracks))
          throw new Error("Missing tracks");
      }
      setAnimations(arr);
      setShowImport(false);
      setImportText("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const tryAppendImport = () => {
    setError(null);
    try {
      const data = JSON.parse(importText);
      const arr: StoredAnimation[] = Array.isArray(data) ? data : [data];
      // Minimal validation
      for (const a of arr) {
        if (typeof a !== "object" || a == null)
          throw new Error("Invalid animation entry");
        if (typeof (a as any).duration !== "number")
          throw new Error("Missing duration");
        if (!Array.isArray((a as any).tracks))
          throw new Error("Missing tracks");
      }
      animApi.addAnimations?.(arr);
      setAnimations([...animations, ...arr]);
      setShowImport(false);
      setImportText("");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  return (
    <section
      style={{
        background: "#16191d",
        border: "1px solid #2a2d31",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <b>Animations</b>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>
        Select built-in presets or import JSON (StoredAnimation or array).
      </div>

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
      >
        <button onClick={usePreset}>Use Preset</button>
        <button onClick={useNoTransitions}>Use No-Transitions Variant</button>
        <button
          onClick={() => {
            animApi.addAnimations?.(preset);
            setAnimations([...animations, preset]);
          }}
        >
          Append Preset
        </button>
        <button
          onClick={() => {
            const nt = cloneWithoutTransitions(preset);
            animApi.addAnimations?.(nt);
            setAnimations([...animations, nt]);
          }}
        >
          Append No-Transitions
        </button>
        <button onClick={() => setShowImport((v) => !v)}>
          {showImport ? "Close Import" : "Import JSON"}
        </button>
      </div>

      {showImport && (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <textarea
            placeholder="Paste StoredAnimation JSON (or array)"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 140,
              background: "#0f1113",
              color: "#eaeaea",
              border: "1px solid #2a2d31",
              borderRadius: 6,
              padding: 8,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={tryImport}>Apply Import</button>
            <button onClick={tryAppendImport}>Append Import</button>
            <button
              onClick={() => {
                setShowImport(false);
                setImportText("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div style={{ color: "#f87171", fontSize: 12 }}>Error: {error}</div>
          )}
        </div>
      )}

      <div
        style={{ fontSize: 12, opacity: 0.8, marginTop: 4, marginBottom: 6 }}
      >
        Active animations: {animations.length}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {summary.map(({ i, name, duration, tracks }) => (
          <div
            key={i}
            style={{
              background: "#1a1d21",
              border: "1px solid #2a2d31",
              borderRadius: 6,
              padding: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ opacity: 0.75 }}>
              Duration: {duration} ms • Tracks: {tracks}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

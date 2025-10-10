import React from "react";
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber,
  useAnimation,
} from "@vizij/animation-react";
import anim from "./anim";

const toPretty = (value: unknown) => JSON.stringify(value, null, 2);

type StoredAnimation = Record<string, unknown>;
type PlayerInfo = {
  id: number;
  name?: string;
  time: number;
  length: number;
  start_time?: number;
  end_time?: number | null;
};

const normalizeAnimations = (
  source: StoredAnimation[] | StoredAnimation,
): StoredAnimation[] => (Array.isArray(source) ? source : [source]);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function downloadJson(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseAnimations(text: string): StoredAnimation[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error("Animation array cannot be empty.");
    }
    return data as StoredAnimation[];
  }
  if (data && typeof data === "object") {
    return [data as StoredAnimation];
  }
  throw new Error("Expected a StoredAnimation object or an array of them.");
}

type PanelProps = {
  animations: StoredAnimation[];
  setAnimations: (next: StoredAnimation[]) => void;
  initialAnimations: StoredAnimation[];
};

function Panel({ animations, setAnimations, initialAnimations }: PanelProps) {
  const value = useAnimTarget("demo/scalar");
  const num = valueAsNumber(value);
  const animApi = useAnimation();
  const [editorText, setEditorText] = React.useState<string>(() =>
    toPretty(animations.length === 1 ? animations[0] : animations),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const players = animApi.listPlayers?.() ?? [];
  const primaryPlayer = players[0] as PlayerInfo | undefined;
  const playerStart = Number(primaryPlayer?.start_time ?? 0) || 0;
  const playerLengthRaw = Number(primaryPlayer?.length ?? 0) || 0;
  const playerLength = playerLengthRaw > playerStart
    ? playerLengthRaw
    : playerStart + (playerLengthRaw > 0 ? playerLengthRaw : 1);
  const playerTimeRaw = Number(primaryPlayer?.time ?? playerStart) || 0;
  const clampedTime = clamp(playerTimeRaw, playerStart, playerLength);
  const [seekTime, setSeekTime] = React.useState(clampedTime);

  React.useEffect(() => {
    setEditorText(toPretty(animations.length === 1 ? animations[0] : animations));
  }, [animations]);

  React.useEffect(() => {
    setSeekTime(clampedTime);
  }, [clampedTime]);

  const applyAnimations = React.useCallback(
    (next: StoredAnimation[]) => {
      setAnimations(next);
      setStatus(
        next.length === 1
          ? "Loaded 1 animation clip."
          : `Loaded ${next.length} animation clips.`,
      );
      setError(null);
    },
    [setAnimations],
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatus(null);
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsText(file);
      });
      const parsed = parseAnimations(text);
      setEditorText(toPretty(parsed.length === 1 ? parsed[0] : parsed));
      applyAnimations(parsed);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus(null);
    } finally {
      e.currentTarget.value = "";
    }
  };

  const onApply = () => {
    setStatus(null);
    setError(null);
    try {
      const parsed = parseAnimations(editorText);
      applyAnimations(parsed);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const onFormat = () => {
    try {
      const parsed = parseAnimations(editorText);
      setEditorText(toPretty(parsed.length === 1 ? parsed[0] : parsed));
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus(null);
    }
  };

  const onDownload = () => {
    downloadJson(editorText, "animation.json");
    setStatus("Saved animation JSON.");
  };

  const onRestoreInitial = () => {
    applyAnimations(initialAnimations);
    setEditorText(
      toPretty(
        initialAnimations.length === 1
          ? initialAnimations[0]
          : initialAnimations,
      ),
    );
  };

  const playerId = primaryPlayer?.id as number | undefined;

  const sendCommand = React.useCallback(
    (cmd: unknown) => {
      if (playerId === undefined) return;
      animApi.step(0, { player_cmds: [cmd] });
      animApi.step(1 / 120);
    },
    [animApi, playerId],
  );

  const onSeek = React.useCallback(
    (nextTime: number) => {
      if (playerId === undefined) return;
      const clamped = clamp(nextTime, playerStart, playerLength);
      setSeekTime(clamped);
      sendCommand({ Seek: { player: playerId, time: clamped } });
    },
    [playerId, playerStart, playerLength, sendCommand],
  );

  const onTimelinePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!primaryPlayer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = clamp(event.clientX - rect.left, 0, rect.width);
    const norm = rect.width > 0 ? relative / rect.width : 0;
    const next = playerStart + norm * (playerLength - playerStart);
    onSeek(next);
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "2rem auto",
        display: "grid",
        gap: 24,
      }}
    >
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>Vizij Animation Demo</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>
          Anim key: <code>demo/scalar</code>
        </p>
        <p style={{ margin: 0 }}>
          Value: <b>{num !== undefined ? num.toFixed(4) : "…"}</b>
        </p>
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Transport</h2>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: 16,
            background: "#f9fafb",
          }}
        >
          <button
            type="button"
            onClick={() => sendCommand({ Play: { player: playerId } })}
            disabled={playerId === undefined}
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => sendCommand({ Pause: { player: playerId } })}
            disabled={playerId === undefined}
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => sendCommand({ Stop: { player: playerId } })}
            disabled={playerId === undefined}
          >
            Reset
          </button>
          <div style={{ marginLeft: "auto", minWidth: 160 }}>
            <div
              style={{
                position: "relative",
                height: 12,
                background: "#e5e7eb",
                borderRadius: 999,
                cursor: playerId === undefined ? "not-allowed" : "pointer",
              }}
              onPointerDown={(e) => {
                if (playerId === undefined) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                onTimelinePointer(e);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                onTimelinePointer(e);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderRadius: 999,
                  background: "linear-gradient(90deg,#38bdf8,#6366f1)",
                  transformOrigin: "left",
                  transform: `scaleX(${(seekTime - playerStart) / (playerLength - playerStart || 1)})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -4,
                  width: 8,
                  height: 20,
                  borderRadius: 4,
                  background: "#ef4444",
                  transform: `translateX(${((seekTime - playerStart) /
                    (playerLength - playerStart || 1)) * 100}%) translateX(-4px)`,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginTop: 6,
              }}
            >
              <span>{playerStart.toFixed(2)}s</span>
              <span>{playerLength.toFixed(2)}s</span>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Time: {clampedTime.toFixed(2)}s
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Animation JSON</h2>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <strong>Load file</strong>
            <input
              type="file"
              accept=".json,application/json"
              onChange={onFileChange}
            />
          </label>
          <button type="button" onClick={onApply}>
            Apply edits
          </button>
          <button type="button" onClick={onFormat}>
            Format JSON
          </button>
          <button type="button" onClick={onDownload}>
            Save JSON
          </button>
          <button type="button" onClick={onRestoreInitial}>
            Restore initial clip
          </button>
        </div>
        <textarea
          value={editorText}
          onChange={(e) => setEditorText(e.target.value)}
          spellCheck={false}
          rows={16}
          style={{
            width: "100%",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
            lineHeight: 1.5,
            padding: 16,
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#111827",
            color: "#e5e7eb",
            resize: "vertical",
          }}
        />
        {error ? (
          <div style={{ color: "#ef4444" }}>Error: {error}</div>
        ) : null}
        {status ? (
          <div style={{ color: "#16a34a" }}>{status}</div>
        ) : null}
        <p style={{ opacity: 0.65, fontSize: 14, margin: 0 }}>
          Paste or load a StoredAnimation JSON payload, tweak it, then apply to
          reload the WASM engine. The provider will stream updates to the value
          above.
        </p>
      </section>
    </div>
  );
}

export default function App() {
  const initialList = React.useMemo(
    () => normalizeAnimations(anim as StoredAnimation),
    [],
  );
  const [animations, setAnimations] = React.useState<StoredAnimation[]>(
    initialList,
  );
  const initialRef = React.useRef(initialList);

  return (
    <AnimationProvider
      animations={animations}
      prebind={(path) => path}
      autostart
      updateHz={60}
    >
      <Panel
        animations={animations}
        setAnimations={setAnimations}
        initialAnimations={initialRef.current}
      />
    </AnimationProvider>
  );
}

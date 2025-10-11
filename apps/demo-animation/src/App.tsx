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

type AnimationSummary = {
  primaryAnimationId?: string | number;
  primaryTrackAnimatableId?: string;
  primaryTrackLabel?: string | number;
  animatableIds: string[];
};

type AnimationValidationResult = {
  errors: string[];
  warnings: string[];
  summary: AnimationSummary;
};

const describeAnimation = (anim: StoredAnimation, index: number): string => {
  const candidate = anim as any;
  if (typeof candidate?.id === "string" && candidate.id.trim() !== "") {
    return `animation "${candidate.id}"`;
  }
  if (typeof candidate?.id === "number") {
    return `animation ${candidate.id}`;
  }
  if (typeof candidate?.name === "string" && candidate.name.trim() !== "") {
    return `animation "${candidate.name}"`;
  }
  return `animation[${index}]`;
};

const describeTrack = (
  anim: StoredAnimation,
  animIndex: number,
  track: unknown,
  trackIndex: number,
): string => {
  const trackObj = track as any;
  if (typeof trackObj?.id === "string" && trackObj.id.trim() !== "") {
    return `track "${trackObj.id}" of ${describeAnimation(anim, animIndex)}`;
  }
  if (typeof trackObj?.id === "number") {
    return `track ${trackObj.id} of ${describeAnimation(anim, animIndex)}`;
  }
  return `track[${trackIndex}] of ${describeAnimation(anim, animIndex)}`;
};

const validateAnimations = (
  anims: StoredAnimation[],
): AnimationValidationResult => {
  const summary: AnimationSummary = { animatableIds: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const animatableIdSet = new Set<string>();

  anims.forEach((anim, animIndex) => {
    if (!anim || typeof anim !== "object") {
      errors.push(`Animation at index ${animIndex} must be an object.`);
      return;
    }

    const animObj = anim as any;
    const animId = animObj.id;
    if (summary.primaryAnimationId === undefined) {
      if (typeof animId === "string" && animId.trim() !== "") {
        summary.primaryAnimationId = animId;
      } else if (typeof animId === "number") {
        summary.primaryAnimationId = animId;
      }
    }
    if (
      animId === undefined ||
      animId === null ||
      (typeof animId === "string" && animId.trim() === "")
    ) {
      warnings.push(`${describeAnimation(anim, animIndex)} is missing an id.`);
    }

    const tracks = animObj.tracks;
    if (!Array.isArray(tracks) || tracks.length === 0) {
      errors.push(`${describeAnimation(anim, animIndex)} must include tracks.`);
      return;
    }

    tracks.forEach((track: any, trackIndex: number) => {
      if (!track || typeof track !== "object") {
        errors.push(
          `${describeTrack(anim, animIndex, track, trackIndex)} must be an object.`,
        );
        return;
      }
      const animatableId =
        track.animatableId ?? track.animatable_id ?? track.target ?? undefined;
      if (typeof animatableId !== "string" || animatableId.trim() === "") {
        errors.push(
          `${describeTrack(anim, animIndex, track, trackIndex)} is missing a valid animatableId.`,
        );
        return;
      }
      if (!summary.primaryTrackAnimatableId) {
        summary.primaryTrackAnimatableId = animatableId;
        summary.primaryTrackLabel = track.id ?? trackIndex;
      }
      animatableIdSet.add(animatableId);
    });
  });

  summary.animatableIds = Array.from(animatableIdSet);

  return { errors, warnings, summary };
};

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

type TrackedKeyValueProps = {
  targetKey: string;
};

const formatValue = (value: unknown) => {
  const numeric = valueAsNumber(value as any);
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    return numeric.toFixed(4);
  }
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function TrackedKeyValue({ targetKey }: TrackedKeyValueProps) {
  const value = useAnimTarget(targetKey);
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        border: "1px solid #d1d5db",
        borderRadius: 8,
        padding: "10px 12px",
        background: "#1f2937",
        color: "#f9fafb",
      }}
    >
      <code
        style={{
          fontSize: 11,
          opacity: 0.7,
          wordBreak: "break-word",
        }}
      >
        {targetKey}
      </code>
      <strong
        style={{
          fontSize: 18,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          textAlign: "right",
        }}
      >
        {formatValue(value)}
      </strong>
    </div>
  );
}

function Panel({ animations, setAnimations, initialAnimations }: PanelProps) {
  const currentValidation = React.useMemo(
    () => validateAnimations(animations),
    [animations],
  );
  const allTrackedKeys = currentValidation.summary.animatableIds;
  const primaryKey = allTrackedKeys[0];
  const primaryValue = useAnimTarget(primaryKey);
  const currentAnimationId =
    currentValidation.summary.primaryAnimationId ?? undefined;
  const animApi = useAnimation();
  const [warnings, setWarnings] = React.useState<string[]>(() =>
    currentValidation.warnings.slice(),
  );
  const [editorText, setEditorText] = React.useState<string>(() =>
    toPretty(animations.length === 1 ? animations[0] : animations),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const players = animApi.listPlayers?.() ?? [];
  const primaryPlayer = players[0] as PlayerInfo | undefined;
  const playerStart = Number(primaryPlayer?.start_time ?? 0) || 0;
  const playerLengthRaw = Number(primaryPlayer?.length ?? 0) || 0;
  const playerLength =
    playerLengthRaw > playerStart
      ? playerLengthRaw
      : playerStart + (playerLengthRaw > 0 ? playerLengthRaw : 1);
  const playerTimeRaw = Number(primaryPlayer?.time ?? playerStart) || 0;
  const clampedTime = clamp(playerTimeRaw, playerStart, playerLength);

  React.useEffect(() => {
    const { warnings: nextWarnings } = validateAnimations(animations);
    setWarnings(nextWarnings.slice());
  }, [animations]);

  React.useEffect(() => {
    setEditorText(
      toPretty(animations.length === 1 ? animations[0] : animations),
    );
  }, [animations]);

  const applyAnimations = React.useCallback(
    (nextInput: StoredAnimation[] | StoredAnimation) => {
      setStatus(null);
      setError(null);

      const normalizedList = normalizeAnimations(nextInput);
      const {
        errors: validationErrors,
        warnings: validationWarnings,
        summary,
      } = validateAnimations(normalizedList);

      if (validationErrors.length > 0) {
        const formatted = validationErrors
          .map((line) => `- ${line}`)
          .join("\n");
        setError(`Animation payload invalid:\n${formatted}`);
        setWarnings(validationWarnings.slice());
        return false;
      }

      if (animApi.ready) {
        try {
          animApi.reload(normalizedList);
        } catch (err: unknown) {
          setError(
            `Animation engine rejected payload: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          setWarnings(validationWarnings.slice());
          return false;
        }
      }

      setAnimations([...normalizedList]);

      const segments: string[] = [];
      if (normalizedList.length === 1) {
        segments.push("Loaded 1 animation clip.");
      } else {
        segments.push(`Loaded ${normalizedList.length} animation clips.`);
      }
      if (summary.primaryAnimationId !== undefined) {
        segments.push(`Animation ID: ${summary.primaryAnimationId}.`);
      }
      if (summary.animatableIds.length > 0) {
        const keysPreview =
          summary.animatableIds.length > 3
            ? `${summary.animatableIds.slice(0, 3).join(", ")} (+${
                summary.animatableIds.length - 3
              } more)`
            : summary.animatableIds.join(", ");
        segments.push(
          `Tracking ${summary.animatableIds.length} key${
            summary.animatableIds.length === 1 ? "" : "s"
          }: ${keysPreview}.`,
        );
      } else {
        segments.push("No animatableId detected.");
      }
      if (validationWarnings.length > 0) {
        const warningText =
          validationWarnings.length === 1
            ? `Warning: ${validationWarnings[0]}`
            : `Warnings: ${validationWarnings.join(" ")}`;
        segments.push(warningText);
      }
      if (!animApi.ready) {
        segments.push("Engine is initialising; clip will load when ready.");
      }

      setStatus(segments.join(" "));
      setWarnings(validationWarnings.slice());
      setError(null);
      return true;
    },
    [animApi, setAnimations],
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
      sendCommand({ Seek: { player: playerId, time: clamped } });
    },
    [playerId, playerStart, playerLength, sendCommand],
  );

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
          Animation ID:{" "}
          <code>
            {currentAnimationId !== undefined ? currentAnimationId : "—"}
          </code>
        </p>
        <p style={{ margin: 0 }}>
          Tracked keys:{" "}
          <code>
            {allTrackedKeys.length > 0 ? allTrackedKeys.join(", ") : "—"}
          </code>
        </p>
        {primaryKey ? (
          <p style={{ margin: 0 }}>
            Primary value ({primaryKey}):{" "}
            <strong>{formatValue(primaryValue)}</strong>
          </p>
        ) : null}
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
                display: "grid",
                gap: 4,
              }}
            >
              <input
                type="range"
                min={playerStart}
                max={playerLength}
                step={
                  playerLength - playerStart > 0
                    ? (playerLength - playerStart) / 200
                    : 0.01
                }
                value={clampedTime}
                onChange={(event) => onSeek(Number(event.target.value))}
                disabled={playerId === undefined}
                style={{
                  appearance: "none",
                  width: "100%",
                  cursor: playerId === undefined ? "not-allowed" : "pointer",
                  accentColor: "#ef4444",
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
        <h2 style={{ margin: 0, fontSize: 18 }}>Tracked Outputs</h2>
        {allTrackedKeys.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            {allTrackedKeys.map((key) => (
              <TrackedKeyValue key={key} targetKey={key} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, opacity: 0.65 }}>
            No animatable keys detected in the current clip.
          </p>
        )}
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
        {error ? <div style={{ color: "#ef4444" }}>Error: {error}</div> : null}
        {status ? <div style={{ color: "#16a34a" }}>{status}</div> : null}
        {warnings.length > 0 ? (
          <div style={{ color: "#f97316" }}>
            Warning{warnings.length === 1 ? "" : "s"}: {warnings.join(" ")}
          </div>
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
  const [animations, setAnimations] =
    React.useState<StoredAnimation[]>(initialList);
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

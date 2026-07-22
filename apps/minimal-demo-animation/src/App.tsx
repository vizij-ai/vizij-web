import React from "react";
import type { ChangeEvent } from "react";
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import {
  MinimalDemoChrome,
  MinimalDemoSection,
  minimalDemoTheme,
} from "@vizij/minimal-demo-ui";
import { cloneDeepSafe } from "@vizij/utils";
import {
  useAnimationRuntime,
  type AnimationRuntimeApi,
  type StoredAnimation,
} from "./animationRuntime";
import { listSamples, loadSample } from "./samples";

const toPretty = (value: unknown) => JSON.stringify(value, null, 2);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type AnimationSummary = {
  primaryAnimationId?: string | number;
  animatableIds: string[];
};

type AnimationValidationResult = {
  errors: string[];
  warnings: string[];
  summary: AnimationSummary;
};

const normalizeAnimations = (
  source: StoredAnimation[] | StoredAnimation,
): StoredAnimation[] => (Array.isArray(source) ? source : [source]);

const describeAnimation = (anim: StoredAnimation, index: number): string => {
  const candidate = anim as { id?: unknown; name?: unknown };
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

    const animObj = anim as { id?: unknown; tracks?: unknown };
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

    tracks.forEach((track: unknown) => {
      const trackObj = track as { animatableId?: unknown };
      const animatableId = trackObj?.animatableId;
      if (typeof animatableId !== "string" || animatableId.trim() === "") {
        errors.push(
          `${describeAnimation(anim, animIndex)} has a track missing a valid animatableId.`,
        );
        return;
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

const formatValue = (value: ValueJSON | null | undefined) => {
  const numeric = valueAsNumber(value ?? undefined);
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

function TrackedKeyValue({
  targetKey,
  value,
}: {
  targetKey: string;
  value: ValueJSON | null | undefined;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        border: `1px solid ${minimalDemoTheme.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        background: minimalDemoTheme.card,
        color: minimalDemoTheme.text,
      }}
    >
      <code style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>
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

type PanelProps = {
  anim: AnimationRuntimeApi;
  animations: StoredAnimation[];
  setAnimations: (next: StoredAnimation[]) => void;
  sampleOptions: string[];
  selectedSample: string | null;
  setSelectedSample: (id: string | null) => void;
};

function Panel({
  anim,
  animations,
  setAnimations,
  sampleOptions,
  selectedSample,
  setSelectedSample,
}: PanelProps) {
  const currentValidation = React.useMemo(
    () => validateAnimations(animations),
    [animations],
  );
  const allTrackedKeys = currentValidation.summary.animatableIds;
  const currentAnimationId =
    currentValidation.summary.primaryAnimationId ?? undefined;

  const [warnings, setWarnings] = React.useState<string[]>(() =>
    currentValidation.warnings.slice(),
  );
  const [editorText, setEditorText] = React.useState<string>(() =>
    toPretty(animations.length === 1 ? animations[0] : animations),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const primaryPlayer = anim.players[0];
  const playerLength = Math.max(
    Number(primaryPlayer?.duration ?? 0) || 0,
    0.01,
  );
  const playerTime = clamp(
    Number(primaryPlayer?.time ?? 0) || 0,
    0,
    playerLength,
  );

  React.useEffect(() => {
    const { warnings: nextWarnings } = validateAnimations(animations);
    setWarnings(nextWarnings.slice());
    setEditorText(
      toPretty(animations.length === 1 ? animations[0] : animations),
    );
  }, [animations]);

  const applyAnimations = React.useCallback(
    (
      nextInput: StoredAnimation[] | StoredAnimation,
      opts?: { sampleId?: string | null },
    ) => {
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

      // A new clips identity reloads the runtime inside the hook.
      setAnimations(cloneDeepSafe(normalizedList));
      setSelectedSample(opts?.sampleId ?? null);

      const segments: string[] = [];
      segments.push(
        normalizedList.length === 1
          ? "Loaded 1 animation clip."
          : `Loaded ${normalizedList.length} animation clips.`,
      );
      if (summary.animatableIds.length > 0) {
        segments.push(
          `Tracking ${summary.animatableIds.length} key${
            summary.animatableIds.length === 1 ? "" : "s"
          }: ${summary.animatableIds.join(", ")}.`,
        );
      }
      setStatus(segments.join(" "));
      setWarnings(validationWarnings.slice());
      return true;
    },
    [setAnimations, setSelectedSample],
  );

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setStatus(null);
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAnimations(text);
      setEditorText(toPretty(parsed.length === 1 ? parsed[0] : parsed));
      applyAnimations(parsed, { sampleId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      e.currentTarget.value = "";
    }
  };

  const onApply = () => {
    setStatus(null);
    setError(null);
    try {
      applyAnimations(parseAnimations(editorText), { sampleId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFormat = () => {
    try {
      const parsed = parseAnimations(editorText);
      setEditorText(toPretty(parsed.length === 1 ? parsed[0] : parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDownload = () => {
    downloadJson(editorText, "animation.json");
    setStatus("Saved animation JSON.");
  };

  const handleSampleSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (!id || id === "__custom__") return;
    try {
      const payload = loadSample(id);
      setEditorText(toPretty(payload));
      applyAnimations(payload, { sampleId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSeek = (nextTime: number) => {
    anim.seek(clamp(nextTime, 0, playerLength));
  };

  return (
    <MinimalDemoChrome
      title="Vizij animation demo"
      subtitle="Minimal Vizij sample (runtime path)"
      description="Load StoredAnimation clips, scrub them, and watch tracked keys update — driven by @vizij/animation-module running in a @vizij/runtime instance."
    >
      <MinimalDemoSection
        title="Active clip"
        description={
          currentAnimationId !== undefined
            ? `Animation ID ${currentAnimationId}`
            : undefined
        }
      >
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>
            Tracked keys:{" "}
            <code>
              {allTrackedKeys.length > 0 ? allTrackedKeys.join(", ") : "—"}
            </code>
          </p>
          <p style={{ margin: 0, opacity: 0.7 }}>
            Runtime: {anim.ready ? "running" : "starting…"}
            {anim.error ? ` — error: ${anim.error}` : ""}
          </p>
        </div>
      </MinimalDemoSection>

      <MinimalDemoSection title="Transport">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            border: `1px solid ${minimalDemoTheme.border}`,
            borderRadius: 8,
            padding: 16,
            background: minimalDemoTheme.card,
          }}
        >
          <button type="button" onClick={anim.play} disabled={!anim.ready}>
            Play
          </button>
          <button type="button" onClick={anim.pause} disabled={!anim.ready}>
            Pause
          </button>
          <button type="button" onClick={anim.stop} disabled={!anim.ready}>
            Reset
          </button>
          <div style={{ marginLeft: "auto", minWidth: 160 }}>
            <input
              type="range"
              min={0}
              max={playerLength}
              step={playerLength / 200}
              value={playerTime}
              onChange={(event) => onSeek(Number(event.target.value))}
              disabled={!anim.ready}
              style={{
                appearance: "none",
                width: "100%",
                cursor: anim.ready ? "pointer" : "not-allowed",
                accentColor: "#ef4444",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginTop: 6,
              }}
            >
              <span>0.00s</span>
              <span>{playerLength.toFixed(2)}s</span>
            </div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Time: {playerTime.toFixed(2)}s
          </div>
        </div>
      </MinimalDemoSection>

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
              <TrackedKeyValue
                key={key}
                targetKey={key}
                value={anim.values[key]}
              />
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
            <strong>Sample</strong>
            <select
              value={selectedSample ?? "__custom__"}
              onChange={handleSampleSelect}
            >
              <option value="__custom__">Custom (editor/file)</option>
              {sampleOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
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
            border: `1px solid ${minimalDemoTheme.border}`,
            background: minimalDemoTheme.code,
            color: minimalDemoTheme.text,
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
          reload the runtime. The tracked values above stream from the runtime
          store each frame.
        </p>
      </section>
    </MinimalDemoChrome>
  );
}

export default function App() {
  const sampleOptions = React.useMemo(() => listSamples(), []);
  const [animations, setAnimations] = React.useState<StoredAnimation[]>(() => [
    loadSample(
      sampleOptions.includes("simple-scalar-ramp")
        ? "simple-scalar-ramp"
        : sampleOptions[0],
    ),
  ]);
  const [selectedSample, setSelectedSample] = React.useState<string | null>(
    sampleOptions.includes("simple-scalar-ramp")
      ? "simple-scalar-ramp"
      : (sampleOptions[0] ?? null),
  );

  const anim = useAnimationRuntime(animations, { autoplay: true });

  return (
    <Panel
      anim={anim}
      animations={animations}
      setAnimations={setAnimations}
      sampleOptions={sampleOptions}
      selectedSample={selectedSample}
      setSelectedSample={setSelectedSample}
    />
  );
}

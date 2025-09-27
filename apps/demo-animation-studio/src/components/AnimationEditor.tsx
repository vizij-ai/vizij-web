import React, { useEffect, useMemo, useState } from "react";
import type { StoredAnimation } from "@vizij/animation-wasm";

const cloneAnimation = (anim: StoredAnimation): StoredAnimation =>
  JSON.parse(JSON.stringify(anim));

const makePointKey = (trackIdx: number, pointIdx: number) =>
  `${trackIdx}:${pointIdx}`;

const formatValue = (value: unknown) => {
  if (value === null) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const parseValue = (text: string): unknown => {
  return JSON.parse(text);
};

type ApplyResult = { ok: boolean; message?: string };

type AnimationEditorProps = {
  animations: StoredAnimation[];
  onApply: (next: StoredAnimation[]) => ApplyResult;
  selectedIndex?: number;
};

export default function AnimationEditor({
  animations,
  onApply,
  selectedIndex: externalSelectedIndex,
}: AnimationEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(
    externalSelectedIndex ?? 0,
  );
  const [draft, setDraft] = useState<StoredAnimation | null>(null);
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({});
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof externalSelectedIndex === "number" &&
      externalSelectedIndex !== selectedIndex
    ) {
      setSelectedIndex(externalSelectedIndex);
    }
  }, [externalSelectedIndex, selectedIndex]);

  useEffect(() => {
    if (animations.length === 0) {
      setDraft(null);
      setValueInputs({});
      setValueErrors({});
      return;
    }
    if (selectedIndex >= animations.length) {
      setSelectedIndex(Math.max(animations.length - 1, 0));
      return;
    }
    const anim = animations[selectedIndex];
    if (!anim) {
      setDraft(null);
      setValueInputs({});
      setValueErrors({});
      return;
    }
    const cloned = cloneAnimation(anim);
    setDraft(cloned);
    const inputs: Record<string, string> = {};
    const errs: Record<string, string> = {};
    cloned.tracks?.forEach((track: any, ti: number) => {
      track.points?.forEach((pt: any, pi: number) => {
        const key = makePointKey(ti, pi);
        inputs[key] = formatValue(pt.value);
        errs[key] = "";
      });
    });
    setValueInputs(inputs);
    setValueErrors(errs);
    setStatus(null);
    setError(null);
  }, [animations, selectedIndex]);

  const tracks = useMemo(() => draft?.tracks ?? [], [draft]);

  const updateTrackField = (
    trackIdx: number,
    field: string,
    value: any,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextTracks = (prev.tracks ?? []).map((track: any, idx: number) => {
        if (idx !== trackIdx) return track;
        const nextTrack = { ...track };
        if (field === "settings.color") {
          nextTrack.settings = { ...track.settings, color: value };
        } else {
          nextTrack[field] = value;
        }
        return nextTrack;
      });
      return { ...prev, tracks: nextTracks } as StoredAnimation;
    });
  };

  const updatePointStamp = (
    trackIdx: number,
    pointIdx: number,
    stamp: number,
  ) => {
    if (!Number.isFinite(stamp)) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const nextTracks = (prev.tracks ?? []).map((track: any, ti: number) => {
        if (ti !== trackIdx) return track;
        const nextPoints = (track.points ?? []).map(
          (pt: any, pi: number) =>
            pi === pointIdx ? { ...pt, stamp } : pt,
        );
        return { ...track, points: nextPoints };
      });
      return { ...prev, tracks: nextTracks } as StoredAnimation;
    });
  };

  const updatePointValue = (
    trackIdx: number,
    pointIdx: number,
    text: string,
  ) => {
    const key = makePointKey(trackIdx, pointIdx);
    setValueInputs((prev) => ({ ...prev, [key]: text }));
    try {
      const parsed = parseValue(text);
      setValueErrors((prev) => ({ ...prev, [key]: "" }));
      setDraft((prev) => {
        if (!prev) return prev;
        const nextTracks = (prev.tracks ?? []).map((track: any, ti: number) => {
          if (ti !== trackIdx) return track;
          const nextPoints = (track.points ?? []).map(
            (pt: any, pi: number) =>
              pi === pointIdx ? { ...pt, value: parsed } : pt,
          );
          return { ...track, points: nextPoints };
        });
        return { ...prev, tracks: nextTracks } as StoredAnimation;
      });
    } catch (e: any) {
      setValueErrors((prev) => ({
        ...prev,
        [key]: e?.message ?? "Failed to parse value",
      }));
    }
  };

  const removePoint = (trackIdx: number, pointIdx: number) => {
    let updatedPoints: any[] | undefined;
    setDraft((prev) => {
      if (!prev) return prev;
      const nextTracks = (prev.tracks ?? []).map((track: any, ti: number) => {
        if (ti !== trackIdx) return track;
        updatedPoints = (track.points ?? []).filter(
          (_pt: any, pi: number) => pi !== pointIdx,
        );
        return { ...track, points: updatedPoints };
      });
      return { ...prev, tracks: nextTracks } as StoredAnimation;
    });
    if (updatedPoints) {
      setValueInputs((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${trackIdx}:`)) delete next[key];
        });
        updatedPoints!.forEach((pt: any, idx: number) => {
          const key = makePointKey(trackIdx, idx);
          next[key] = formatValue(pt.value);
        });
        return next;
      });
      setValueErrors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${trackIdx}:`)) delete next[key];
        });
        updatedPoints!.forEach((_: any, idx: number) => {
          const key = makePointKey(trackIdx, idx);
          next[key] = "";
        });
        return next;
      });
    }
  };

  const addPoint = (trackIdx: number) => {
    let newPoint: any | undefined;
    let newIndex = 0;
    setDraft((prev) => {
      if (!prev) return prev;
      const nextTracks = (prev.tracks ?? []).map((track: any, ti: number) => {
        if (ti !== trackIdx) return track;
        const points = track.points ?? [];
        const last = points[points.length - 1];
        newPoint = {
          id: `kp_${Date.now()}`,
          stamp: last ? last.stamp ?? 1 : 0,
          value: last ? last.value : 0,
        };
        newIndex = points.length;
        const nextPoints = [...points, newPoint];
        return { ...track, points: nextPoints };
      });
      return { ...prev, tracks: nextTracks } as StoredAnimation;
    });
    if (newPoint) {
      const key = makePointKey(trackIdx, newIndex);
      const formatted = formatValue(newPoint.value);
      setValueInputs((prev) => ({ ...prev, [key]: formatted }));
      setValueErrors((prev) => ({ ...prev, [key]: "" }));
    }
  };

  const updateMeta = (field: keyof StoredAnimation, value: any) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value } as StoredAnimation;
    });
  };

  const applyChanges = () => {
    if (!draft) return;
    // Validate value inputs
    for (const [key, msg] of Object.entries(valueErrors)) {
      if (msg) {
        setError("Resolve value parsing errors before applying.");
        setStatus(null);
        return;
      }
    }
    try {
      const sanitizedTracks = (draft.tracks ?? []).map((track: any) => ({
        ...track,
        points: (track.points ?? [])
          .map((pt: any) => ({
            ...pt,
            stamp: typeof pt.stamp === "number" ? pt.stamp : Number(pt.stamp) || 0,
          }))
          .sort((a: any, b: any) => a.stamp - b.stamp),
      }));
      const sanitized: StoredAnimation = {
        ...draft,
        duration: Number((draft as any).duration) || (draft as any).duration,
        tracks: sanitizedTracks,
      } as StoredAnimation;
      const next = animations.map((anim, idx) =>
        idx === selectedIndex ? sanitized : anim,
      );
      const result = onApply(next);
      if (!result.ok) {
        setError(result.message ?? "Failed to apply changes");
        setStatus(null);
        return;
      }
      setStatus(result.message ?? "Animation updated and reloaded.");
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus(null);
    }
  };

  const resetDraft = () => {
    if (animations.length === 0) return;
    const anim = animations[selectedIndex];
    if (!anim) return;
    const cloned = cloneAnimation(anim);
    setDraft(cloned);
    const inputs: Record<string, string> = {};
    cloned.tracks?.forEach((track: any, ti: number) => {
      track.points?.forEach((pt: any, pi: number) => {
        inputs[makePointKey(ti, pi)] = formatValue(pt.value);
      });
    });
    setValueInputs(inputs);
    setValueErrors({});
    setStatus(null);
    setError(null);
  };

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
        background: "#16191d",
        border: "1px solid #2a2d31",
        borderRadius: 8,
        padding: 10,
        maxHeight: "100%",
        overflow: "auto",
      }}
    >
      <div>
        <b>Animation Editor</b>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Inspect a single animation, tweak track keypoints and reload the
          engine to preview changes.
        </div>
      </div>
      {animations.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          No animations available. Import or create one first.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Select animation</span>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
            >
              {animations.map((anim, idx) => (
                <option key={idx} value={idx}>
                  {anim.name ?? anim.id ?? `anim_${idx}`} ({anim.duration} ms)
                </option>
              ))}
            </select>
          </label>

          {draft && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Name</span>
                  <input
                    value={(draft as any).name ?? ""}
                    onChange={(e) => updateMeta("name", e.target.value)}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Duration (ms)</span>
                  <input
                    type="number"
                    min={0}
                    value={(draft as any).duration ?? 0}
                    onChange={(e) => updateMeta("duration", Number(e.target.value))}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {tracks.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    This animation has no tracks.
                  </div>
                ) : (
                  tracks.map((track: any, ti: number) => (
                    <div
                      key={track.id ?? ti}
                      style={{
                        border: "1px solid #2a2d31",
                        borderRadius: 6,
                        background: "#1a1d21",
                        padding: 8,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <label style={{ flex: "1 1 160px", display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>Track name</span>
                          <input
                            value={track.name ?? ""}
                            onChange={(e) =>
                              updateTrackField(ti, "name", e.target.value)
                            }
                          />
                        </label>
                        <label style={{ flex: "1 1 160px", display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>
                            Animatable Id
                          </span>
                          <input
                            value={track.animatableId ?? ""}
                            onChange={(e) =>
                              updateTrackField(ti, "animatableId", e.target.value)
                            }
                          />
                        </label>
                        <label style={{ width: 120, display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>Color</span>
                          <input
                            type="color"
                            value={track.settings?.color ?? "#60a5fa"}
                            onChange={(e) =>
                              updateTrackField(
                                ti,
                                "settings.color",
                                e.target.value,
                              )
                            }
                          />
                        </label>
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <b style={{ fontSize: 12 }}>Keypoints</b>
                          <button onClick={() => addPoint(ti)}>Add keypoint</button>
                        </div>
                        {(track.points ?? []).length === 0 ? (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            No keypoints
                          </div>
                        ) : (
                          (track.points ?? []).map((pt: any, pi: number) => {
                            const key = makePointKey(ti, pi);
                            return (
                              <div
                                key={pt.id ?? key}
                                style={{
                                  border: "1px solid #2a2d31",
                                  borderRadius: 6,
                                  background: "#111418",
                                  padding: 8,
                                  display: "grid",
                                  gap: 6,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <label
                                    style={{
                                      display: "grid",
                                      gap: 4,
                                      width: 140,
                                    }}
                                  >
                                    <span style={{ fontSize: 12, opacity: 0.75 }}>
                                      Stamp (0-1)
                                    </span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={pt.stamp ?? 0}
                                      onChange={(e) =>
                                        updatePointStamp(
                                          ti,
                                          pi,
                                          Number(e.target.value),
                                        )
                                      }
                                    />
                                  </label>
                                  <div style={{ marginLeft: "auto" }}>
                                    <button onClick={() => removePoint(ti, pi)}>
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <label style={{ display: "grid", gap: 4 }}>
                                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                                    Value (JSON)
                                  </span>
                                  <textarea
                                    value={valueInputs[key] ?? ""}
                                    onChange={(e) =>
                                      updatePointValue(ti, pi, e.target.value)
                                    }
                                    style={{
                                      minHeight: 80,
                                      background: "#0f1113",
                                      color: "#eaeaea",
                                      border: "1px solid #2a2d31",
                                      borderRadius: 6,
                                      padding: 6,
                                      fontFamily: "monospace",
                                      fontSize: 12,
                                    }}
                                  />
                                  {valueErrors[key] && (
                                    <div style={{ color: "#f87171", fontSize: 11 }}>
                                      {valueErrors[key]}
                                    </div>
                                  )}
                                </label>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyChanges}>Apply & Reload</button>
                <button onClick={resetDraft} type="button">
                  Reset
                </button>
              </div>
              {status && (
                <div style={{ color: "#34d399", fontSize: 12 }}>{status}</div>
              )}
              {error && (
                <div style={{ color: "#f87171", fontSize: 12 }}>Error: {error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

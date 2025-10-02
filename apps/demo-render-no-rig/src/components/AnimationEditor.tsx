import { useMemo, useState } from "react";

import type {
  AnimationEditorState,
  AnimationKeyframeState,
  AnimationTrackState,
  OrchestratorAnimatableOption,
  ValueKind,
} from "../types";
import { ValueField } from "./ValueField";
import { defaultValueForKind } from "../utils/valueHelpers";
import { updateTracksForSelectedAnim } from "../utils/animatableOptions";

const LOOP_MODES = ["once", "loop", "pingpong"] as const;
const VALUE_KIND_OPTIONS: ValueKind[] = [
  "float",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "quat",
  "color",
  "vector",
  "transform",
  "custom",
];

interface AnimationEditorProps {
  value: AnimationEditorState;
  onChange: (state: AnimationEditorState) => void;
  animatableOptions: OrchestratorAnimatableOption[];
}

function cloneState(state: AnimationEditorState): AnimationEditorState {
  return structuredClone(state);
}

function findOption(
  options: OrchestratorAnimatableOption[],
  track: AnimationTrackState,
): OrchestratorAnimatableOption | undefined {
  if (track.optionId) {
    return options.find((option) => option.optionId === track.optionId);
  }
  return options.find((option) => option.animId === track.animatableId);
}

function normalizeKind(
  option?: OrchestratorAnimatableOption | undefined,
): ValueKind {
  if (!option?.type) {
    return "float";
  }
  const type = option.type.toLowerCase();
  if (type.includes("vec2")) return "vec2";
  if (type.includes("vec3")) return "vec3";
  if (type.includes("vec4")) return "vec4";
  if (type.includes("quat")) return "quat";
  if (type.includes("color")) return "color";
  if (type.includes("transform")) return "transform";
  if (type.includes("vector")) return "vector";
  if (type.includes("bool")) return "bool";
  if (type.includes("float")) return "float";
  return "custom";
}

function ensureHandle(handle?: AnimationKeyframeState["handleIn"] | null): {
  x: number;
  y: number;
} {
  return {
    x: Number(handle?.x ?? 0.25),
    y: Number(handle?.y ?? 0.25),
  };
}

function createKeyframe(kind: ValueKind): AnimationKeyframeState {
  return {
    id: `kf-${Math.random().toString(36).slice(2, 10)}`,
    stamp: 0,
    value: defaultValueForKind(kind),
  };
}

function summarizeTrack(
  track: AnimationTrackState,
  option: OrchestratorAnimatableOption | undefined,
): string {
  const label = track.name || option?.label || track.id;
  const target = option?.component
    ? `${option.group ? `${option.group} • ` : ""}${option.label}`
    : track.animatableId || option?.label || "–";
  const keyCount = track.keyframes.length;
  return `${label} • ${target} • ${track.valueKind} • ${keyCount} key${keyCount === 1 ? "" : "s"}`;
}

export function AnimationEditor({
  value,
  onChange,
  animatableOptions,
}: AnimationEditorProps) {
  const [shapeErrors, setShapeErrors] = useState<Record<string, string | null>>(
    {},
  );
  const [collapsedTracks, setCollapsedTracks] = useState<
    Record<string, boolean>
  >({});

  const commit = (
    mutator: (next: AnimationEditorState) => void,
    opts?: { coerce?: boolean },
  ) => {
    const next = cloneState(value);
    mutator(next);
    if (opts?.coerce) {
      onChange(updateTracksForSelectedAnim(next, animatableOptions));
      return;
    }
    onChange(next);
  };

  const handleMetaChange = <K extends keyof AnimationEditorState>(
    key: K,
    newValue: AnimationEditorState[K],
  ) => {
    commit((next) => {
      next[key] = newValue;
    });
  };

  const handleTrackChange = (
    index: number,
    updater: (track: AnimationTrackState) => void,
    opts?: { coerce?: boolean },
  ) => {
    commit((next) => {
      const track = next.tracks[index];
      if (!track) return;
      updater(track);
    }, opts);
  };

  const handleTrackTargetChange = (index: number, optionId: string) => {
    const option = animatableOptions.find((item) => item.optionId === optionId);
    handleTrackChange(
      index,
      (track) => {
        if (option) {
          track.animatableId = option.animId;
          track.optionId = option.optionId;
          track.componentKey = option.component?.key ?? null;
          track.valueKind = normalizeKind(option);
        } else {
          track.animatableId = optionId;
          track.optionId = optionId;
          track.componentKey = null;
        }
      },
      { coerce: true },
    );
  };

  const handleValueKindChange = (index: number, kind: ValueKind) => {
    handleTrackChange(index, (track) => {
      track.valueKind = kind;
      track.keyframes = track.keyframes.map((keyframe) => ({
        ...keyframe,
        value: defaultValueForKind(kind),
      }));
    });
  };

  const handleShapeJsonChange = (index: number, raw: string) => {
    const trackId = value.tracks[index]?.id ?? `track-${index}`;
    setShapeErrors((prev) => ({
      ...prev,
      [trackId]: (() => {
        if (!raw.trim()) {
          return null;
        }
        try {
          JSON.parse(raw);
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid JSON";
        }
      })(),
    }));
    handleTrackChange(index, (track) => {
      track.shapeJson = raw;
    });
  };

  const handleAddTrack = () => {
    const option = animatableOptions[0];
    const kind = normalizeKind(option);
    const newTrack: AnimationTrackState = {
      id: `track-${Math.random().toString(36).slice(2, 10)}`,
      name: option?.label ?? "New Track",
      animatableId: option?.animId ?? "",
      optionId: option?.optionId ?? option?.animId ?? "",
      componentKey: option?.component?.key ?? null,
      valueKind: kind,
      shapeJson: undefined,
      keyframes: [
        createKeyframe(kind),
        {
          ...createKeyframe(kind),
          id: `kf-${Math.random().toString(36).slice(2, 10)}`,
          stamp: 1,
        },
      ],
    };
    commit(
      (next) => {
        next.tracks.push(newTrack);
      },
      { coerce: true },
    );
    setCollapsedTracks((prev) => ({ ...prev, [newTrack.id]: false }));
  };

  const handleRemoveTrack = (index: number) => {
    const trackId = value.tracks[index]?.id;
    commit((next) => {
      next.tracks.splice(index, 1);
    });
    if (trackId) {
      setShapeErrors((prev) => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
      setCollapsedTracks((prev) => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
    }
  };

  const handleKeyframeChange = (
    trackIndex: number,
    keyIndex: number,
    updater: (keyframe: AnimationKeyframeState) => void,
  ) => {
    handleTrackChange(trackIndex, (track) => {
      const keyframe = track.keyframes[keyIndex];
      if (!keyframe) return;
      updater(keyframe);
    });
  };

  const handleAddKeyframe = (trackIndex: number) => {
    const track = value.tracks[trackIndex];
    if (!track) return;
    const newKeyframe = createKeyframe(track.valueKind);
    const lastStamp = track.keyframes[track.keyframes.length - 1]?.stamp ?? 1;
    newKeyframe.stamp = Math.min(
      1,
      Math.max(0, Number((lastStamp + 0.1).toFixed(2))),
    );
    handleTrackChange(trackIndex, (nextTrack) => {
      nextTrack.keyframes.push(newKeyframe);
      nextTrack.keyframes.sort((a, b) => a.stamp - b.stamp);
    });
  };

  const handleRemoveKeyframe = (trackIndex: number, keyIndex: number) => {
    handleTrackChange(trackIndex, (track) => {
      track.keyframes.splice(keyIndex, 1);
    });
  };

  const handleToggleHandle = (
    trackIndex: number,
    keyIndex: number,
    handle: "handleIn" | "handleOut",
  ) => {
    handleKeyframeChange(trackIndex, keyIndex, (keyframe) => {
      keyframe[handle] = keyframe[handle] ? null : ensureHandle();
    });
  };

  const handleHandleValueChange = (
    trackIndex: number,
    keyIndex: number,
    handle: "handleIn" | "handleOut",
    axis: "x" | "y",
    raw: string,
  ) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    handleKeyframeChange(trackIndex, keyIndex, (keyframe) => {
      const current = ensureHandle(keyframe[handle]);
      keyframe[handle] = { ...current, [axis]: parsed };
    });
  };

  const animatableGroups = useMemo(() => {
    const groups = new Map<string, OrchestratorAnimatableOption[]>();
    animatableOptions.forEach((option) => {
      const key = option.group ?? "misc";
      const list = groups.get(key) ?? [];
      list.push(option);
      groups.set(key, list);
    });
    return Array.from(groups.entries());
  }, [animatableOptions]);

  return (
    <div className="panel animation-editor">
      <div className="panel-header">
        <h2>Animation Editor</h2>
        <span className="tag">tracks {value.tracks.length}</span>
      </div>
      <div className="panel-body">
        <fieldset>
          <legend>Animation</legend>
          <label>
            <span>Name</span>
            <input
              className="text-input"
              type="text"
              value={value.name}
              onChange={(event) => handleMetaChange("name", event.target.value)}
            />
          </label>
          <label>
            <span>ID</span>
            <input
              className="text-input"
              type="text"
              value={value.id}
              onChange={(event) => handleMetaChange("id", event.target.value)}
            />
          </label>
          <label>
            <span>Duration (ms)</span>
            <input
              className="text-input"
              type="number"
              min={1}
              value={value.duration}
              onChange={(event) =>
                handleMetaChange("duration", Number(event.target.value))
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Player</legend>
          <label>
            <span>Player name</span>
            <input
              className="text-input"
              type="text"
              value={value.playerName}
              onChange={(event) =>
                handleMetaChange("playerName", event.target.value)
              }
            />
          </label>
          <label>
            <span>Loop mode</span>
            <select
              className="select-input"
              value={value.loopMode}
              onChange={(event) =>
                handleMetaChange(
                  "loopMode",
                  event.target.value as AnimationEditorState["loopMode"],
                )
              }
            >
              {LOOP_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Speed</span>
            <input
              className="text-input"
              type="number"
              step={0.1}
              value={value.speed}
              onChange={(event) =>
                handleMetaChange("speed", Number(event.target.value))
              }
            />
          </label>
        </fieldset>

        <section className="tracks">
          {value.tracks.map((track, trackIndex) => {
            const option = findOption(animatableOptions, track);
            const trackId = track.id;
            const shapeError = shapeErrors[trackId ?? ""] ?? null;
            const collapsed = trackId
              ? (collapsedTracks[trackId] ?? true)
              : true;
            const isOpen = !collapsed;
            const selectionValue = track.optionId ?? track.animatableId;
            const selectionExists = animatableOptions.some(
              (candidate) => candidate.optionId === selectionValue,
            );
            return (
              <details
                key={track.id}
                className="track-card"
                open={isOpen}
                onToggle={(event) => {
                  const details = event.currentTarget;
                  setCollapsedTracks((prev) => ({
                    ...prev,
                    [trackId]: !details.open,
                  }));
                }}
              >
                <summary>
                  <div>
                    <strong>{track.name || `Track ${trackIndex + 1}`}</strong>
                    <span className="track-summary">
                      {summarizeTrack(track, option)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-muted"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRemoveTrack(trackIndex);
                    }}
                  >
                    Remove track
                  </button>
                </summary>
                <div className="track-body">
                  <label>
                    <span>Track name</span>
                    <input
                      className="text-input"
                      type="text"
                      value={track.name}
                      onChange={(event) =>
                        handleTrackChange(trackIndex, (nextTrack) => {
                          nextTrack.name = event.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Track ID</span>
                    <input
                      className="text-input"
                      type="text"
                      value={track.id}
                      onChange={(event) =>
                        handleTrackChange(trackIndex, (nextTrack) => {
                          nextTrack.id = event.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Target animatable</span>
                    <select
                      className="select-input"
                      value={selectionValue}
                      onChange={(event) =>
                        handleTrackTargetChange(trackIndex, event.target.value)
                      }
                    >
                      {!selectionExists && selectionValue ? (
                        <option value={selectionValue}>{selectionValue}</option>
                      ) : null}
                      {animatableGroups.map(([group, options]) => (
                        <optgroup key={group} label={group}>
                          {options.map((item) => (
                            <option key={item.optionId} value={item.optionId}>
                              {item.group
                                ? `${item.group} • ${item.label}`
                                : item.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Value kind</span>
                    <select
                      className="select-input"
                      value={track.valueKind}
                      onChange={(event) =>
                        handleValueKindChange(
                          trackIndex,
                          event.target.value as ValueKind,
                        )
                      }
                    >
                      {VALUE_KIND_OPTIONS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Shape JSON (optional)</span>
                    <textarea
                      className={shapeError ? "input-error" : ""}
                      rows={4}
                      value={track.shapeJson ?? ""}
                      onChange={(event) =>
                        handleShapeJsonChange(trackIndex, event.target.value)
                      }
                      placeholder='{ "kind": "vector", ... }'
                    />
                    {shapeError ? (
                      <p className="form-error">{shapeError}</p>
                    ) : null}
                  </label>

                  <div className="keyframes">
                    <div className="keyframes-header">
                      <strong>Keyframes</strong>
                      <button
                        type="button"
                        className="btn btn-muted"
                        onClick={() => handleAddKeyframe(trackIndex)}
                      >
                        Add keyframe
                      </button>
                    </div>
                    {track.keyframes.map((keyframe, keyIndex) => (
                      <div key={keyframe.id} className="keyframe-card">
                        <div className="keyframe-header">
                          <strong>{keyframe.id}</strong>
                          <button
                            type="button"
                            className="btn btn-muted"
                            onClick={() =>
                              handleRemoveKeyframe(trackIndex, keyIndex)
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <div className="keyframe-row">
                          <label>
                            <span>Stamp (0-1)</span>
                            <input
                              className="text-input"
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={keyframe.stamp}
                              onChange={(event) =>
                                handleKeyframeChange(
                                  trackIndex,
                                  keyIndex,
                                  (nextKeyframe) => {
                                    const parsed = Number(event.target.value);
                                    nextKeyframe.stamp = Number.isFinite(parsed)
                                      ? Math.min(Math.max(parsed, 0), 1)
                                      : nextKeyframe.stamp;
                                  },
                                )
                              }
                            />
                          </label>
                          <label className="value-field">
                            <span>Value</span>
                            <ValueField
                              kind={track.valueKind}
                              value={keyframe.value}
                              onChange={(newValue) =>
                                handleKeyframeChange(
                                  trackIndex,
                                  keyIndex,
                                  (nextKeyframe) => {
                                    nextKeyframe.value = newValue;
                                  },
                                )
                              }
                              allowDynamicLength={track.valueKind === "vector"}
                            />
                          </label>
                        </div>
                        <div className="handle-row">
                          <div className="handle-group">
                            <div className="handle-header">
                              <span>Handle in</span>
                              <button
                                type="button"
                                className="btn btn-muted"
                                onClick={() =>
                                  handleToggleHandle(
                                    trackIndex,
                                    keyIndex,
                                    "handleIn",
                                  )
                                }
                              >
                                {keyframe.handleIn ? "Remove" : "Add"}
                              </button>
                            </div>
                            {keyframe.handleIn ? (
                              <div className="handle-inputs">
                                <label>
                                  <span>X</span>
                                  <input
                                    className="text-input"
                                    type="number"
                                    step={0.01}
                                    value={ensureHandle(keyframe.handleIn).x}
                                    onChange={(event) =>
                                      handleHandleValueChange(
                                        trackIndex,
                                        keyIndex,
                                        "handleIn",
                                        "x",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Y</span>
                                  <input
                                    className="text-input"
                                    type="number"
                                    step={0.01}
                                    value={ensureHandle(keyframe.handleIn).y}
                                    onChange={(event) =>
                                      handleHandleValueChange(
                                        trackIndex,
                                        keyIndex,
                                        "handleIn",
                                        "y",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                          <div className="handle-group">
                            <div className="handle-header">
                              <span>Handle out</span>
                              <button
                                type="button"
                                className="btn btn-muted"
                                onClick={() =>
                                  handleToggleHandle(
                                    trackIndex,
                                    keyIndex,
                                    "handleOut",
                                  )
                                }
                              >
                                {keyframe.handleOut ? "Remove" : "Add"}
                              </button>
                            </div>
                            {keyframe.handleOut ? (
                              <div className="handle-inputs">
                                <label>
                                  <span>X</span>
                                  <input
                                    className="text-input"
                                    type="number"
                                    step={0.01}
                                    value={ensureHandle(keyframe.handleOut).x}
                                    onChange={(event) =>
                                      handleHandleValueChange(
                                        trackIndex,
                                        keyIndex,
                                        "handleOut",
                                        "x",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Y</span>
                                  <input
                                    className="text-input"
                                    type="number"
                                    step={0.01}
                                    value={ensureHandle(keyframe.handleOut).y}
                                    onChange={(event) =>
                                      handleHandleValueChange(
                                        trackIndex,
                                        keyIndex,
                                        "handleOut",
                                        "y",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddTrack}
          >
            Add track
          </button>
        </section>
      </div>
    </div>
  );
}

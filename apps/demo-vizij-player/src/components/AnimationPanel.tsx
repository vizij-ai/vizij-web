import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";

import { useAppState } from "../state/AppStateContext";
import type { AnimationAsset, AnimationTrack } from "../state/types";
import type { RigDefinition } from "../orchestrator/useOrchestratorMerging";

type AnimationPanelProps = {
  animationInputPaths: string[];
  rigDefinitions: RigDefinition[];
  lowLevelDefinition: RigDefinition | null;
  orchestratorReady: boolean;
};

function sampleTrack(track: AnimationTrack, time: number): number {
  if (!track.keyframes.length) {
    return 0;
  }
  if (time <= track.keyframes[0]!.time) {
    return track.keyframes[0]!.value;
  }
  for (let i = 0; i < track.keyframes.length - 1; i += 1) {
    const current = track.keyframes[i]!;
    const next = track.keyframes[i + 1]!;
    if (time >= current.time && time <= next.time) {
      const range = next.time - current.time || 1;
      const factor = (time - current.time) / range;
      return current.value + (next.value - current.value) * factor;
    }
  }
  return track.keyframes[track.keyframes.length - 1]!.value;
}

function sampleClip(
  clip: AnimationAsset["clip"],
  time: number,
): Array<{
  path: string;
  value: number;
}> {
  return clip.tracks.map((track) => ({
    path: `animation/${clip.id}/${track.channel}`,
    value: sampleTrack(track, time),
  }));
}

function cloneTrack(track: AnimationTrack): AnimationTrack {
  return {
    channel: track.channel,
    keyframes: track.keyframes.map((keyframe) => ({
      time: keyframe.time,
      value: keyframe.value,
    })),
  };
}

function cloneClip(clip: AnimationAsset["clip"]): AnimationAsset["clip"] {
  return {
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.map((track) => cloneTrack(track)),
  };
}

function createClipId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AnimationPanel({
  animationInputPaths,
  rigDefinitions,
  lowLevelDefinition,
  orchestratorReady,
}: AnimationPanelProps) {
  const {
    state: { animations, selectedAnimationId },
    importAnimation,
    createAnimation,
    removeAnimation,
    updateAnimation,
    setSelectedAnimation,
    setAnimationWeight,
  } = useAppState();
  const { setInput } = useOrchestrator();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [loop, setLoop] = useState(true);
  const [currentSamples, setCurrentSamples] = useState<
    Array<{ path: string; value: number }>
  >([]);
  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const channelOptions = useMemo(() => {
    const map = new Map<string, string>();
    rigDefinitions.forEach((rig) => {
      rig.inputs.forEach((input) => {
        if (!map.has(input.path)) {
          map.set(input.path, `${rig.label} • ${input.label}`);
        }
      });
    });
    if (lowLevelDefinition) {
      lowLevelDefinition.inputs.forEach((input) => {
        if (!map.has(input.path)) {
          map.set(input.path, input.path);
        }
      });
    }
    return Array.from(map.entries()).map(([path, label]) => ({ path, label }));
  }, [rigDefinitions, lowLevelDefinition]);

  const selectedAsset = useMemo(
    () => animations.find((asset) => asset.id === selectedAnimationId) ?? null,
    [animations, selectedAnimationId],
  );

  useEffect(() => {
    if (!playingId || !selectedAsset || playingId !== selectedAsset.id) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
      return undefined;
    }

    const tick = (timestamp: number) => {
      if (!lastTimestampRef.current) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      setTime((prev) => {
        const next = prev + delta;
        if (next >= selectedAsset.clip.duration) {
          if (loop) {
            return next % (selectedAsset.clip.duration || 1);
          }
          setPlayingId(null);
          return selectedAsset.clip.duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [playingId, selectedAsset, loop]);

  const safeSetInput = useCallback(
    (path: string, value: Parameters<typeof setInput>[1]) => {
      if (!orchestratorReady) {
        return;
      }
      console.log("demo-animating-faces: staging animation input", path, value);
      setInput(path, value);
    },
    [setInput, orchestratorReady],
  );

  useEffect(() => {
    if (!orchestratorReady) {
      return;
    }
    animationInputPaths.forEach((path) => {
      safeSetInput(path, { float: 0 });
    });
    if (!selectedAsset) {
      setCurrentSamples([]);
      return;
    }
    const weight = Number.isFinite(selectedAsset.weight)
      ? selectedAsset.weight
      : 1;
    const samples = sampleClip(selectedAsset.clip, time).map((sample) => ({
      path: sample.path,
      value: sample.value * weight,
    }));
    samples.forEach((sample) => {
      safeSetInput(sample.path, { float: sample.value });
    });
    setCurrentSamples(samples);
  }, [
    selectedAsset,
    time,
    animationInputPaths,
    orchestratorReady,
    safeSetInput,
  ]);

  const handlePlay = useCallback(
    (asset: AnimationAsset) => {
      setSelectedAnimation(asset.id);
      setPlayingId(asset.id);
      setTime(0);
      lastTimestampRef.current = null;
    },
    [setSelectedAnimation],
  );

  const handleStop = useCallback(() => {
    setPlayingId(null);
    setTime(0);
    lastTimestampRef.current = null;
  }, []);

  const commitClipChange = useCallback(
    (
      asset: AnimationAsset,
      mutator: (clip: AnimationAsset["clip"]) => void,
      extend?: (nextAsset: AnimationAsset) => void,
    ) => {
      const nextClip = cloneClip(asset.clip);
      mutator(nextClip);
      const nextAsset: AnimationAsset = {
        ...asset,
        clip: nextClip,
        updatedAt: new Date().toISOString(),
      };
      if (extend) {
        extend(nextAsset);
      }
      updateAnimation(nextAsset);
    },
    [updateAnimation],
  );

  const handleCreateClip = useCallback(() => {
    const clipId = createClipId();
    const label = `New Clip ${animations.length + 1}`;
    const clip: AnimationAsset["clip"] = {
      id: clipId,
      name: label,
      duration: 2,
      tracks: [],
    };
    createAnimation(clip, label);
    setSelectedAnimation(clipId);
    setPlayingId(clipId);
    setTime(0);
  }, [animations.length, createAnimation, setSelectedAnimation]);

  const handleExportClip = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    const payload = JSON.stringify(selectedAsset.clip, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedAsset.label.replace(/\s+/g, "_").toLowerCase() || "animation"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedAsset]);

  const handleImportClips = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) {
        return;
      }
      for (const file of Array.from(files)) {
        await importAnimation(file);
      }
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    },
    [importAnimation],
  );

  const handleClipRename = useCallback(
    (asset: AnimationAsset, nextLabel: string) => {
      const label = nextLabel.trim() || "Untitled Clip";
      commitClipChange(
        asset,
        (clip) => {
          clip.name = label;
        },
        (nextAsset) => {
          nextAsset.label = label;
          nextAsset.fileName = `${label.replace(/\s+/g, "_").toLowerCase() || "animation"}.json`;
        },
      );
    },
    [commitClipChange],
  );

  const handleDurationChange = useCallback(
    (asset: AnimationAsset, value: number) => {
      const nextDuration = Number.isFinite(value) && value > 0 ? value : 1;
      commitClipChange(asset, (clip) => {
        clip.duration = nextDuration;
      });
      setTime((prev) => Math.min(prev, nextDuration));
    },
    [commitClipChange],
  );

  const handleAddTrack = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    const defaultChannel =
      channelOptions[0]?.path ?? `rig/${selectedAsset.clip.id}/channel`;
    commitClipChange(selectedAsset, (clip) => {
      const nextTrack: AnimationTrack = {
        channel: defaultChannel,
        keyframes: [
          { time: 0, value: 0 },
          { time: clip.duration || 1, value: 0 },
        ],
      };
      clip.tracks = [...clip.tracks, nextTrack];
    });
  }, [channelOptions, commitClipChange, selectedAsset]);

  const handleRemoveTrack = useCallback(
    (asset: AnimationAsset, trackIndex: number) => {
      commitClipChange(asset, (clip) => {
        clip.tracks = clip.tracks.filter((_, index) => index !== trackIndex);
      });
    },
    [commitClipChange],
  );

  const handleTrackChannelChange = useCallback(
    (asset: AnimationAsset, trackIndex: number, nextChannel: string) => {
      commitClipChange(asset, (clip) => {
        const track = clip.tracks[trackIndex];
        if (!track) {
          return;
        }
        track.channel = nextChannel;
      });
    },
    [commitClipChange],
  );

  const handleAddKeyframe = useCallback(
    (asset: AnimationAsset, trackIndex: number) => {
      commitClipChange(asset, (clip) => {
        const track = clip.tracks[trackIndex];
        if (!track) {
          return;
        }
        const lastTime = track.keyframes[track.keyframes.length - 1]?.time ?? 0;
        const nextTime = Math.min(clip.duration, lastTime + 0.25);
        track.keyframes = [
          ...track.keyframes,
          { time: nextTime, value: 0 },
        ].sort((a, b) => a.time - b.time);
      });
    },
    [commitClipChange],
  );

  const handleKeyframeUpdate = useCallback(
    (
      asset: AnimationAsset,
      trackIndex: number,
      keyIndex: number,
      field: "time" | "value",
      rawValue: number,
    ) => {
      commitClipChange(asset, (clip) => {
        const track = clip.tracks[trackIndex];
        if (!track) {
          return;
        }
        const keyframe = track.keyframes[keyIndex];
        if (!keyframe) {
          return;
        }
        if (field === "time") {
          keyframe.time = Math.max(0, Math.min(rawValue, clip.duration));
          track.keyframes.sort((a, b) => a.time - b.time);
        } else {
          keyframe.value = rawValue;
        }
      });
    },
    [commitClipChange],
  );

  const handleRemoveKeyframe = useCallback(
    (asset: AnimationAsset, trackIndex: number, keyIndex: number) => {
      commitClipChange(asset, (clip) => {
        const track = clip.tracks[trackIndex];
        if (!track) {
          return;
        }
        track.keyframes = track.keyframes.filter((_, idx) => idx !== keyIndex);
      });
    },
    [commitClipChange],
  );

  return (
    <section
      className="panel animation-panel"
      aria-labelledby="animation-panel-title"
    >
      <header className="panel-header">
        <h2 id="animation-panel-title">Animations</h2>
      </header>
      <div className="panel-body animation-body">
        <div className="animation-toolbar">
          <button type="button" onClick={handleCreateClip}>
            New Clip
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            Import
          </button>
          <button
            type="button"
            onClick={handleExportClip}
            disabled={!selectedAsset}
          >
            Export
          </button>
          <label className="loop-toggle">
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => setLoop(event.target.checked)}
            />
            Loop playback
          </label>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            multiple
            hidden
            onChange={(event) => {
              void handleImportClips(event.target.files);
            }}
          />
        </div>

        <div className="animation-library">
          {animations.length === 0 ? (
            <div className="panel-status">
              Create or import clips to begin authoring animations.
            </div>
          ) : (
            animations.map((asset) => {
              const isSelected = asset.id === selectedAnimationId;
              const isPlaying = asset.id === playingId;
              return (
                <div
                  key={asset.id}
                  className={`animation-list-item ${isSelected ? "selected" : ""}`}
                >
                  <div className="animation-list-info">
                    <h3>{asset.label}</h3>
                    <span>
                      {asset.clip.tracks.length} tracks •{" "}
                      {asset.clip.duration.toFixed(2)}s
                    </span>
                  </div>
                  <div className="animation-actions">
                    <button type="button" onClick={() => handlePlay(asset)}>
                      Play
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      disabled={!isPlaying}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAnimation(asset.id);
                        setPlayingId(null);
                        setTime(0);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="delete"
                      onClick={() => removeAnimation(asset.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedAsset ? (
          <div className="animation-editor">
            <div className="animation-meta">
              <label>
                Clip Name
                <input
                  type="text"
                  value={selectedAsset.label}
                  onChange={(event) =>
                    handleClipRename(selectedAsset, event.target.value)
                  }
                />
              </label>
              <label>
                Duration (s)
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={selectedAsset.clip.duration}
                  onChange={(event) =>
                    handleDurationChange(
                      selectedAsset,
                      Number.parseFloat(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                Weight
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={selectedAsset.weight}
                  onChange={(event) =>
                    setAnimationWeight(
                      selectedAsset.id,
                      Number.parseFloat(event.target.value),
                    )
                  }
                />
                <span className="weight-value">
                  {selectedAsset.weight.toFixed(2)}
                </span>
              </label>
            </div>

            <div className="animation-scrub">
              <input
                type="range"
                min={0}
                max={selectedAsset.clip.duration || 1}
                step={0.01}
                value={time}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  setPlayingId(null);
                  setTime(next);
                }}
              />
              <span>
                {time.toFixed(2)} / {selectedAsset.clip.duration.toFixed(2)}s
              </span>
            </div>

            <div className="animation-tracks">
              {selectedAsset.clip.tracks.map((track, trackIndex) => (
                <div
                  key={`${track.channel}-${trackIndex}`}
                  className="animation-track"
                >
                  <div className="animation-track-header">
                    <label>
                      Channel
                      <select
                        value={track.channel}
                        onChange={(event) =>
                          handleTrackChannelChange(
                            selectedAsset,
                            trackIndex,
                            event.target.value,
                          )
                        }
                      >
                        {channelOptions.map((option) => (
                          <option key={option.path} value={option.path}>
                            {option.label}
                          </option>
                        ))}
                        {!channelOptions.length ? (
                          <option value={track.channel}>{track.channel}</option>
                        ) : null}
                      </select>
                    </label>
                    <div className="track-actions">
                      <button
                        type="button"
                        onClick={() =>
                          handleAddKeyframe(selectedAsset, trackIndex)
                        }
                      >
                        Add Keyframe
                      </button>
                      <button
                        type="button"
                        className="delete"
                        onClick={() =>
                          handleRemoveTrack(selectedAsset, trackIndex)
                        }
                      >
                        Remove Track
                      </button>
                    </div>
                  </div>
                  <table className="keyframe-table">
                    <thead>
                      <tr>
                        <th>Time (s)</th>
                        <th>Value</th>
                        <th aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {track.keyframes.map((keyframe, keyIndex) => (
                        <tr key={`${keyframe.time}-${keyIndex}`}>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={keyframe.time}
                              onChange={(event) =>
                                handleKeyframeUpdate(
                                  selectedAsset,
                                  trackIndex,
                                  keyIndex,
                                  "time",
                                  Number.parseFloat(event.target.value),
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step={0.01}
                              value={keyframe.value}
                              onChange={(event) =>
                                handleKeyframeUpdate(
                                  selectedAsset,
                                  trackIndex,
                                  keyIndex,
                                  "value",
                                  Number.parseFloat(event.target.value),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="delete"
                              onClick={() =>
                                handleRemoveKeyframe(
                                  selectedAsset,
                                  trackIndex,
                                  keyIndex,
                                )
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="add-track"
              onClick={handleAddTrack}
            >
              Add Track
            </button>
          </div>
        ) : animations.length > 0 ? (
          <div className="panel-status">
            Select a clip to edit keyframes and channels.
          </div>
        ) : null}

        <div className="animation-monitors">
          <h4>Live Channels</h4>
          {currentSamples.length === 0 ? (
            <p className="diag-empty">No animation values staged.</p>
          ) : (
            <ul>
              {currentSamples.map((sample) => (
                <li key={sample.path}>
                  <code>{sample.path}</code> = {sample.value.toFixed(3)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

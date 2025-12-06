import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { FeatureFrame } from "../phoneme-core";
import { AudioManager } from "../utils/audioManager";

function sampleVolumeAtTime(
  frames: FeatureFrame[],
  timeSec: number,
  cursor: { index: number },
) {
  if (!frames.length) return 0;

  // Keep cursor within bounds if cache was reset
  cursor.index = Math.max(0, Math.min(cursor.index, frames.length - 1));

  // Advance cursor while frames are <= time
  while (
    cursor.index + 1 < frames.length &&
    frames[cursor.index + 1].time <= timeSec
  ) {
    cursor.index += 1;
  }

  // If we haven't reached the first frame yet, treat as silence
  if (timeSec < frames[0].time - 0.02) {
    return 0;
  }

  return frames[cursor.index]?.features.volume ?? 0;
}

export function useVolumeChin({
  audioManager,
  enabled,
  ready,
  smoothMs = 100,
  path = "/outerface001/chin/value",
}: {
  audioManager: AudioManager;
  enabled: boolean;
  ready: boolean;
  smoothMs?: number;
  path?: string;
}) {
  const { setInput, faceId: runtimeFaceId } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();

  useEffect(() => {
    if (!ready) return;

    const resolvedPath = path.startsWith("rig/")
      ? path
      : `rig/${faceId}/${path.replace(/^\//, "")}`;

    if (!enabled) {
      setInput(resolvedPath, { float: 0 });
      return;
    }

    let raf: number;
    const cursor = { index: 0 };
    let smoothed = 0;
    let lastTs = performance.now();

    const tick = () => {
      const frames = audioManager.getFeatureFrames();
      const playback = audioManager.getPlaybackState();
      const target = sampleVolumeAtTime(frames, playback.played, cursor);

      const now = performance.now();
      const dt = Math.min(now - lastTs, smoothMs * 3);
      const alpha = Math.min(1, dt / smoothMs);
      smoothed += (target - smoothed) * alpha;
      lastTs = now;

      setInput(resolvedPath, { float: smoothed });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      smoothed = 0;
      setInput(resolvedPath, { float: 0 });
    };
  }, [audioManager, enabled, faceId, path, ready, setInput, smoothMs]);
}

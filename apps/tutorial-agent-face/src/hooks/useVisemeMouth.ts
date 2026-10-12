import { useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  PHONEME_TO_VISEME,
  buildPhonemeTimeline,
  alignVisemes,
  synthesizePhonemes,
  type SynthFrame,
  type VisemeId,
  type Phoneme,
  type PhonemeEvent,
} from "../phoneme-core";
import type { AudioManager } from "../utils/audioManager";
import { standardShape } from "../standardVisemes";

/** The weight each viseme plays at. */
const VISEME_WEIGHT = 0.7;
const ALIGN_MAX_RUN_MS = 30;

/**
 * Drive the lips from the agent's speech: a timeline of visemes built from
 * the audio being played and its transcript (`mode`), read at the playhead
 * plus `leadMs`, and each new viseme played through the device's
 * `play_viseme` — whose viseme players own the envelope and the crossfade.
 */
export function useVisemeMouth({
  audioManager,
  currentOutput,
  enabled,
  mode,
  leadMs,
}: {
  audioManager: AudioManager;
  currentOutput: string;
  enabled: boolean;
  mode: "baseline" | "synth" | "align";
  leadMs: number; // ms to lead visemes (positive = earlier)
}) {
  const { runtime } = useVizijRuntime();
  const outputRef = useRef(currentOutput);

  useEffect(() => {
    outputRef.current = currentOutput;
  }, [currentOutput]);

  useEffect(() => {
    if (!enabled || !runtime) return;
    let raf: number;
    let lastFrameCount = -1;
    let lastFeatureCount = -1;
    let lastOutput = "";
    let keyframes: VisemeKeyframe[] = [];
    let playing: string | null = null;

    const rebuildKeyframes = () => {
      const frames = audioManager.getPhonemeFrames();
      const features = audioManager.getFeatureFrames();
      const playback = audioManager.getPlaybackState();
      const text = outputRef.current;
      const lastFrameTime = frames.length ? frames[frames.length - 1].time : 0;
      const lastFeatureTime = features.length
        ? features[features.length - 1].time
        : 0;
      const totalDuration = Math.max(
        playback.total,
        lastFrameTime,
        lastFeatureTime,
        0.1,
      );
      const baseline = buildPhonemeTimeline(text, totalDuration);
      const textEvents = baseline.events as PhonemeEvent[];

      let built = false;
      if (
        mode === "align" &&
        frames.length > 0 &&
        features.length > 1 &&
        textEvents.length > 0
      ) {
        const started = performance.now();
        const phonemes = textEvents.map((evt) => evt.phoneme as Phoneme);
        const wordIdx = textEvents.map((evt) => evt.wordIndex);
        const { events: aligned } = alignVisemes(
          features,
          frames,
          phonemes,
          wordIdx,
          { durationGuide: textEvents },
        );
        if (aligned.length && performance.now() - started <= ALIGN_MAX_RUN_MS) {
          keyframes = aligned.map((evt) => ({
            viseme: PHONEME_TO_VISEME[evt.phoneme as Phoneme],
            start: evt.startTime,
            end: evt.endTime,
          }));
          built = true;
        }
      }
      if (!built) {
        keyframes =
          mode === "synth" && frames.length > 0
            ? synthFramesToEvents(
                synthesizePhonemes(frames, textEvents, 20),
                0.02,
              )
            : baseline.events.map((evt) => ({
                viseme: PHONEME_TO_VISEME[evt.phoneme as Phoneme],
                start: evt.startTime,
                end: evt.endTime,
              }));
      }

      lastFrameCount = frames.length;
      lastFeatureCount = features.length;
      lastOutput = text;
    };

    const tick = () => {
      if (
        audioManager.getPhonemeFrames().length !== lastFrameCount ||
        audioManager.getFeatureFrames().length !== lastFeatureCount ||
        outputRef.current !== lastOutput
      ) {
        rebuildKeyframes();
      }
      const playback = audioManager.getPlaybackState();
      const t = playback.played + leadMs / 1000;
      const idx = findKeyframeIndex(keyframes, t);
      const shape = standardShape(idx >= 0 ? keyframes[idx].viseme : "sil");
      if (shape !== playing) {
        playing = shape;
        void runtime.invoke("play_viseme", { shape, weight: VISEME_WEIGHT });
      }
      raf = requestAnimationFrame(tick);
    };

    rebuildKeyframes();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      void runtime.invoke("play_viseme", { shape: "sil", weight: 1 });
    };
  }, [audioManager, enabled, leadMs, mode, runtime]);
}

type VisemeKeyframe = {
  viseme: VisemeId;
  start: number; // seconds from chain start
  end: number;
};

function synthFramesToEvents(
  frames: SynthFrame[],
  fallbackStep: number,
): VisemeKeyframe[] {
  if (!frames.length) return [];
  const events: VisemeKeyframe[] = [];
  let current: VisemeKeyframe | null = null;

  frames.forEach((frame, idx) => {
    const nextTime =
      idx < frames.length - 1
        ? frames[idx + 1].time
        : frame.time + fallbackStep;
    if (!current) {
      current = { viseme: frame.viseme, start: frame.time, end: nextTime };
      return;
    }
    if (frame.viseme === current.viseme) {
      current.end = nextTime;
    } else {
      events.push(current);
      current = { viseme: frame.viseme, start: frame.time, end: nextTime };
    }
  });

  if (current) events.push(current);
  return events;
}

function findKeyframeIndex(frames: VisemeKeyframe[], t: number): number {
  for (let i = 0; i < frames.length; i += 1) {
    if (t >= frames[i].start && t <= frames[i].end) return i;
  }
  return frames.length ? frames.length - 1 : -1;
}

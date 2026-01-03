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
import { FACE_VISEME_SEGMENTS, mapPollyViseme } from "../visemeMapping";

export function useVisemeMouth({
  audioManager,
  currentOutput,
  enabled,
  mode,
  transitionMs,
  leadMs,
}: {
  audioManager: AudioManager;
  currentOutput: string;
  enabled: boolean;
  mode: "baseline" | "synth" | "align";
  transitionMs: number; // ms for crossfade
  leadMs: number; // ms to lead visemes (positive = earlier)
}) {
  const { setInput, animateValue, faceId } = useVizijRuntime();
  const outputRef = useRef(currentOutput);

  const ALIGN_MAX_RUN_MS = 30;

  useEffect(() => {
    outputRef.current = currentOutput;
  }, [currentOutput]);

  useEffect(() => {
    if (!enabled) return;
    let raf: number;

    const resolvedFaceId = (faceId ?? "face").toLowerCase();
    const visemeBase = `rig/${resolvedFaceId}/visemes`;
    const visemePaths = FACE_VISEME_SEGMENTS.map(
      (segment) => `${visemeBase}/${segment}.weight`,
    );

    let lastFrameCount = -1;
    let lastFeatureCount = -1;
    let lastOutput = "";
    let keyframes: VisemeKeyframe[] = [];
    let activePath: string | null = null;

    const zeroAll = () => {
      visemePaths.forEach((path) => setInput(path, { float: 0 }));
      activePath = null;
    };

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
          {
            durationGuide: textEvents,
          },
        );
        const runtime = performance.now() - started;
        if (aligned.length && runtime <= ALIGN_MAX_RUN_MS) {
          keyframes = aligned.map((evt) => ({
            viseme: PHONEME_TO_VISEME[evt.phoneme as Phoneme],
            start: evt.startTime,
            end: evt.endTime,
          }));
          built = true;
        }
      }

      if (!built) {
        const useSynth = mode === "synth" && frames.length > 0;

        if (useSynth) {
          const synthFrames = synthesizePhonemes(frames, textEvents, 20);
          keyframes = synthFramesToEvents(synthFrames, 0.02);
        } else {
          keyframes = baseline.events.map((evt) => ({
            viseme: PHONEME_TO_VISEME[evt.phoneme as Phoneme],
            start: evt.startTime,
            end: evt.endTime,
          }));
        }
      }

      lastFrameCount = frames.length;
      lastFeatureCount = features.length;
      lastOutput = text;
    };

    const animateSwitch = (nextPath: string | null) => {
      const dur = Math.max(transitionMs / 1000, 0.01);
      if (activePath && activePath !== nextPath) {
        void animateValue(activePath, { float: 0 }, { duration: dur });
      }
      if (nextPath && nextPath !== activePath) {
        void animateValue(nextPath, { float: 1 }, { duration: dur });
      }
      activePath = nextPath;
    };

    const tick = () => {
      const frames = audioManager.getPhonemeFrames();
      const features = audioManager.getFeatureFrames();
      if (
        frames.length !== lastFrameCount ||
        features.length !== lastFeatureCount ||
        outputRef.current !== lastOutput
      ) {
        rebuildKeyframes();
      }

      const playback = audioManager.getPlaybackState();
      const t = playback.played + leadMs / 1000;
      const idx = findKeyframeIndex(keyframes, t);
      const viseme = idx >= 0 ? keyframes[idx].viseme : "sil";
      const targetSegment = mapPollyViseme(viseme)?.segment ?? null;
      const nextPath = targetSegment
        ? `${visemeBase}/${targetSegment}.weight`
        : null;
      animateSwitch(nextPath);

      raf = requestAnimationFrame(tick);
    };

    rebuildKeyframes();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      zeroAll();
    };
  }, [
    animateValue,
    audioManager,
    enabled,
    faceId,
    leadMs,
    mode,
    setInput,
    transitionMs,
  ]);
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

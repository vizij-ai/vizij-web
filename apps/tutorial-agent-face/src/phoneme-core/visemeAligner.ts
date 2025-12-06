import type { FeatureFrame, PhonemeProbFrame, PhonemeEvent } from "./types";
import { classifyViseme } from "./visemeClassifier";
import { LOCAL_TO_POLLY_FALLBACK, PollyMouthShapeId } from "./mouthShapes";
import {
  PHONEME_CLASS,
  PHONEME_DURATION_PRIORS,
  PHONEME_TO_VISEME,
  Phoneme,
} from "./phonemes";

export interface AlignerConfig {
  beamWidth?: number;
  stayCost?: number;
  advanceCost?: number;
  durationPrior?: number; // penalty weight for deviating from expected duration
  hopMs?: number; // optional downsample hop in ms (relative to cached feature hop ~20ms)
  durationGuide?: PhonemeEvent[];
  minDurFactor?: number;
  maxDurFactor?: number;
}

const DEFAULTS: Required<AlignerConfig> = {
  beamWidth: 64,
  stayCost: 0.18,
  advanceCost: 0.24,
  durationPrior: 0.08,
  hopMs: 20,
  durationGuide: [],
  minDurFactor: 0.5,
  maxDurFactor: 2,
};

function phonemeToVisemeId(ph: Phoneme): PollyMouthShapeId {
  const v = PHONEME_TO_VISEME[ph];
  return (v as PollyMouthShapeId) || "sil";
}

function emissionCost(
  frame: FeatureFrame,
  target: PollyMouthShapeId,
  phoneme: Phoneme,
  probLookup?: (time: number, phoneme: Phoneme) => number,
): number {
  const prob = probLookup ? probLookup(frame.time, phoneme) : 0;
  const negLogProb = -Math.log(Math.max(prob, 1e-6));

  // fallback classifier agreement bonus
  const predicted = classifyViseme(frame.features, "").id;
  const predPolly = LOCAL_TO_POLLY_FALLBACK[predicted] ?? "sil";
  const agreeBonus = predPolly === target ? -0.4 : 0;

  // voicing cue
  const voicedTarget = !["s", "S", "T", "f", "p", "t", "k"].includes(target);
  const voicedFrame =
    (frame.features.harmonicRatio ?? 0) > 0.35 && frame.features.rms > 0.01;
  const voicingPenalty = voicedTarget === voicedFrame ? 0 : 0.2;

  return negLogProb + voicingPenalty + agreeBonus;
}

function expectedDurationFrames(phoneme: Phoneme, frameSec: number): number {
  const cls = PHONEME_CLASS[phoneme] || "vowel";
  const prior = PHONEME_DURATION_PRIORS[cls];
  const meanMs = (prior.min + prior.max) / 2;
  return Math.max(1, Math.round(meanMs / 1000 / frameSec));
}

export function alignVisemes(
  featureFrames: FeatureFrame[],
  phonemeProbFrames: PhonemeProbFrame[],
  phonemes: Phoneme[],
  phonemeWordIdx: number[],
  config?: AlignerConfig,
): { events: PhonemeEvent[]; bestVisemeAt: (t: number) => PollyMouthShapeId } {
  const cfg = { ...DEFAULTS, ...config };
  if (!phonemes.length || featureFrames.length < 2) {
    return {
      events: [],
      bestVisemeAt: () => "sil",
    };
  }

  const targetVisemes = phonemes.map(phonemeToVisemeId);
  // Build probability lookup from dense phoneme prob frames
  const probLookup = (time: number, ph: Phoneme) => {
    if (!phonemeProbFrames.length) return 0;
    // binary search nearest frame
    let lo = 0,
      hi = phonemeProbFrames.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (phonemeProbFrames[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo;
    const f = phonemeProbFrames[idx];
    return f.smoothProbs?.[ph] ?? f.probs[ph] ?? 0;
  };
  type BeamState = {
    idx: number;
    score: number;
    back: number | null;
    dur: number;
  };

  // Downsample frames for alignment speed if requested
  const hopFrames = Math.max(1, Math.round(cfg.hopMs / 20));
  const framesForAlign = featureFrames.filter((_, i) => i % hopFrames === 0);
  if (framesForAlign.length < 2) {
    return {
      events: [],
      bestVisemeAt: () => "sil",
    };
  }

  let beam: BeamState[] = [{ idx: 0, score: 0, back: null, dur: 0 }];
  const beamHistory: BeamState[][] = [];

  // Build expected duration (in frames) per phoneme using guide if provided
  const frameHopSec =
    featureFrames.length >= 2
      ? featureFrames[1].time - featureFrames[0].time
      : 0.02;
  const alignFrameSec = frameHopSec * hopFrames;

  const guidedDurSec: number[] = [];
  if (cfg.durationGuide?.length) {
    const findGlobal = (wordIdx: number, phonemeIdx: number) => {
      let seen = 0;
      for (let i = 0; i < phonemeWordIdx.length; i++) {
        if (phonemeWordIdx[i] === wordIdx) {
          if (seen === phonemeIdx) return i;
          seen++;
        }
      }
      return -1;
    };
    cfg.durationGuide.forEach((evt) => {
      if (evt.wordIndex < 0 || evt.phonemeIndex < 0) return;
      const globalIdx = findGlobal(evt.wordIndex, evt.phonemeIndex);
      if (globalIdx < 0) return;
      guidedDurSec[globalIdx] = Math.max(0, evt.endTime - evt.startTime);
    });
  }

  const expectedFramesFor = (phonemeIdx: number) => {
    const guidedSec = guidedDurSec[phonemeIdx];
    if (guidedSec && guidedSec > 0 && alignFrameSec > 0) {
      return guidedSec / alignFrameSec;
    }
    return (
      expectedDurationFrames(phonemes[phonemeIdx] as Phoneme, alignFrameSec) /
      hopFrames
    );
  };

  framesForAlign.forEach((frame) => {
    const next: BeamState[] = [];
    beam.forEach((state, prevIdx) => {
      const stayTarget = targetVisemes[state.idx] || "sil";
      const durStay = state.dur + 1;
      const expStay = expectedFramesFor(state.idx);
      const overStay = Math.max(0, durStay - expStay * cfg.maxDurFactor);
      const underStay = Math.max(0, expStay * cfg.minDurFactor - durStay);
      const durPriorStay = (overStay + underStay) * cfg.durationPrior;
      const stayCost =
        state.score +
        cfg.stayCost +
        durPriorStay +
        emissionCost(
          frame,
          stayTarget,
          phonemes[state.idx] as Phoneme,
          probLookup,
        );
      next.push({
        idx: state.idx,
        score: stayCost,
        back: prevIdx,
        dur: durStay,
      });

      if (state.idx + 1 < targetVisemes.length) {
        const advTarget = targetVisemes[state.idx + 1];
        const expAdv = expectedFramesFor(state.idx);
        const leaveEarly = Math.max(0, expAdv * cfg.minDurFactor - state.dur);
        const durPriorAdv = leaveEarly * cfg.durationPrior;
        const advCost =
          state.score +
          cfg.advanceCost +
          durPriorAdv +
          emissionCost(
            frame,
            advTarget,
            phonemes[state.idx + 1] as Phoneme,
            probLookup,
          );
        next.push({
          idx: state.idx + 1,
          score: advCost,
          back: prevIdx,
          dur: 1,
        });
      }
    });

    // beam prune
    next.sort((a, b) => a.score - b.score);
    const pruned = next.slice(0, cfg.beamWidth);
    beam = pruned;
    beamHistory.push(pruned);
  });

  // Backtrack best path
  const lastBeam = beamHistory[beamHistory.length - 1] ?? [];
  if (!lastBeam.length) {
    return {
      events: [],
      bestVisemeAt: () => "sil",
    };
  }

  let curState = lastBeam.reduce(
    (best, s) => (s.score < best.score ? s : best),
    lastBeam[0],
  );
  const path: number[] = new Array(beamHistory.length).fill(0);
  for (let f = beamHistory.length - 1; f >= 0; f--) {
    path[f] = curState.idx;
    const backIdx = curState.back;
    if (f > 0) {
      const prevBeam = beamHistory[f - 1];
      curState =
        backIdx !== null && prevBeam[backIdx] ? prevBeam[backIdx] : prevBeam[0];
    }
  }

  const phonemeToWord: number[] = phonemeWordIdx;

  // Build events based on downsampled frames
  const events: PhonemeEvent[] = [];
  let currentPhIdx = path[0];
  let startTime = framesForAlign[0].time;
  for (let i = 1; i < path.length; i++) {
    const phIdx = path[i];
    if (phIdx !== currentPhIdx) {
      events.push({
        index: events.length,
        wordIndex: phonemeToWord[currentPhIdx] ?? -1,
        phonemeIndex: currentPhIdx,
        phoneme: phonemes[currentPhIdx],
        startTime,
        endTime: framesForAlign[i].time,
      });
      currentPhIdx = phIdx;
      startTime = framesForAlign[i].time;
    }
  }
  // close last
  const lastIdx = currentPhIdx;
  events.push({
    index: events.length,
    wordIndex: phonemeToWord[lastIdx] ?? -1,
    phonemeIndex: lastIdx,
    phoneme: phonemes[lastIdx],
    startTime,
    endTime: framesForAlign[framesForAlign.length - 1].time,
  });

  const bestVisemeAt = (t: number) => {
    if (!events.length) return "sil";
    let lo = 0;
    let hi = events.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const evt = events[mid];
      if (t < evt.startTime) {
        hi = mid - 1;
      } else if (t > evt.endTime) {
        lo = mid + 1;
      } else {
        return PHONEME_TO_VISEME[evt.phoneme as Phoneme] as PollyMouthShapeId;
      }
    }
    const fallback = events[Math.min(events.length - 1, Math.max(0, lo))];
    return PHONEME_TO_VISEME[fallback.phoneme as Phoneme] as PollyMouthShapeId;
  };

  return { events, bestVisemeAt };
}

import { PhonemeProbFrame } from "./types";
import { Phoneme, PHONEME_TO_VISEME, VisemeId } from "./phonemes";

export interface SynthFrame {
  time: number;
  phoneme: Phoneme;
  viseme: VisemeId;
  probs: Record<Phoneme, number>; // restricted, normalized
  topProb: number;
}

export interface TextPhonemeEvent {
  phoneme: Phoneme;
  startTime: number;
  endTime: number;
}

// Build naive synthesis dense frames by intersecting text window and audio probs
export function synthesizePhonemes(
  audioFrames: PhonemeProbFrame[],
  textEvents: TextPhonemeEvent[],
  windowMs = 250,
): SynthFrame[] {
  const half = windowMs / 1000 / 2; // seconds
  const events = textEvents;

  return audioFrames.map((af) => {
    const t = af.time;
    const windowStart = t - half;
    const windowEnd = t + half;

    const candidates = events
      .filter((ev) => ev.endTime >= windowStart && ev.startTime <= windowEnd)
      .map((ev) => ev.phoneme);

    const candidateSet = Array.from(new Set(candidates)) as Phoneme[];

    let restricted: Record<Phoneme, number> = {} as Record<Phoneme, number>;
    if (candidateSet.length === 0) {
      // fallback to full audio distribution
      restricted =
        (af.smoothProbs as Record<Phoneme, number>) ??
        (af.probs as Record<Phoneme, number>);
    } else {
      let sum = 0;
      candidateSet.forEach((p) => {
        const v = af.smoothProbs?.[p] ?? af.probs[p] ?? 0;
        restricted[p] = v;
        sum += v;
      });
      // renormalize
      const norm = sum > 1e-9 ? sum : 1;
      candidateSet.forEach((p) => {
        restricted[p] = (restricted[p] ?? 0) / norm;
      });
    }

    // pick top
    let top: Phoneme = candidateSet[0] ?? "sil";
    let topProb = -1;
    const keys = candidateSet.length
      ? candidateSet
      : (Object.keys(restricted) as Phoneme[]);
    keys.forEach((p) => {
      const v = restricted[p] ?? 0;
      if (v > topProb) {
        topProb = v;
        top = p;
      }
    });

    const viseme = PHONEME_TO_VISEME[top];
    return {
      time: t,
      phoneme: top,
      viseme,
      probs: restricted,
      topProb,
    };
  });
}

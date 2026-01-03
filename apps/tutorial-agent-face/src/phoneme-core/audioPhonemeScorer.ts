import type { AudioFeatures } from "./types";
import type { Phoneme } from "./phonemes";
import { PHONEMES } from "./phonemes";

// Heuristic scoring -> softmax probability distribution over phonemes
export function scorePhonemeDistribution(
  features: AudioFeatures,
): Record<Phoneme, number> {
  const {
    rms,
    totalEnergy,
    bandLow,
    bandMidLow,
    bandMidHigh,
    bandHigh,
    spectralCentroidHz,
    spectralFlatness,
    zcr,
    harmonicRatio,
    energyDelta,
    centroidDelta,
  } = features;

  const voiced =
    harmonicRatio > 0.35 && bandLow + bandMidLow > 20 && rms > 0.01;
  const highLowRatio = bandHigh / (bandLow + bandMidLow + 1e-6);

  const silenceScore = Math.max(0, 1 - totalEnergy / 20) + (1 - harmonicRatio);

  const fricativeScore = Math.max(
    0,
    highLowRatio * 1.8 + (spectralFlatness - 0.3) * 8 + (zcr - 0.1) * 6,
  );
  const bursty = energyDelta > 0.012 && totalEnergy > 12 && centroidDelta > 200;
  const stopScore = bursty ? 2 + centroidDelta / 400 : 0;

  const vowelish =
    voiced && spectralFlatness < 0.35 && bandMidLow + bandMidHigh > 30;
  const vowelFront = vowelish && bandMidHigh > bandMidLow * 1.2;
  const vowelBack = vowelish && bandMidLow > bandMidHigh * 1.05;

  const approxCue =
    voiced &&
    spectralFlatness < 0.45 &&
    spectralCentroidHz >= 800 &&
    spectralCentroidHz <= 2200;
  const nasalCue =
    voiced && totalEnergy > 8 && bandLow > bandMidHigh * 0.8 && bandHigh < 30;

  const base: Record<Phoneme, number> = Object.fromEntries(
    PHONEMES.map((p) => [p, -4]),
  ) as Record<Phoneme, number>;

  // Silence
  base.sil += silenceScore * 4;

  // Fricatives & affricates
  const bump = (p: Phoneme, v: number) => {
    base[p] = (base[p] ?? -4) + v;
  };
  if (!voiced && fricativeScore > 0.3) {
    bump("f", fricativeScore * 1.1);
    bump("th", fricativeScore * 0.9);
    bump("s", fricativeScore * 1.3);
    bump("sh", fricativeScore * 1.2);
    bump("ch", fricativeScore * 1.0);
  }
  if (voiced && fricativeScore > 0.2) {
    bump("v", fricativeScore * 0.9);
    bump("dh", fricativeScore * 0.8);
    bump("z", fricativeScore * 1.0);
    bump("zh", fricativeScore * 0.9);
    bump("jh", fricativeScore * 0.9);
  }

  // Stops / plosives
  if (stopScore > 0) {
    // place via centroid
    if (spectralCentroidHz < 1500) {
      bump("p", stopScore * 1.2);
      bump("b", stopScore);
    } else if (spectralCentroidHz < 3000) {
      bump("t", stopScore * 1.1);
      bump("d", stopScore);
    } else {
      bump("k", stopScore * 1.1);
      bump("g", stopScore);
    }
  }

  // Nasals & approximants
  if (nasalCue) {
    bump("m", 1.4);
    bump("n", 1.3);
    bump("ng", 1.1);
  }
  if (approxCue) {
    bump("r", 1.2);
    bump("l", 1.1);
    bump("w", 0.8);
    bump("y", 0.8);
  }

  // Vowels
  if (vowelish) {
    if (vowelFront) {
      bump("i", 2.2);
      bump("ih", 2.0);
      bump("e", 1.4);
      bump("ey", 1.6);
    }
    if (vowelBack) {
      bump("u", 2.0);
      bump("uw", 2.0);
      bump("ow", 1.6);
      bump("ao", 1.4);
    }
    bump("ah", 1.5);
    bump("aa", 1.5);
    bump("ax", 1.0);
    bump("uh", 1.0);
    bump("aw", 1.1);
    bump("ay", 1.1);
    bump("oy", 1.0);
  }

  // Voicing bias
  if (voiced) {
    [
      "b",
      "d",
      "g",
      "v",
      "dh",
      "z",
      "zh",
      "jh",
      "r",
      "l",
      "m",
      "n",
      "ng",
      "w",
      "y",
    ].forEach((p) => bump(p as Phoneme, 0.4));
  } else {
    ["p", "t", "k", "f", "th", "s", "sh", "ch", "h"].forEach((p) =>
      bump(p as Phoneme, 0.3),
    );
  }

  // Convert to softmax probabilities
  const logits = PHONEMES.map((p) => base[p]);
  const maxLogit = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - maxLogit));
  const denom = exps.reduce((a, b) => a + b, 1e-9);
  const probs: Record<Phoneme, number> = {} as Record<Phoneme, number>;
  PHONEMES.forEach((p, i) => {
    probs[p] = exps[i] / denom;
  });
  return probs;
}

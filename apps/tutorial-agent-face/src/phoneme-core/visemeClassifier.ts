import { VISEMES, VisemeType } from "./constants";
import { wordToVisemes } from "./wordToViseme";
import { POLLY_VISEME_TO_LOCAL } from "./pollyToLocalVisemes";
import { POLLY_LABELS, PollyMouthShapeId } from "./mouthShapes";
import type { AudioFeatures } from "./types";

// Include silence by using PollyMouthShapeId instead of the narrower PollyVisemeId.
const POLLY_IDS = Object.keys(POLLY_LABELS) as PollyMouthShapeId[];

type ScoreOpts = {
  likely?: PollyMouthShapeId[];
  filter?: PollyMouthShapeId[];
  likelyBoost?: number; // multiplicative boost for likely visemes (default 1.2)
};

function initScoreMap() {
  const m = new Map<PollyMouthShapeId, number>();
  POLLY_IDS.forEach((id) => m.set(id, 0));
  return m;
}

// Return sorted scores (desc) for Polly visemes
export function classifyVisemeScores(
  features: AudioFeatures,
  currentWord: string,
  opts?: ScoreOpts,
): { id: PollyMouthShapeId; score: number }[] {
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

  const highLowRatio = bandHigh / (bandLow + bandMidLow + 1e-6);
  const voiced =
    harmonicRatio > 0.35 && bandLow + bandMidLow > 20 && rms > 0.01;

  const likely = opts?.likely ?? [];
  const filter = opts?.filter ?? null;
  let candidatePolly: PollyMouthShapeId[] = [];
  if (currentWord) {
    candidatePolly = wordToVisemes(currentWord) as PollyMouthShapeId[];
  }
  const isAllowed = (id: PollyMouthShapeId) => !filter || filter.includes(id);
  const isLikely = (id: PollyMouthShapeId) =>
    likely.includes(id) || candidatePolly.includes(id);

  const scores = initScoreMap();
  const bump = (id: PollyMouthShapeId, val: number) => {
    if (!isAllowed(id)) return;
    scores.set(id, (scores.get(id) ?? 0) + val);
  };

  // Silence detection
  const isSilence =
    rms < 0.012 &&
    totalEnergy < 12 &&
    harmonicRatio < 0.2 &&
    bandLow < 15 &&
    bandHigh < 15;
  if (isSilence) bump("sil", 8);
  else bump("sil", -4);

  // Fricatives / sibilants (noise-heavy, high freq)
  const fricativeScore = Math.max(
    0,
    highLowRatio * 2 + (spectralFlatness - 0.3) * 10 + (zcr - 0.1) * 8,
  );
  if (fricativeScore > 0.5 && !voiced) {
    bump("f", fricativeScore * 1.2);
    bump("s", fricativeScore * 1.4);
    bump("S", fricativeScore * 1.1);
    bump("T", fricativeScore * 1.0);
  }

  // Stops / plosives (energy delta, centroid jump)
  const bursty = energyDelta > 0.012 && totalEnergy > 12 && centroidDelta > 200;
  if (bursty) {
    bump("p", 2.2 + centroidDelta / 400);
    bump("t", 2.0 + centroidDelta / 450);
    bump("k", 1.8 + centroidDelta / 500);
  }

  // Vowels / sonorants
  const vowelish =
    voiced && spectralFlatness < 0.35 && bandMidLow + bandMidHigh > 30;
  if (vowelish) {
    const front = bandMidHigh > bandMidLow * 1.2;
    const back = bandMidLow > bandMidHigh * 1.1;
    const open = bandMidLow > 50;

    if (front) {
      bump("i", 2.5);
      bump("e", 2.1);
    }
    if (back) {
      bump("u", 2.2);
      bump("o", 2.0);
      bump("O", 1.8);
    }
    if (open) {
      bump("a", 2.4);
      bump("@", 1.6);
      bump("E", 1.6);
    }
    // Neutral fallback for vowels
    bump("u", 0.6);
    bump("@", 0.6);
  }

  // Liquids / approximants
  const approxCue =
    voiced &&
    spectralFlatness < 0.45 &&
    spectralCentroidHz >= 800 &&
    spectralCentroidHz <= 2200;
  if (approxCue) {
    bump("r", 1.5);
    bump("l", 1.4);
  }

  // General voiced bias
  if (voiced) {
    bump("i", 0.3);
    bump("a", 0.3);
    bump("@", 0.3);
  } else {
    bump("f", 0.2);
    bump("s", 0.2);
    bump("S", 0.2);
    bump("T", 0.2);
  }

  // Apply likely-candidate boost (multiplicative in log domain)
  const boost = Math.log(opts?.likelyBoost ?? 1.2); // default 1.2x
  POLLY_IDS.forEach((id) => {
    if (isLikely(id) && isAllowed(id)) {
      scores.set(id, (scores.get(id) ?? 0) + boost);
    }
    if (!isAllowed(id)) {
      scores.set(id, -Infinity);
    }
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export function pickPollyViseme(
  features: AudioFeatures,
  currentWord: string,
  opts?: ScoreOpts,
): PollyMouthShapeId {
  const scores = classifyVisemeScores(features, currentWord, opts);
  return scores[0]?.id ?? "sil";
}

// Legacy wrapper: returns local viseme id
export function classifyViseme(
  features: AudioFeatures,
  currentWord: string,
): VisemeType {
  const polly = pickPollyViseme(features, currentWord);
  if (polly === "sil") return VISEMES.SIL;

  return POLLY_VISEME_TO_LOCAL[polly] ?? VISEMES.DD;
}

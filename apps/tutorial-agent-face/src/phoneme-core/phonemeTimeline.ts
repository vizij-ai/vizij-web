import { wordToPhonemes } from "./g2p_en";
import { PHONEME_TO_VISEME, type Phoneme } from "./phonemes";
import type { PhonemeEvent, PhonemeTimeline, WordAlignment } from "./types";

export function applyDurationGuide(
  events: PhonemeEvent[],
  guide: PhonemeEvent[],
  opts?: { minFactor?: number; maxFactor?: number },
): PhonemeEvent[] {
  if (!events.length || !guide.length) return events;
  const minFactor = opts?.minFactor ?? 0.5;
  const maxFactor = opts?.maxFactor ?? 1.8;

  const stats = new Map<string, { sum: number; count: number; mean: number }>();
  guide.forEach((g) => {
    const dur = g.endTime - g.startTime;
    const vis = PHONEME_TO_VISEME[g.phoneme as Phoneme];
    const st = stats.get(vis) ?? { sum: 0, count: 0, mean: 0 };
    st.sum += dur;
    st.count += 1;
    st.mean = st.sum / st.count;
    stats.set(vis, st);
  });
  const globalMean =
    Array.from(stats.values()).reduce((acc, s) => acc + s.mean, 0) /
    Math.max(1, stats.size);

  const lengths: { evt: PhonemeEvent; len: number }[] = [];
  events.forEach((evt) => {
    const vis = PHONEME_TO_VISEME[evt.phoneme as Phoneme];
    const target = stats.get(vis)?.mean ?? globalMean;
    const len = evt.endTime - evt.startTime;
    const minLen = target * minFactor;
    const maxLen = target * maxFactor;
    const newLen = Math.min(Math.max(len, minLen), maxLen);
    lengths.push({ evt, len: newLen });
  });

  const start0 = events[0].startTime;
  const targetTotal = guide[guide.length - 1]?.endTime ?? start0;
  const currentTotal = lengths.reduce((acc, l) => acc + l.len, 0);
  const scale = currentTotal > 0 ? targetTotal / currentTotal : 1;

  const normalized: PhonemeEvent[] = [];
  let cursor = start0;
  lengths.forEach(({ evt, len }) => {
    const adjLen = len * scale;
    const startTime = cursor;
    const endTime = startTime + adjLen;
    normalized.push({ ...evt, startTime, endTime });
    cursor = endTime;
  });
  return normalized;
}

type Token = { kind: "word"; text: string } | { kind: "punct"; text: string };

// Relative pause weights for punctuation; higher = longer pause
const PUNCTUATION_WEIGHTS: Record<string, number> = {
  ",": 0.6,
  ";": 0.8,
  ":": 0.8,
  ".": 1.2,
  "!": 1.2,
  "?": 1.2,
};

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Match standalone punctuation or contiguous non-space/non-punct chunks
  const regex = /([.,!?;:])|([^\s.,!?;:]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({ kind: "punct", text: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: "word", text: match[2] });
    }
  }
  return tokens;
}

// Build sparse phoneme timeline (Text Baseline) using total known audio duration.
export function buildPhonemeTimeline(
  text: string,
  totalDuration: number,
): PhonemeTimeline {
  const cleaned = text.trim();
  if (!cleaned || totalDuration <= 0) {
    return { kind: "text", words: [], events: [] };
  }

  const tokens = tokenize(cleaned);
  if (!tokens.length) return { kind: "text", words: [], events: [] };

  const wordData = tokens.map((tok, idx) => {
    if (tok.kind === "word") {
      const phonemes = wordToPhonemes(tok.text);
      const phonemeCount = Math.max(1, phonemes.length);
      return {
        idx,
        kind: "word" as const,
        text: tok.text,
        phonemes,
        phonemeCount,
      };
    }
    const weight = PUNCTUATION_WEIGHTS[tok.text] ?? 0.5;
    return { idx, kind: "punct" as const, text: tok.text, weight };
  });

  const totalWeight = wordData.reduce((acc, item) => {
    if (item.kind === "word") return acc + item.phonemeCount;
    return acc + item.weight;
  }, 0);

  const words: WordAlignment[] = [];
  const events: PhonemeEvent[] = [];

  let cursor = 0;
  let wordIndex = 0;
  let displayIndex = 0;

  for (const item of wordData) {
    if (item.kind === "word") {
      const wordDuration = totalDuration * (item.phonemeCount / totalWeight);
      const startTime = cursor;
      const endTime = cursor + wordDuration;
      cursor = endTime;

      const pCount = Math.max(1, item.phonemes.length);
      const phonemeDuration = (endTime - startTime) / pCount;

      words.push({
        index: displayIndex++,
        text: item.text,
        startTime,
        endTime,
        phonemes: item.phonemes,
        visemes: item.phonemes.map((ph) => PHONEME_TO_VISEME[ph]),
      });

      item.phonemes.forEach((ph, pi) => {
        const pStart = startTime + pi * phonemeDuration;
        const pEnd = pStart + phonemeDuration;
        events.push({
          index: events.length,
          phoneme: ph,
          wordIndex,
          phonemeIndex: pi,
          startTime: pStart,
          endTime: pEnd,
        });
      });

      wordIndex += 1;
    } else {
      const pauseDuration = totalDuration * (item.weight / totalWeight);
      const startTime = cursor;
      const endTime = cursor + pauseDuration;
      cursor = endTime;

      const punctIdx = displayIndex++;
      words.push({
        index: punctIdx,
        text: item.text,
        startTime,
        endTime,
        phonemes: ["sil"],
        visemes: ["sil"],
        isPunct: true,
      });

      events.push({
        index: events.length,
        phoneme: "sil",
        wordIndex: punctIdx,
        phonemeIndex: 0,
        startTime,
        endTime,
      });
    }
  }

  return { kind: "text", words, events };
}

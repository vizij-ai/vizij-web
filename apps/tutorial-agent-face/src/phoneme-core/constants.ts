// Use live model variant that supports function calling; native-audio preview currently
// rejects tool use and closes the websocket with 1011.
export const MODEL_NAME = "gemini-2.0-flash-live-001";

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

// Extended Viseme Map with Formant heuristics
// Ranges are in Hz. Energy checks will be performed in these bands.
export const VISEMES = {
  SIL: { id: "sil", name: "Silence", char: "...", matcher: "" },
  // Vowels
  AH: {
    id: "ah",
    name: "Open Vowel (Ah)",
    char: "Ah",
    ranges: { f1: [700, 1000], f2: [1000, 1500] },
    matcher: "a",
  },
  EE: {
    id: "ee",
    name: "Front Vowel (Ee)",
    char: "Ee",
    ranges: { f1: [200, 500], f2: [2000, 3500] },
    matcher: "eiy",
  },
  OO: {
    id: "oo",
    name: "Back Vowel (Oo)",
    char: "Oo",
    ranges: { f1: [200, 500], f2: [500, 1000] },
    matcher: "u",
  }, // 'u' often makes Oo sound
  OH: {
    id: "oh",
    name: "Mid Vowel (Oh)",
    char: "Oh",
    ranges: { f1: [400, 700], f2: [700, 1200] },
    matcher: "ou",
  },
  // Consonants (Simplified for visuals)
  PP: {
    id: "pp",
    name: "Bilabial (M/B/P)",
    char: "Mm",
    ranges: { f1: [100, 400] },
    matcher: "mbp",
  }, // Low rumble or silence
  SS: {
    id: "ss",
    name: "Sibilant (S/Z)",
    char: "Ss",
    ranges: { high: [4000, 10000] },
    matcher: "szcx",
  },
  FF: {
    id: "ff",
    name: "Labiodental (F/V)",
    char: "Ff",
    ranges: { high: [2500, 5000] },
    matcher: "fv",
  },
  RR: {
    id: "rr",
    name: "Rhotic (R/L)",
    char: "Rr",
    ranges: { f1: [300, 600], f2: [1000, 1500] },
    matcher: "rl",
  },
  DD: {
    id: "dd",
    name: "Dental (T/D)",
    char: "Tt",
    ranges: { high: [2000, 8000] },
    matcher: "tdn",
  }, // Transient/Burst
};

export type VisemeType = (typeof VISEMES)[keyof typeof VISEMES];

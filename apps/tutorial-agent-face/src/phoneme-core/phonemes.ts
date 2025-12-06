// Rich phoneme inventory for scoring and mapping to Polly-style visemes.

export type Phoneme =
  | "p"
  | "b"
  | "m"
  | "t"
  | "d"
  | "n"
  | "k"
  | "g"
  | "ng"
  | "f"
  | "v"
  | "th"
  | "dh"
  | "s"
  | "z"
  | "sh"
  | "zh"
  | "ch"
  | "jh"
  | "h"
  | "r"
  | "l"
  | "w"
  | "y"
  // vowels & diphthongs
  | "i"
  | "ih"
  | "e"
  | "ey"
  | "eh"
  | "ax"
  | "uh"
  | "ah"
  | "aa"
  | "ao"
  | "ow"
  | "u"
  | "uw"
  | "oy"
  | "ay"
  | "aw"
  | "sil";

export const PHONEMES: Phoneme[] = [
  "p",
  "b",
  "m",
  "t",
  "d",
  "n",
  "k",
  "g",
  "ng",
  "f",
  "v",
  "th",
  "dh",
  "s",
  "z",
  "sh",
  "zh",
  "ch",
  "jh",
  "h",
  "r",
  "l",
  "w",
  "y",
  "i",
  "ih",
  "e",
  "ey",
  "eh",
  "ax",
  "uh",
  "ah",
  "aa",
  "ao",
  "ow",
  "u",
  "uw",
  "oy",
  "ay",
  "aw",
  "sil",
];

// Map rich phonemes to Polly-style viseme IDs (mouth shapes later use viseme).
export type VisemeId =
  | "p"
  | "t"
  | "S"
  | "T"
  | "f"
  | "k"
  | "i"
  | "l"
  | "r"
  | "s"
  | "u"
  | "@"
  | "a"
  | "e"
  | "E"
  | "o"
  | "O"
  | "sil";

export const PHONEME_TO_VISEME: Record<Phoneme, VisemeId> = {
  p: "p",
  b: "p",
  m: "p",
  t: "t",
  d: "t",
  n: "t",
  k: "k",
  g: "k",
  ng: "k",
  f: "f",
  v: "f",
  th: "T",
  dh: "T",
  s: "s",
  z: "s",
  sh: "S",
  zh: "S",
  ch: "S",
  jh: "S",
  h: "k",
  r: "r",
  l: "l",
  w: "u",
  y: "i",
  i: "i",
  ih: "i",
  e: "e",
  ey: "e",
  eh: "E",
  ax: "@",
  uh: "@",
  ah: "a",
  aa: "a",
  ao: "O",
  ow: "o",
  u: "u",
  uw: "u",
  oy: "O",
  ay: "a",
  aw: "a",
  sil: "sil",
};

// Class labels used for scoring/priors
export type PhonemeClass =
  | "stop"
  | "nasal"
  | "fricative"
  | "affricate"
  | "approximant"
  | "vowel"
  | "silence";

export const PHONEME_CLASS: Record<Phoneme, PhonemeClass> = {
  p: "stop",
  b: "stop",
  m: "nasal",
  t: "stop",
  d: "stop",
  n: "nasal",
  k: "stop",
  g: "stop",
  ng: "nasal",
  f: "fricative",
  v: "fricative",
  th: "fricative",
  dh: "fricative",
  s: "fricative",
  z: "fricative",
  sh: "fricative",
  zh: "fricative",
  ch: "affricate",
  jh: "affricate",
  h: "fricative",
  r: "approximant",
  l: "approximant",
  w: "approximant",
  y: "approximant",
  i: "vowel",
  ih: "vowel",
  e: "vowel",
  ey: "vowel",
  eh: "vowel",
  ax: "vowel",
  uh: "vowel",
  ah: "vowel",
  aa: "vowel",
  ao: "vowel",
  ow: "vowel",
  u: "vowel",
  uw: "vowel",
  oy: "vowel",
  ay: "vowel",
  aw: "vowel",
  sil: "silence",
};

// Duration priors (ms) per class
export const PHONEME_DURATION_PRIORS: Record<
  PhonemeClass,
  { min: number; max: number }
> = {
  vowel: { min: 80, max: 240 },
  fricative: { min: 60, max: 180 },
  affricate: { min: 60, max: 160 },
  stop: { min: 40, max: 120 },
  nasal: { min: 70, max: 180 },
  approximant: { min: 70, max: 180 },
  silence: { min: 60, max: 300 },
};

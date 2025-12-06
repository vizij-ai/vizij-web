// Amazon Polly en-US phoneme -> viseme map (X-SAMPA)
export type PollyVisemeId =
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
  | "O";

export type PollyPhoneme =
  // Consonants
  | "b"
  | "d"
  | "dZ"
  | "D"
  | "f"
  | "g"
  | "h"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "N"
  | "p"
  | "r\\"
  | "s"
  | "S"
  | "t"
  | "tS"
  | "T"
  | "v"
  | "w"
  | "z"
  | "Z"
  // Vowels/diphthongs
  | "@"
  | "@`"
  | "{"
  | "aI"
  | "aU"
  | "A"
  | "eI"
  | "3`"
  | "E"
  | "i"
  | "I"
  | "oU"
  | "O"
  | "OI"
  | "u"
  | "U"
  | "V";

export const PHONEME_TO_POLLY_VISEME: Record<PollyPhoneme, PollyVisemeId> = {
  b: "p",
  m: "p",
  p: "p",

  d: "t",
  t: "t",
  n: "t",

  dZ: "S",
  Z: "S",
  S: "S",
  tS: "S",

  D: "T",
  T: "T",

  f: "f",
  v: "f",

  g: "k",
  h: "k",
  k: "k",
  N: "k",

  j: "i",
  l: "l",
  "r\\": "r",
  s: "s",
  z: "s",
  w: "u",

  "@": "@",
  "@`": "@",

  "{": "a",
  aI: "a",
  aU: "a",
  A: "a",

  eI: "e",

  "3`": "E",
  E: "E",
  V: "E",

  i: "i",
  I: "i",

  oU: "o",

  O: "O",
  OI: "O",

  u: "u",
  U: "u",
};

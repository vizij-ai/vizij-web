import type { VisemeType } from "./constants";
import type { VisemeId } from "./phonemes";

export type PollyMouthShapeId = VisemeId | "sil";

export const POLLY_LABELS: Record<
  PollyMouthShapeId,
  { char: string; name: string }
> = {
  sil: { char: ".", name: "Silence" },
  p: { char: "P", name: "Bilabial (P/B/M)" },
  t: { char: "T", name: "Alveolar (T/D/N)" },
  S: { char: "SH", name: "Postalveolar (SH/CH/J)" },
  T: { char: "TH", name: "Dental (TH)" },
  f: { char: "F", name: "Labiodental (F/V)" },
  k: { char: "K", name: "Velar (K/G/NG/H)" },
  i: { char: "I", name: "High Front (EE)" },
  e: { char: "E", name: "Mid-Front (AY)" },
  E: { char: "EH", name: "Mid (EH/ER)" },
  a: { char: "A", name: "Open (AH)" },
  "@": { char: "@", name: "Schwa (UH)" },
  o: { char: "O", name: "Mid Back (OH)" },
  O: { char: "AW", name: "Open Back (AW)" },
  u: { char: "U", name: "High Back (OO)" },
  l: { char: "L", name: "Lateral (L)" },
  r: { char: "R", name: "Rhotic (R)" },
  s: { char: "S", name: "Sibilant (S/Z)" },
};

export const getPollyMouthShape = (id: PollyMouthShapeId) => {
  switch (id) {
    case "sil":
      return { w: "24%", h: "4%", r: "999px" };
    case "p":
      return { w: "60%", h: "8%", r: "6px" };
    case "t":
      return { w: "60%", h: "16%", r: "10px" };
    case "s":
      return { w: "75%", h: "10%", r: "4px" };
    case "S":
      return { w: "80%", h: "12%", r: "4px" };
    case "T":
      return { w: "68%", h: "9%", r: "4px" };
    case "f":
      return { w: "62%", h: "18%", r: "12px" };
    case "k":
      return { w: "52%", h: "24%", r: "30%" };
    case "r":
      return { w: "58%", h: "28%", r: "32%" };
    case "l":
      return { w: "62%", h: "30%", r: "30%" };
    case "i":
      return { w: "82%", h: "26%", r: "12px" };
    case "e":
      return { w: "75%", h: "32%", r: "18px" };
    case "E":
      return { w: "65%", h: "36%", r: "22px" };
    case "a":
      return { w: "70%", h: "60%", r: "40%" };
    case "@":
      return { w: "55%", h: "34%", r: "24px" };
    case "o":
      return { w: "54%", h: "42%", r: "40%" };
    case "O":
      return { w: "46%", h: "50%", r: "50%" };
    case "u":
      return { w: "36%", h: "32%", r: "50%" };
    default:
      return { w: "50%", h: "30%", r: "20px" };
  }
};

export const LOCAL_TO_POLLY_FALLBACK: Record<
  VisemeType["id"],
  PollyMouthShapeId
> = {
  sil: "sil",
  ah: "a",
  ee: "i",
  oo: "u",
  oh: "o",
  ss: "s",
  ff: "f",
  pp: "p",
  rr: "r",
  dd: "t",
};
